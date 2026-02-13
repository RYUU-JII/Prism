const ORB_ID = "prism-orb";
const ORB_ACTIVE_CLASS = "prism-orb--active";
const ORB_LABEL = "Refract";
const AUTO_IMPORT_PENDING = "PRISM_AUTO_IMPORT_PENDING";
const AUTO_IMPORT_RETRY_DELAYS_MS = [900, 1800, 3000];
const AUTO_IMPORT_SETTLE_MS = 700;
const PATCH_IMPORT_POLL_MS = 900;
const PATCH_CANDIDATE_STABLE_MS = 1400;
const ASSISTANT_TEXT_LIMIT = 24000;
const patchUtils = window.PrismPatchUtils || {};

let lastCode = "";
let lastLanguage = "text";
let lastRenderableCode = "";
let lastRenderableLanguage = "text";
let lastImportSuccessAt = 0;
let lastCopyTime = 0; // 중복 복사 방지용 타임스탬프
const GESTURE_WINDOW_MS = 4000;
let lastUserGestureAt = 0;
let panelOpen = false;

// 자동 가져오기 관련 상태
let autoImportEnabled = false;
let aiResponseMode = "patch";
let isAiGenerating = false;
let responseObserver = null;
let autoImportSessionSeq = 0;
let autoImportRetryIndex = 0;
let autoImportRetryTimer = null;
let autoImportSettleTimer = null;
let patchImportPollTimer = null;
let autoImportBaselineSuccessAt = 0;
let lastPatchCandidateSignature = "";
let pendingPatchCandidateSignature = "";
let pendingPatchCandidateText = "";
let pendingPatchCandidateSeenAt = 0;
let lastAppliedPatchSignature = "";
const intelligentExtractor =
  window.PrismIntelligentExtractor && typeof window.PrismIntelligentExtractor.create === "function"
    ? window.PrismIntelligentExtractor.create({ host: window.location.host })
    : null;
const chatInjector =
  window.PrismChatInjector && typeof window.PrismChatInjector.create === "function"
    ? window.PrismChatInjector.create({ intelligentExtractor })
    : null;

function findBestInputCandidate() {
  return chatInjector?.findBestInputCandidate?.() || null;
}

function findBestSendButtonCandidate() {
  return chatInjector?.findBestSendButtonCandidate?.() || null;
}

function findBestCopyButtonCandidate() {
  return chatInjector?.findBestCopyButtonCandidate?.() || null;
}

function hasStopGenerationControl() {
  return chatInjector?.hasStopGenerationControl?.() || false;
}

function clearAutoImportTimers() {
  if (autoImportRetryTimer) {
    clearTimeout(autoImportRetryTimer);
    autoImportRetryTimer = null;
  }
  if (autoImportSettleTimer) {
    clearTimeout(autoImportSettleTimer);
    autoImportSettleTimer = null;
  }
}

function clearPatchImportPolling() {
  if (patchImportPollTimer) {
    clearInterval(patchImportPollTimer);
    patchImportPollTimer = null;
  }
  pendingPatchCandidateSignature = "";
  pendingPatchCandidateText = "";
  pendingPatchCandidateSeenAt = 0;
}

function safeSendMessage(message, callback) {
  try {
    if (!chrome?.runtime?.id) {
      throw new Error("Extension context unavailable");
    }

    chrome.runtime.sendMessage(message, (resp) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        // console.warn("[Prism] sendMessage failed:", err.message || err);
      }
      if (typeof callback === "function") {
        callback(resp, err);
      }
    });
  } catch (err) {
    console.warn("[Prism] Extension context invalidated; reload the page.", err);
    destroyOrb();
    if (typeof callback === "function") {
      callback(null, err);
    }
  }
}

