(() => {
  const STORE_KEY = "__prism_intelligent_extract_v1__";
  const MAX_ITEMS_PER_TYPE = 8;
  const QUIET_DOM_MS = 900;
  const QUIET_NETWORK_MS = 350;
  const NETWORK_NOISE_BYPASS_MS = 3200;

  const COPY_HINT_RE = /(copy|duplicate|복사|clippy|clipboard|code-copy|copy-button)/i;
  const SEND_HINT_RE = /(send|submit|전송|보내기|ask|run|generate|continue)/i;
  const STOP_HINT_RE = /(stop|중지|halt|cancel)/i;
  const NETWORK_PROBE_SCRIPT_ID = "prism-network-probe-main";
  const NETWORK_PROBE_SCRIPT_PATH = "content/bridges/network-probe-main.js";
  const CODE_BLOCK_MIN_CHARS = 12;
  const COPY_CONTROL_SELECTOR =
    "button,[role='button'],[aria-label*='copy' i],[aria-label*='복사'],[data-testid*='copy' i],[class*='copy' i]";
  const STOP_CONTROL_SELECTOR =
    "button[aria-label*='stop' i], button[aria-label*='중지'], [data-testid*='stop' i], button[class*='stop' i]";
  const ASSISTANT_CONTAINER_SELECTORS = [
    "[data-message-author-role='assistant']",
    "article",
    ".markdown",
    ".prose",
    "[data-testid*='assistant']",
    "[class*='assistant']",
    "main",
  ];

  const ASSISTANT_CONTAINER_CACHE_TTL_MS = 250;
  let assistantContainerCacheAt = 0;
  let assistantContainerCache = [];


  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function normalizeSpace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function lower(value) {
    return normalizeSpace(value).toLowerCase();
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (!style) return true;
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function collectSearchRoots(root = document) {
    const roots = [];
    const queue = [root];
    const seen = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || seen.has(current)) continue;
      seen.add(current);
      roots.push(current);

      let walker = null;
      try {
        walker = document.createTreeWalker(current, NodeFilter.SHOW_ELEMENT);
      } catch (err) {
        walker = null;
      }
      if (!walker) continue;

      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node && node.shadowRoot) queue.push(node.shadowRoot);
      }
    }

    return roots;
  }

  function querySelectorAllDeep(selector, root = document, precomputedRoots = null) {
    const results = [];
    const seen = new Set();
    const roots = Array.isArray(precomputedRoots) ? precomputedRoots : collectSearchRoots(root);

    for (const searchRoot of roots) {
      let nodeList = [];
      try {
        nodeList = searchRoot.querySelectorAll(selector);
      } catch (err) {
        nodeList = [];
      }
      nodeList.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (seen.has(node)) return;
        seen.add(node);
        results.push(node);
      });
    }

    return results;
  }

  function getInteractiveRoot(el) {
    if (!el || !(el instanceof Element)) return null;
    return (
      el.closest(
        "button, [role='button'], textarea, input, [contenteditable='true'], [aria-label], [data-testid], [class*='copy'], [class*='send']"
      ) || el
    );
  }

  function getElementHintText(el) {
    if (!el || !(el instanceof Element)) return "";
    const chunks = [
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("name"),
      el.getAttribute("data-testid"),
      el.className,
      el.textContent,
    ];
    return lower(chunks.filter(Boolean).join(" "));
  }

  function looksLikeCopyControl(el) {
    const hint = getElementHintText(el);
    return COPY_HINT_RE.test(hint);
  }

  function looksLikeSendControl(el) {
    const hint = getElementHintText(el);
    if (STOP_HINT_RE.test(hint)) return false;
    return SEND_HINT_RE.test(hint);
  }

  function looksLikeStopControl(el) {
    return STOP_HINT_RE.test(getElementHintText(el));
  }

  function looksLikeInputControl(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.matches("textarea,input")) return true;
    if (el.getAttribute("contenteditable") === "true") return true;
    const role = lower(el.getAttribute("role"));
    return role === "textbox";
  }

  function sanitizeClassTokens(className) {
    return String(className || "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => /^[a-zA-Z][a-zA-Z0-9_-]{1,40}$/.test(token))
      .slice(0, 3);
  }

  function fingerprintElement(el) {
    if (!el || !(el instanceof Element)) return null;
    const tag = lower(el.tagName);
    if (!tag) return null;

    const role = lower(el.getAttribute("role"));
    const ariaLabel = lower(el.getAttribute("aria-label"));
    const title = lower(el.getAttribute("title"));
    const name = lower(el.getAttribute("name"));
    const type = lower(el.getAttribute("type"));
    const dataTestId = lower(el.getAttribute("data-testid"));
    const id = lower(el.id);
    const classTokens = sanitizeClassTokens(el.className);
    const textHint = lower(el.textContent).slice(0, 48);

    return { tag, role, ariaLabel, title, name, type, dataTestId, id, classTokens, textHint };
  }

  function fingerprintKey(fp) {
    if (!fp) return "";
    return [
      fp.tag,
      fp.role,
      fp.ariaLabel,
      fp.title,
      fp.name,
      fp.type,
      fp.dataTestId,
      fp.id,
      (fp.classTokens || []).join("."),
      fp.textHint,
    ].join("|");
  }

  function selectorsFromFingerprint(fp) {
    if (!fp || !fp.tag) return [];
    const selectors = [];
    const tag = cssEscape(fp.tag);

    if (fp.id) selectors.push(`#${cssEscape(fp.id)}`);
    if (fp.dataTestId) selectors.push(`[data-testid="${cssEscape(fp.dataTestId)}"]`);
    if (fp.ariaLabel) selectors.push(`${tag}[aria-label*="${cssEscape(fp.ariaLabel)}"]`);
    if (fp.title) selectors.push(`${tag}[title*="${cssEscape(fp.title)}"]`);
    if (fp.name) selectors.push(`${tag}[name="${cssEscape(fp.name)}"]`);
    if (fp.type) selectors.push(`${tag}[type="${cssEscape(fp.type)}"]`);
    if (fp.role) selectors.push(`${tag}[role="${cssEscape(fp.role)}"]`);
    if (Array.isArray(fp.classTokens) && fp.classTokens.length > 0) {
      selectors.push(`${tag}.${fp.classTokens.map(cssEscape).join(".")}`);
      selectors.push(`.${cssEscape(fp.classTokens[0])}`);
    }
    selectors.push(tag);

    const deduped = [];
    const seen = new Set();
    selectors.forEach((selector) => {
      if (!selector || seen.has(selector)) return;
      seen.add(selector);
      deduped.push(selector);
    });
    return deduped;
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { hosts: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { hosts: {} };
      if (!parsed.hosts || typeof parsed.hosts !== "object") return { hosts: {} };
      return parsed;
    } catch (err) {
      return { hosts: {} };
    }
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (err) {
      // Ignore storage write failures on restricted origins.
    }
  }

  function ensureHostBucket(store, host) {
    if (!store.hosts[host]) {
      store.hosts[host] = {
        copyButtons: [],
        sendButtons: [],
        inputs: [],
        updatedAt: Date.now(),
      };
    }
    return store.hosts[host];
  }

  function upsertLearning(bucket, type, fp, delta) {
    if (!bucket || !type || !fp) return;
    const key = fingerprintKey(fp);
    if (!key) return;
    if (!Array.isArray(bucket[type])) bucket[type] = [];

    const now = Date.now();
    const list = bucket[type];
    const index = list.findIndex((item) => item && item.key === key);
    if (index >= 0) {
      list[index].score = Math.min(100, (Number(list[index].score) || 0) + delta);
      list[index].lastSeenAt = now;
      list[index].fp = fp;
    } else {
      list.push({ key, fp, score: Math.max(1, delta), lastSeenAt: now });
    }

    list.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || (Number(b.lastSeenAt) || 0) - (Number(a.lastSeenAt) || 0));
    bucket[type] = list.slice(0, MAX_ITEMS_PER_TYPE);
    bucket.updatedAt = now;
  }

  function findByFingerprint(fp, precomputedRoots = null) {
    if (!fp) return null;
    const selectors = selectorsFromFingerprint(fp);
    for (const selector of selectors) {
      const nodeList = querySelectorAllDeep(selector, document, precomputedRoots);
      for (const node of nodeList) {
        if (!isVisible(node)) continue;
        return node;
      }
    }
    return null;
  }

  function collectCandidates(type, precomputedRoots = null) {
    const roots = Array.isArray(precomputedRoots) ? precomputedRoots : null;
    let selectors = [];
    if (type === "copyButtons") {
      selectors = [
        ".copy-button",
        "[aria-label*='copy' i]",
        "[aria-label*='복사']",
        "button[data-testid*='copy' i]",
        "button[class*='copy' i]",
        "[data-tooltip*='copy' i]",
      ];
    } else if (type === "sendButtons") {
      selectors = [
        ".send-button",
        "button[data-testid*='send' i]",
        "button[aria-label*='send' i]",
        "button[aria-label*='전송']",
        "button[aria-label*='보내기']",
        "button[class*='submit' i]",
        "button[class*='send' i]",
        "button[type='submit']",
      ];
    } else if (type === "inputs") {
      selectors = [
        "#prompt-textarea",
        ".ProseMirror",
        ".ql-editor",
        "textarea[placeholder*='Ask' i]",
        "textarea[name*='prompt' i]",
        "textarea[placeholder*='prompt' i]",
        "textarea[aria-label*='prompt' i]",
        "textarea",
        "div[contenteditable='true']",
        "[contenteditable='true'][role='textbox']",
      ];
    }

    const merged = [];
    const seen = new Set();
    selectors.forEach((selector) => {
      const nodeList = querySelectorAllDeep(selector, document, roots);
      nodeList.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (!isVisible(node)) return;
        if (seen.has(node)) return;
        seen.add(node);
        merged.push(node);
      });
    });

    if (type === "copyButtons") {
      const preNodes = querySelectorAllDeep("pre", document, roots);
      preNodes.forEach((preNode) => {
        const nearby = findNearbyCopyButton(preNode);
        if (!nearby || seen.has(nearby) || !isVisible(nearby)) return;
        seen.add(nearby);
        merged.push(nearby);
      });
    }

    return merged;
  }

  function scoreCandidate(type, el) {
    let score = 0;
    const hint = getElementHintText(el);
    if (isVisible(el)) score += 10;

    if (type === "copyButtons") {
      if (looksLikeCopyControl(el)) score += 20;
      if (el.matches("button,[role='button']")) score += 6;
      if (hint.includes("code")) score += 4;
    } else if (type === "sendButtons") {
      if (looksLikeSendControl(el)) score += 20;
      if (el.matches("button,[role='button']")) score += 6;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") score += 2;
      if (looksLikeStopControl(el)) score -= 20;
    } else if (type === "inputs") {
      if (looksLikeInputControl(el)) score += 18;
      if (el.matches("textarea")) score += 6;
      if (el.matches("[contenteditable='true']")) score += 5;
      if (hint.includes("prompt")) score += 4;
    }

    return score;
  }

  function scoreCopyControlCandidate(el) {
    if (!el || !(el instanceof Element)) return -Infinity;
    let score = 0;
    if (isVisible(el)) score += 8;
    if (el.matches("button,[role='button']")) score += 6;
    if (looksLikeCopyControl(el)) score += 20;
    if (el.querySelector("svg")) score += 2;
    return score;
  }

  function findNearbyCopyButton(preEl) {
    if (!preEl || !(preEl instanceof Element)) return null;

    const scopes = [
      preEl,
      preEl.parentElement,
      preEl.parentElement?.parentElement,
      preEl.parentElement?.parentElement?.parentElement,
    ].filter(Boolean);

    let best = null;
    let bestScore = -Infinity;

    scopes.forEach((scope) => {
      let candidates = [];
      try {
        candidates = scope.querySelectorAll(COPY_CONTROL_SELECTOR);
      } catch (err) {
        candidates = [];
      }

      candidates.forEach((candidate) => {
        if (!(candidate instanceof Element)) return;
        const score = scoreCopyControlCandidate(candidate);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      });
    });

    if (best) return best;

    const siblingButtons = [preEl.previousElementSibling, preEl.nextElementSibling].filter(
      (node) => node instanceof Element
    );
    for (const node of siblingButtons) {
      if (!node.matches("button,[role='button']")) continue;
      if (!isVisible(node)) continue;
      return node;
    }

    return null;
  }

  function scoreCodeBlockCandidate(preEl, index = 0) {
    if (!preEl || !(preEl instanceof Element) || !isVisible(preEl)) return -Infinity;
    let score = 0;

    if (lower(preEl.tagName) === "pre") score += 20;
    const codeNode = preEl.querySelector("code");
    if (codeNode) score += 18;

    const rawText = String(codeNode?.innerText || preEl.innerText || preEl.textContent || "").trim();
    if (rawText.length >= CODE_BLOCK_MIN_CHARS) score += 8;
    if (/\n/.test(rawText)) score += 7;
    if (/[{}[\]();<>]/.test(rawText)) score += 4;

    const style = window.getComputedStyle(preEl);
    const family = lower(style.fontFamily);
    if (
      family.includes("mono") ||
      family.includes("consolas") ||
      family.includes("courier") ||
      family.includes("menlo") ||
      family.includes("fira")
    ) {
      score += 12;
    }
    const overflowX = lower(style.overflowX);
    if (overflowX.includes("auto") || overflowX.includes("scroll")) score += 6;

    if (findNearbyCopyButton(preEl)) score += 20;
    score += Math.min(5, index / 50);

    return score;
  }

  function extractCodeBlockTextCandidate() {
    const pres = querySelectorAllDeep("pre");
    if (pres.length === 0) return "";

    let bestText = "";
    let bestScore = -Infinity;
    for (let i = 0; i < pres.length; i += 1) {
      const pre = pres[i];
      const codeNode = pre.querySelector("code");
      const text = String(codeNode?.innerText || pre.innerText || pre.textContent || "").trim();
      if (!text || text.length < CODE_BLOCK_MIN_CHARS) continue;
      const score = scoreCodeBlockCandidate(pre, i);
      if (score > bestScore) {
        bestScore = score;
        bestText = text;
      }
    }

    return bestText;
  }

  function collectAssistantContainers() {
    const now = Date.now();
    if (assistantContainerCacheAt && now - assistantContainerCacheAt < ASSISTANT_CONTAINER_CACHE_TTL_MS) {
      return assistantContainerCache;
    }

    const roots = collectSearchRoots(document);
    const merged = [];
    const seen = new Set();
    ASSISTANT_CONTAINER_SELECTORS.forEach((selector) => {
      const nodes = querySelectorAllDeep(selector, document, roots);
      nodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (seen.has(node)) return;
        seen.add(node);
        merged.push(node);
      });
    });

    assistantContainerCache = merged;
    assistantContainerCacheAt = now;
    return merged;
  }

  function scoreAssistantContainer(node, index = 0) {
    if (!node || !(node instanceof Element)) return -Infinity;
    let score = 0;
    if (isVisible(node)) score += 8;

    const hint = getElementHintText(node);
    if (/(assistant|model|response|reply|gemini|claude|chatgpt)/i.test(hint)) score += 10;
    if (/(sidebar|drawer|history|menu|nav|탐색|메뉴|사이드바)/i.test(hint)) score -= 18;

    const preCount = node.querySelectorAll("pre").length;
    const codeCount = node.querySelectorAll("code").length;
    if (preCount > 0) score += Math.min(18, preCount * 6);
    if (codeCount > 0) score += Math.min(12, codeCount * 3);
    if (node.querySelector("prism-patches, prism-patch")) score += 30;

    const text = String(node.innerText || "").trim();
    if (text.length > 40) score += 4;
    if (/```|<\s*prism-patches?\b|<\/?(html|div|section|main|script|style)\b|import\s+.*\s+from|export\s+default|function\s+\w+|class\s+\w+/i.test(text)) {
      score += 16;
    }

    score += Math.min(6, index / 60);
    return score;
  }

  function installNetworkProbe() {
    if (window.__prismNetworkProbeInstalled) return;
    window.__prismNetworkProbeInstalled = true;

    if (document.getElementById(NETWORK_PROBE_SCRIPT_ID)) return;

    const mountTarget = document.documentElement || document.head || document.body;
    if (!mountTarget) return;

    let scriptUrl = "";
    try {
      scriptUrl =
        chrome && chrome.runtime && typeof chrome.runtime.getURL === "function"
          ? chrome.runtime.getURL(NETWORK_PROBE_SCRIPT_PATH)
          : "";
    } catch (err) {
      scriptUrl = "";
    }
    if (!scriptUrl) return;

    const script = document.createElement("script");
    script.id = NETWORK_PROBE_SCRIPT_ID;
    script.src = scriptUrl;
    script.async = false;
    script.type = "text/javascript";
    const removeScript = () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    script.addEventListener("load", removeScript, { once: true });
    script.addEventListener("error", removeScript, { once: true });
    try {
      mountTarget.appendChild(script);
    } catch (err) {
      // Ignore script injection failures on restricted pages.
    }
  }

  function create(options = {}) {
    const host = options.host || window.location.host || "unknown-host";
    const store = loadStore();
    const bucket = ensureHostBucket(store, host);
    let inFlightRequests = 0;
    let lastNetworkAt = 0;
    let lastMutationAt = Date.now();
    let generationArmed = false;
    let lastSubmitAt = 0;
    let generationStartAt = 0;

    installNetworkProbe();
    document.addEventListener(
      "prism-net-activity",
      (event) => {
        const detail = event?.detail || {};
        const delta = Number(detail.delta);
        if (!Number.isFinite(delta) || delta === 0) return;
        inFlightRequests = Math.max(0, inFlightRequests + delta);
        lastNetworkAt = Date.now();
      },
      true
    );

    document.addEventListener(
      "click",
      (event) => {
        const root = getInteractiveRoot(event.target);
        if (!root) return;
        if (looksLikeCopyControl(root)) upsertLearning(bucket, "copyButtons", fingerprintElement(root), 2);
        if (looksLikeSendControl(root)) {
          upsertLearning(bucket, "sendButtons", fingerprintElement(root), 2);
          generationArmed = true;
          lastSubmitAt = Date.now();
        }
        if (looksLikeInputControl(root)) upsertLearning(bucket, "inputs", fingerprintElement(root), 1);
        saveStore(store);
      },
      true
    );

    document.addEventListener(
      "focusin",
      (event) => {
        const root = getInteractiveRoot(event.target);
        if (!root || !looksLikeInputControl(root)) return;
        upsertLearning(bucket, "inputs", fingerprintElement(root), 1);
        saveStore(store);
      },
      true
    );

    function learn(type, element, delta = 1) {
      const fp = fingerprintElement(element);
      if (!fp) return;
      upsertLearning(bucket, type, fp, delta);
      saveStore(store);
    }

    function findBest(type) {
      const candidates = [];
      const seen = new Set();
      const learned = Array.isArray(bucket[type]) ? bucket[type] : [];
      const searchRoots = collectSearchRoots(document);

      learned.forEach((entry) => {
        if (!entry || !entry.fp) return;
        const element = findByFingerprint(entry.fp, searchRoots);
        if (!element || seen.has(element)) return;
        seen.add(element);
        candidates.push({
          element,
          score: scoreCandidate(type, element) + Math.min(50, (Number(entry.score) || 0) * 3),
        });
      });

      collectCandidates(type, searchRoots).forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);
        candidates.push({ element, score: scoreCandidate(type, element) });
      });

      candidates.sort((a, b) => b.score - a.score);
      return candidates.length > 0 ? candidates[0].element : null;
    }

    function hasStopControl() {
      const candidates = querySelectorAllDeep(STOP_CONTROL_SELECTOR);
      for (const candidate of candidates) {
        if (!isVisible(candidate)) continue;
        if (!looksLikeStopControl(candidate) && !STOP_HINT_RE.test(getElementHintText(candidate))) continue;
        return true;
      }
      return false;
    }

    function noteMutation() {
      lastMutationAt = Date.now();
      assistantContainerCacheAt = 0;
      assistantContainerCache = [];
    }

    function noteSubmitAttempt(payload = {}) {
      generationArmed = true;
      lastSubmitAt = Date.now();
      generationStartAt = lastSubmitAt;
      if (payload.sendButton) learn("sendButtons", payload.sendButton, 2);
      if (payload.input) learn("inputs", payload.input, 1);
    }

    function noteGenerationStart() {
      generationArmed = true;
      if (!generationStartAt) {
        generationStartAt = Date.now();
      }
      if (!lastSubmitAt) {
        lastSubmitAt = generationStartAt;
      }
    }

    function isDomQuiet() {
      return Date.now() - lastMutationAt >= QUIET_DOM_MS;
    }

    function isNetworkQuiet() {
      if (inFlightRequests > 0) return false;
      return Date.now() - lastNetworkAt >= QUIET_NETWORK_MS;
    }

    function considerCompletion({ sendButton, isSendDisabled, hasStopControl }) {
      const now = Date.now();
      const sendDisabled = Boolean(isSendDisabled);
      const stopVisible = Boolean(hasStopControl);
      if (sendDisabled || stopVisible) {
        generationArmed = true;
        if (!generationStartAt) generationStartAt = now;
        if (!lastSubmitAt) lastSubmitAt = generationStartAt;
        return false;
      }
      if (!generationArmed) return false;
      const startedAt = generationStartAt || lastSubmitAt || now;
      if (now - startedAt < 450) return false;
      if (!isDomQuiet()) return false;
      if (!isNetworkQuiet() && now - startedAt < NETWORK_NOISE_BYPASS_MS) return false;
      generationArmed = false;
      generationStartAt = 0;
      if (sendButton) learn("sendButtons", sendButton, 1);
      return true;
    }

    function extractPatchCandidateText() {
      const patchPattern = /<\s*prism-patch\b|<\s*prism-patches\b|&lt;\s*prism-patch\b|&lt;\s*prism-patches\b/i;
      const nodes = collectAssistantContainers()
        .map((node, index) => ({ node, score: scoreAssistantContainer(node, index) }))
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.node);
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        const patchNode = node?.querySelector?.("prism-patches");
        if (patchNode?.outerHTML) return patchNode.outerHTML;

        const html = node?.innerHTML || "";
        if (html && patchPattern.test(html)) return html;

        const text = node?.innerText || "";
        if (text && patchPattern.test(text)) return text;
      }

      const preNodes = querySelectorAllDeep("pre");
      for (let i = preNodes.length - 1; i >= 0; i -= 1) {
        const text = String(preNodes[i]?.innerText || preNodes[i]?.textContent || "");
        if (!text) continue;
        if (patchPattern.test(text)) return text;
      }

      const bodyText = String(document.body?.innerText || "");
      if (patchPattern.test(bodyText)) {
        return bodyText.slice(Math.max(0, bodyText.length - 24000));
      }

      return "";
    }

    function extractAssistantTextCandidate() {
      const nodes = collectAssistantContainers()
        .map((node, index) => ({ node, score: scoreAssistantContainer(node, index) }))
        .sort((a, b) => b.score - a.score);
      for (let i = 0; i < nodes.length; i += 1) {
        const text = nodes[i]?.node?.innerText || "";
        if (!text || text.trim().length < 8) continue;
        return text;
      }
      const codeBlockText = extractCodeBlockTextCandidate();
      if (codeBlockText) return codeBlockText;
      return "";
    }

    return {
      registerCopyButton: (el) => learn("copyButtons", el, 2),
      registerSendButton: (el) => learn("sendButtons", el, 2),
      registerInput: (el) => learn("inputs", el, 1),
      findBestCopyButton: () => findBest("copyButtons"),
      findBestSendButton: () => findBest("sendButtons"),
      findBestInput: () => findBest("inputs"),
      hasStopControl,
      noteMutation,
      noteSubmitAttempt,
      noteGenerationStart,
      considerCompletion,
      extractPatchCandidateText,
      extractAssistantTextCandidate,
      extractCodeBlockTextCandidate,
      getState: () => ({
        host,
        inFlightRequests,
        lastNetworkAt,
        lastMutationAt,
        generationArmed,
      }),
    };
  }

  window.PrismIntelligentExtractor = { create };
})();