function detectKind(code) {
  if (!code || typeof code !== "string") return "text";
  const source = String(code);

  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 3) {
    const atLineCount = lines.filter((line) => /^at\s+/.test(line)).length;
    const frameCount = lines.filter((line) =>
      /^at\s+.+\((?:https?:\/\/|file:\/\/|webpack:|blob:|about:|<anonymous>|[^)]+:\d+:\d+).*\)$/.test(line) ||
      /^at\s+.+:\d+:\d+$/.test(line)
    ).length;
    if (frameCount >= 2 && atLineCount >= 2) return "text";
  }

  if (/^\s*<!DOCTYPE\s+html/i.test(source) || /<html[\s>]/i.test(source)) {
    const hasBody = /<body[\s>]/i.test(source);
    const hasVisualTag = /<(div|span|p|h[1-6]|section|article|main|nav|header|footer|form|table|ul|ol|li|img|canvas|svg|video|audio|button|input|a|figure)\b/i.test(source);
    const isComplete = /<\/html\s*>/i.test(source);
    if (hasBody || hasVisualTag || isComplete) return "html";
  }

  const sourceIndicators = [
    /^\s*import\s+.*\s+from\s+['"].*['"]/m,
    /^\s*export\s+(default\s+)?(function|class|const|var|let)\s+/m,
    /className\s*=/i,
    /htmlFor\s*=/i,
    /dangerouslySetInnerHTML/i,
    /<\s*>\s*[\s\S]*<\/\s*>/, // Fragment
    /\bv-(if|for|else|model|show|bind|on)\b/,
    /@click\s*=|@submit\s*=/,
    /:\w+\s*=/
  ];

  if (sourceIndicators.some(r => r.test(source))) {
    if (/\bv-|@click|:\w+=|<template>|from\s+['"]vue['"]/.test(source)) return "vue";
    return "react";
  }

  if (/useState\s*\(|useEffect\s*\(|use[A-Z][a-zA-Z]*\s*\(|ReactDOM/.test(source)) return "react";
  if (/createApp\s*\(|defineComponent\s*\(|from\s+['"]vue['"]/.test(source)) return "vue";

  const stripped = source.replace(/<\/?(!doctype|html|head|body|meta|link|title|script|style|br|hr|!--)[\s\S]*?>/gi, "").trim();

  if (/<[a-z][\s\S]*>/i.test(stripped)) {
    const hasVisualClosing = /<\/(div|span|p|h[1-6]|section|article|main|nav|header|footer|form|table|ul|ol|li|a|figure|button|label|textarea|select|details|summary|dialog|aside)\s*>/i.test(source);
    const visualTagCount = (
      stripped.match(/<(div|span|p|h[1-6]|section|article|main|nav|header|footer|form|table|thead|tbody|tfoot|tr|td|th|ul|ol|li|img|canvas|svg|video|audio|button|input|a|figure|label|textarea|select|details|summary|dialog|aside)\b[^>]*>/gi) ||
      []
    ).length;
    if (hasVisualClosing || visualTagCount >= 2) return "html";
  }

  return "text";
}

function normalizeClipboard(text) { return (text || "").trim(); }

function detectTheme() {
  try {
    const html = document.documentElement;
    const body = document.body;

    const isDarkAttr =
      html.classList.contains("dark") ||
      body?.classList?.contains("dark") ||
      html.getAttribute("data-theme") === "dark" ||
      body?.getAttribute("data-theme") === "dark" ||
      html.style.colorScheme === "dark";

    if (isDarkAttr) return "dark";

    const getLuminance = (el) => {
      if (!el) return null;
      const bg = window.getComputedStyle(el).backgroundColor;
      if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return null;

      const rgb = bg.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      }
      return null;
    };

    const luminance = getLuminance(body) ?? getLuminance(html);
    if (luminance !== null) {
      return luminance < 0.5 ? "dark" : "light";
    }
  } catch (err) { }

  return "light";
}

const buildCodeFingerprint =
  typeof patchUtils.buildCodeFingerprint === "function"
    ? patchUtils.buildCodeFingerprint
    : (code) => {
      const source = String(code || "").replace(/\r\n?/g, "\n");
      let hash = 2166136261;
      for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const lineCount = source ? source.split("\n").length : 0;
      const hashHex = (hash >>> 0).toString(16).padStart(8, "0");
      return `${lineCount}L-${hashHex}`;
    };
const extractPatchEnvelope =
  typeof patchUtils.extractPatchEnvelope === "function"
    ? patchUtils.extractPatchEnvelope
    : (text) => String(text || "");
const parsePrismPatches =
  typeof patchUtils.parsePrismPatches === "function"
    ? patchUtils.parsePrismPatches
    : () => ({ kind: "invalid", patches: [], baseFingerprint: "" });
const applyPrismPatches =
  typeof patchUtils.applyPrismPatches === "function"
    ? patchUtils.applyPrismPatches
    : () => ({ ok: false, reason: "missing_patch_utils" });
const isRiskyHtmlPatch =
  typeof patchUtils.isRiskyHtmlPatch === "function"
    ? patchUtils.isRiskyHtmlPatch
    : () => false;
const assessPatchedHtmlIntegrity =
  typeof patchUtils.assessPatchedHtmlIntegrity === "function"
    ? patchUtils.assessPatchedHtmlIntegrity
    : () => ({ ok: true, reason: "" });
const hasCompletePatchPayload =
  typeof patchUtils.hasCompletePatchPayload === "function"
    ? patchUtils.hasCompletePatchPayload
    : (text) => /<\s*prism-patches\b/i.test(String(text || ""));

function resolveBasePayloadForPatch(callback) {
  const localCode = lastRenderableCode || (lastCode !== AUTO_IMPORT_PENDING ? lastCode : "");
  const localLanguage = lastRenderableLanguage !== "text" ? lastRenderableLanguage : lastLanguage;
  if (localCode) {
    callback({ code: localCode, language: localLanguage });
    return;
  }

  safeSendMessage({ type: "PRISM_GET_LATEST" }, (resp) => {
    const payload = resp?.payload || {};
    const code = typeof payload.code === "string" ? payload.code : "";
    const language = typeof payload.language === "string" ? payload.language : "text";
    callback({ code, language });
  });
}

function commitRenderableCode(code, fallbackLanguage) {
  const normalized = normalizeClipboard(code);
  if (!normalized) return false;

  const detectedKind = detectKind(normalized);
  const resolvedKind =
    detectedKind !== "text"
      ? detectedKind
      : fallbackLanguage && fallbackLanguage !== "text"
        ? fallbackLanguage
        : "text";
  if (resolvedKind === "text") return false;

  lastCode = normalized;
  lastLanguage = resolvedKind;
  lastRenderableCode = normalized;
  lastRenderableLanguage = resolvedKind;
  lastImportSuccessAt = Date.now();

  safeSendMessage({
    type: "PRISM_RENDER_NOW",
    code: lastCode,
    language: lastLanguage,
    theme: detectTheme()
  }, (resp) => {
    if (resp && resp.open) {
      panelOpen = true;
      showFeedback();
    } else {
      panelOpen = false;
      showOrb();
      scheduleHide();
    }
  });
  return true;
}

function notifyPatchApplyRejected(reason, details = {}) {
  safeSendMessage({
    type: "PRISM_PATCH_APPLY_REJECTED",
    reason,
    ...details,
  });
}

function buildPatchPayloadSignature(parsed) {
  if (!parsed || !Array.isArray(parsed.patches)) return "";
  const normalizedPatches = parsed.patches.map((patch) => ({
    s: Number(patch?.start),
    e: Number(patch?.end),
    r: String(patch?.replacement || ""),
  }));
  const source = JSON.stringify({
    b: String(parsed.baseFingerprint || ""),
    p: normalizedPatches,
  });
  return buildCodeFingerprint(source);
}

function tryApplySmartPatchPayload(text) {
  if (aiResponseMode !== "patch") return false;
  const source = String(text || "");
  const hasPatchTag = /<\s*prism-patch\b/i.test(source) || /&lt;\s*prism-patch\b/i.test(source);
  if (!hasPatchTag) return false;
  const hasCompletePayload = hasCompletePatchPayload(source);

  const parsed = parsePrismPatches(source);
  if (parsed.kind === "none") return false;
  if (parsed.kind === "invalid") {
    if (!hasCompletePayload) {
      console.log("[Prism] Smart Patch candidate is incomplete. Waiting for full payload.");
      return true;
    }
    console.warn("[Prism] Smart Patch ignored: invalid patch payload.");
    notifyPatchApplyRejected("invalid_patch");
    return true;
  }
  if (parsed.kind === "no_change") {
    console.log("[Prism] Smart Patch payload indicates no changes.");
    return true;
  }
  const patchSignature = buildPatchPayloadSignature(parsed);
  if (patchSignature && patchSignature === lastAppliedPatchSignature) {
    console.log("[Prism] Smart Patch duplicate ignored.");
    return true;
  }

  resolveBasePayloadForPatch(({ code: baseCode, language: baseLanguage }) => {
    if (!baseCode) {
      console.warn("[Prism] Smart Patch ignored: no base code available.");
      notifyPatchApplyRejected("missing_base", { expectedBase: parsed.baseFingerprint || "" });
      return;
    }
    if (parsed.baseFingerprint) {
      const currentFingerprint = buildCodeFingerprint(baseCode);
      if (currentFingerprint !== parsed.baseFingerprint) {
        console.warn(
          "[Prism] Smart Patch ignored: base fingerprint mismatch.",
          `expected=${parsed.baseFingerprint}`,
          `current=${currentFingerprint}`
        );
        notifyPatchApplyRejected("base_mismatch", {
          expectedBase: parsed.baseFingerprint,
          currentBase: currentFingerprint,
        });
        return;
      }
    }
    if (
      (baseLanguage === "html" || detectKind(baseCode) === "html") &&
      isRiskyHtmlPatch(baseCode, parsed.patches)
    ) {
      console.warn("[Prism] Smart Patch ignored: risky HTML patch shape.");
      notifyPatchApplyRejected("risky_patch");
      return;
    }

    const applied = applyPrismPatches(baseCode, parsed.patches);
    if (!applied.ok) {
      console.warn("[Prism] Smart Patch ignored:", applied.reason);
      notifyPatchApplyRejected("apply_failed", { details: applied.reason });
      return;
    }

    const shouldValidateHtmlIntegrity =
      baseLanguage === "html" || detectKind(baseCode) === "html";
    if (shouldValidateHtmlIntegrity) {
      const integrity = assessPatchedHtmlIntegrity(baseCode, applied.code);
      if (!integrity.ok) {
        console.warn("[Prism] Smart Patch ignored: broken layout detected.", integrity.reason);
        notifyPatchApplyRejected("broken_layout", { details: integrity.reason });
        return;
      }
    }

    const committed = commitRenderableCode(applied.code, baseLanguage);
    if (!committed) {
      console.warn("[Prism] Smart Patch ignored: patched result is not a supported code type.");
      notifyPatchApplyRejected("unsupported_result");
      return;
    }

    if (patchSignature) {
      lastAppliedPatchSignature = patchSignature;
    }
    console.log(`[Prism] Smart Patch applied (${applied.patchCount} patches).`);
  });

  return true;
}

function extractLatestPatchCandidateText() {
  const learned = intelligentExtractor?.extractPatchCandidateText?.();
  if (learned) return learned;

  const selectors = [
    "[data-message-author-role='assistant']",
    "article",
    ".markdown",
    ".prose",
    "[data-testid*='assistant']",
    "[class*='assistant']",
    "main",
  ];

  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const node = nodes[i];
      const patchNode = node?.querySelector?.("prism-patches");
      if (patchNode?.outerHTML) {
        return patchNode.outerHTML;
      }

      const html = node?.innerHTML || "";
      if (html && (/<\s*prism-patch\b/i.test(html) || /&lt;\s*prism-patch\b/i.test(html))) {
        return html;
      }

      const text = node?.innerText || "";
      if (!text) continue;
      if (/<\s*prism-patch\b/i.test(text) || /&lt;\s*prism-patch\b/i.test(text)) {
        return text;
      }
    }
  }

  const bodyText = document.body?.innerText || "";
  if (/<\s*prism-patch\b/i.test(bodyText) || /&lt;\s*prism-patch\b/i.test(bodyText)) {
    return bodyText.slice(Math.max(0, bodyText.length - 24000));
  }

  return "";
}

function tryDirectPatchAutoImport(reason) {
  if (!autoImportEnabled || aiResponseMode !== "patch") return false;
  const patchText = extractLatestPatchCandidateText();
  if (!patchText) return false;
  if (!hasCompletePatchPayload(patchText)) return false;

  const envelope = extractPatchEnvelope(patchText);
  if (!envelope) return false;
  if (!/<\s*prism-patches\b/i.test(envelope)) return false;

  const signature = buildCodeFingerprint(envelope);
  if (!signature || signature === lastPatchCandidateSignature) return false;

  const now = Date.now();
  if (pendingPatchCandidateSignature !== signature) {
    pendingPatchCandidateSignature = signature;
    pendingPatchCandidateText = patchText;
    pendingPatchCandidateSeenAt = now;
    return false;
  }
  if (now - pendingPatchCandidateSeenAt < PATCH_CANDIDATE_STABLE_MS) return false;

  lastPatchCandidateSignature = signature;
  const stablePatchText = pendingPatchCandidateText || patchText;
  pendingPatchCandidateSignature = "";
  pendingPatchCandidateText = "";
  pendingPatchCandidateSeenAt = 0;

  console.log(`[Prism] Auto-import Patch Direct (${reason}).`);
  handleCodeCopy(stablePatchText);
  return true;
}

function extractCodeFenceCandidate(text) {
  const source = String(text || "");
  if (!source) return "";
  const fenceRegex = /```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g;
  let best = "";
  let match = null;
  while ((match = fenceRegex.exec(source)) !== null) {
    const candidate = normalizeClipboard(match[1] || "");
    if (!candidate) continue;
    const kind = detectKind(candidate);
    if (kind === "text") continue;
    if (candidate.length > best.length) best = candidate;
  }
  return best;
}

function extractLatestAssistantTextCandidate() {
  const learned = intelligentExtractor?.extractAssistantTextCandidate?.();
  if (learned) return String(learned).slice(-ASSISTANT_TEXT_LIMIT);

  const selectors = [
    "[data-message-author-role='assistant']",
    "article",
    ".markdown",
    ".prose",
    "[data-testid*='assistant']",
    "[class*='assistant']",
    "main",
  ];
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const text = nodes[i]?.innerText || "";
      if (!text || text.trim().length < 8) continue;
      return text.slice(-ASSISTANT_TEXT_LIMIT);
    }
  }
  return "";
}

document.addEventListener("prism-clipboard-write", (event) => {
  const text = event.detail;
  if (!text || typeof text !== "string") return;
  // 자동 가져오기(버튼 클릭 시뮬레이션)로 인한 복사라면 제스처 체크 우회
  const isAutoImportClick = (Date.now() - lastCopyTime < 1000) && lastCode === AUTO_IMPORT_PENDING;
  if (!isAutoImportClick && Date.now() - lastUserGestureAt > GESTURE_WINDOW_MS) return;

  // 상태 초기화 (자동 가져오기용 임시 상태인 경우)
  if (lastCode === AUTO_IMPORT_PENDING) lastCode = lastRenderableCode || "";

  handleCodeCopy(text);
});

["pointerdown", "keydown"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    if (event && event.isTrusted === false) return;
    lastUserGestureAt = Date.now();
    if (
      eventName === "keydown" &&
      event &&
      event.key === "Enter" &&
      !event.shiftKey &&
      event.target instanceof Element
    ) {
      const inputLike = event.target.closest("textarea,input,[contenteditable='true']");
      if (inputLike) {
        intelligentExtractor?.noteSubmitAttempt?.({ input: inputLike });
      }
    }
  }, true);
});

document.addEventListener("copy", (event) => {
  if (event && event.isTrusted === false) return;
  lastUserGestureAt = Date.now();
  const selection = window.getSelection();
  const text = selection ? selection.toString() : "";
  if (text) {
    handleCodeCopy(text);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PRISM_PANEL_STATUS") {
    panelOpen = Boolean(message.open);
    if (!panelOpen) {
      destroyOrb();
    }
  }

  if (message.type === "PRISM_INJECT_PROMPT") {
    handleInjectToChat(message.text, message.action)
      .then((result) => {
        sendResponse(result);
      })
      .catch((err) => {
        sendResponse({ ok: false, reason: err?.message || "inject_exception" });
      });
    return true;
  }

  // UI 상태 변경 수신 (설정 동기화)
  if (message.type === "PRISM_UI_STATE") {
    autoImportEnabled = Boolean(message.autoImportResponse);
    if (message.aiResponseMode === "patch" || message.aiResponseMode === "full") {
      aiResponseMode = message.aiResponseMode;
    }
    updateAutoImportObserver();
  }
  return false;
});

function handleInjectToChat(text, action) {
  return new Promise((resolve) => {
  const input = findBestInputCandidate();
  if (!input) {
    resolve({ ok: false, reason: "input_not_found" });
    return;
  }

  try {
    intelligentExtractor?.registerInput?.(input);
    if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
      input.value = text;
    } else {
      input.innerText = text;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
    input.scrollIntoView({ behavior: "smooth", block: "center" });

    if (action !== "send") {
      resolve({ ok: true, sent: false, action: action || "inject" });
      return;
    }
  } catch (err) {
    resolve({ ok: false, reason: err?.message || "inject_failed" });
    return;
  }

  setTimeout(() => {
    try {
      const sendBtn = findBestSendButtonCandidate();
      intelligentExtractor?.noteSubmitAttempt?.({ sendButton: sendBtn, input });
      isAiGenerating = true;
      if (sendBtn) intelligentExtractor?.registerSendButton?.(sendBtn);

      const sendDisabled = Boolean(
        sendBtn && (sendBtn.disabled || sendBtn.getAttribute("aria-disabled") === "true")
      );
      if (sendBtn && !sendDisabled) {
        sendBtn.click();
        resolve({ ok: true, sent: true, via: "button" });
        return;
      }

      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
      resolve({ ok: true, sent: true, via: "enter" });
    } catch (err) {
      resolve({ ok: false, reason: err?.message || "send_failed" });
    }
  }, 300);
  });
}

function triggerAutoImportRecovery(reason) {
  if (!autoImportEnabled) return;
  clearAutoImportTimers();
  autoImportSessionSeq += 1;
  autoImportRetryIndex = 0;
  autoImportBaselineSuccessAt = lastImportSuccessAt;
  runAutoImportAttempt(autoImportSessionSeq, reason || "unknown");
}

function syncPatchImportPolling() {
  clearPatchImportPolling();
  if (!autoImportEnabled || aiResponseMode !== "patch") return;
  patchImportPollTimer = setInterval(() => {
    tryDirectPatchAutoImport("poll");
  }, PATCH_IMPORT_POLL_MS);
}

function runAutoImportAttempt(sessionId, reason) {
  if (!autoImportEnabled) return;
  if (sessionId !== autoImportSessionSeq) return;
  if (lastImportSuccessAt > autoImportBaselineSuccessAt) {
    clearAutoImportTimers();
    return;
  }
  extractLastCodeAndRender();

  autoImportSettleTimer = setTimeout(() => {
    if (sessionId !== autoImportSessionSeq) return;
    const hasSucceeded = lastImportSuccessAt > autoImportBaselineSuccessAt;
    if (hasSucceeded) {
      clearAutoImportTimers();
      return;
    }
    if (autoImportRetryIndex >= AUTO_IMPORT_RETRY_DELAYS_MS.length) {
      clearAutoImportTimers();
      console.warn("[Prism] Auto-import failed after retries:", reason);
      return;
    }
    const delay = AUTO_IMPORT_RETRY_DELAYS_MS[autoImportRetryIndex];
    autoImportRetryIndex += 1;
    autoImportRetryTimer = setTimeout(() => {
      runAutoImportAttempt(sessionId, reason);
    }, delay);
  }, AUTO_IMPORT_SETTLE_MS);
}

// 자동 가져오기 옵저버 업데이트
function updateAutoImportObserver() {
  if (!autoImportEnabled) {
    if (responseObserver) {
      responseObserver.disconnect();
      responseObserver = null;
    }
    clearAutoImportTimers();
    clearPatchImportPolling();
    return;
  }

  syncPatchImportPolling();
  if (responseObserver) return;

  responseObserver = new MutationObserver(() => {
    intelligentExtractor?.noteMutation?.();
    if (tryDirectPatchAutoImport("mutation")) {
      isAiGenerating = false;
      return;
    }
    const sendBtn = findBestSendButtonCandidate();
    if (sendBtn) intelligentExtractor?.registerSendButton?.(sendBtn);

    const isDisabled = Boolean(
      sendBtn && (sendBtn.disabled || sendBtn.getAttribute("aria-disabled") === "true")
    );
    const stopVisible = hasStopGenerationControl();

    if (isDisabled || stopVisible) {
      if (!isAiGenerating) {
        isAiGenerating = true;
        intelligentExtractor?.noteGenerationStart?.();
      }
      return;
    }

    if (!isAiGenerating) return;

    const completed = intelligentExtractor?.considerCompletion
      ? intelligentExtractor.considerCompletion({
        sendButton: sendBtn,
        isSendDisabled: isDisabled,
        hasStopControl: stopVisible,
      })
      : !isDisabled;
    if (!completed) return;

    isAiGenerating = false;
    triggerAutoImportRecovery("generation-complete");
  });

  responseObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "class"]
  });
}

function extractLastCodeAndRender() {
  if (!autoImportEnabled) return false;

  // 1. 복사 버튼을 찾아 클릭하는 시도 (가장 정확함)
  const lastBtn = findBestCopyButtonCandidate();
  if (lastBtn) {
    intelligentExtractor?.registerCopyButton?.(lastBtn);
    // 자동 클릭 시점 기록 (clipboard-bridge 우회용)
    lastCopyTime = Date.now();
    lastCode = AUTO_IMPORT_PENDING;
    lastBtn.click();
    console.log("[Prism] Auto-import: Clicked best copy button.");
    return true;
  }

  // 2. 폴백: 버튼을 못 찾으면 직접 텍스트 추출
  const semanticCodeBlock = intelligentExtractor?.extractCodeBlockTextCandidate?.();
  if (semanticCodeBlock && semanticCodeBlock !== lastCode) {
    console.log("[Prism] Auto-import Fallback: Extracting semantic <pre> code block.");
    handleCodeCopy(semanticCodeBlock);
    return true;
  }

  const codeBlocks = document.querySelectorAll("code[data-test-id='code-content'], pre code, pre > span");
  if (codeBlocks.length > 0) {
    const lastBlock = codeBlocks[codeBlocks.length - 1];
    const code = lastBlock.innerText;

    if (code && code.trim() && code !== lastCode) {
      console.log("[Prism] Auto-import Fallback: Extracting text directly.");
      handleCodeCopy(code);
      return true;
    }
  }

  // 3. 일반 텍스트 응답에서 Smart Patch / 코드펜스 / 코드 유사 텍스트 추출
  const assistantText = extractLatestAssistantTextCandidate();
  if (assistantText) {
    if (aiResponseMode === "patch") {
      const patchText = extractLatestPatchCandidateText();
      if (patchText) {
        console.log("[Prism] Auto-import Fallback: Extracting Smart Patch payload.");
        handleCodeCopy(patchText);
        return true;
      }
    }

    const fencedCode = extractCodeFenceCandidate(assistantText);
    if (fencedCode) {
      console.log("[Prism] Auto-import Fallback: Extracting fenced code.");
      handleCodeCopy(fencedCode);
      return true;
    }

    const normalizedAssistant = normalizeClipboard(assistantText);
    if (detectKind(normalizedAssistant) !== "text") {
      console.log("[Prism] Auto-import Fallback: Extracting assistant plain-text code.");
      handleCodeCopy(normalizedAssistant);
      return true;
    }
  }

  return false;
}

// 페이지 로드 시 초기 패널 상태 확인
safeSendMessage({ type: "PRISM_PANEL_STATUS_REQUEST" }, (resp) => {
  if (resp && typeof resp.open === 'boolean') {
    panelOpen = resp.open;
    if (panelOpen) destroyOrb();
  }
});


function handleCodeCopy(text) {
  const now = Date.now();
  if (now - lastCopyTime < 100 && lastCode !== AUTO_IMPORT_PENDING) return;
  lastCopyTime = now;

  const normalized = normalizeClipboard(text);
  if (!normalized) return;

  if (tryApplySmartPatchPayload(normalized)) return;

  const kind = detectKind(normalized);
  if (kind === "text") return;
  commitRenderableCode(normalized, kind);
}

const orbUi =
  window.PrismOrbUI && typeof window.PrismOrbUI.create === "function"
    ? window.PrismOrbUI.create({
      orbId: ORB_ID,
      orbActiveClass: ORB_ACTIVE_CLASS,
      title: ORB_LABEL,
      ariaLabel: "Open Prism side panel",
      detectTheme,
      autoHideMs: 6000,
      feedbackHideMs: 500,
      onOpen: () => {
        const codeToOpen = lastCode === AUTO_IMPORT_PENDING ? lastRenderableCode : lastCode;
        const languageToOpen = lastCode === AUTO_IMPORT_PENDING ? lastRenderableLanguage : lastLanguage;
        if (!codeToOpen) return;

        panelOpen = true;
        destroyOrb();

        safeSendMessage({
          type: "OPEN_PRISM",
          code: codeToOpen,
          language: languageToOpen,
          theme: detectTheme(),
        });
      },
    })
    : null;

function ensureOrb() {
  return orbUi?.ensureOrb?.() || null;
}

function showOrb() {
  if (panelOpen) return;
  orbUi?.showOrb?.();
}

function showFeedback() {
  orbUi?.showFeedback?.();
}

function hideOrb() {
  orbUi?.hideOrb?.();
}

function destroyOrb() {
  orbUi?.destroyOrb?.();
}

function scheduleHide() {
  orbUi?.scheduleHide?.();
}
