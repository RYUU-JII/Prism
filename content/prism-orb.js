const ORB_ID = "prism-orb";
const ORB_ACTIVE_CLASS = "prism-orb--active";
const ORB_LABEL = "Refract";
const AUTO_IMPORT_PENDING = "PRISM_AUTO_IMPORT_PENDING";
const AUTO_IMPORT_RETRY_DELAYS_MS = [900, 1800, 3000];
const AUTO_IMPORT_SETTLE_MS = 700;
const PATCH_IMPORT_POLL_MS = 900;
const PATCH_CANDIDATE_STABLE_MS = 1400;
const ASSISTANT_TEXT_LIMIT = 24000;

let lastCode = "";
let lastLanguage = "text";
let lastRenderableCode = "";
let lastRenderableLanguage = "text";
let lastImportSuccessAt = 0;
let hideTimer = null;
let cleanupTimer = null; // 피드백 종료 타이머 추적용
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
const intelligentExtractor =
  window.PrismIntelligentExtractor && typeof window.PrismIntelligentExtractor.create === "function"
    ? window.PrismIntelligentExtractor.create({ host: window.location.host })
    : null;

function isElementVisible(el) {
  if (!el || !(el instanceof Element)) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  if (!style) return true;
  return style.display !== "none" && style.visibility !== "hidden";
}

function findBestInputCandidate() {
  const learned = intelligentExtractor?.findBestInput?.();
  if (learned) return learned;

  const host = window.location.host;
  if (host.includes("chatgpt.com")) {
    return document.querySelector("#prompt-textarea");
  }
  if (host.includes("claude.ai")) {
    return (
      document.querySelector(".ProseMirror") ||
      document.querySelector('[contenteditable="true"]')
    );
  }
  if (host.includes("gemini.google.com")) {
    return (
      document.querySelector(".ql-editor") ||
      document.querySelector('div[contenteditable="true"]')
    );
  }
  if (host.includes("v0.dev")) {
    return document.querySelector('textarea[placeholder*="Ask"]');
  }
  return (
    document.querySelector('textarea[name*="prompt"]') ||
    document.querySelector('textarea[placeholder*="prompt"]') ||
    document.querySelector('textarea[aria-label*="prompt"]') ||
    document.querySelector("textarea") ||
    document.querySelector('div[contenteditable="true"]')
  );
}

function findBestSendButtonCandidate() {
  const learned = intelligentExtractor?.findBestSendButton?.();
  if (learned) return learned;

  const host = window.location.host;
  if (host.includes("gemini.google.com")) {
    return document.querySelector(".send-button");
  }
  if (host.includes("claude.ai")) {
    return document.querySelector('button[aria-label*="Send"], button[aria-label*="전송"]');
  }
  if (host.includes("chatgpt.com")) {
    return document.querySelector('button[data-testid*="send-button"]');
  }
  return (
    document.querySelector(".send-button") ||
    document.querySelector('button[aria-label*="전송"]') ||
    document.querySelector('button[aria-label*="보내기"]') ||
    document.querySelector('button[data-testid*="send"]') ||
    document.querySelector('button[class*="submit"]')
  );
}

function findBestCopyButtonCandidate() {
  const learned = intelligentExtractor?.findBestCopyButton?.();
  if (learned) return learned;

  const copyButtons = document.querySelectorAll(".copy-button, [aria-label*='복사'], [aria-label*='copy']");
  for (let i = copyButtons.length - 1; i >= 0; i -= 1) {
    const candidate = copyButtons[i];
    if (!isElementVisible(candidate)) continue;
    return candidate;
  }
  return null;
}

function hasStopGenerationControl() {
  if (intelligentExtractor?.hasStopControl?.()) return true;
  const stopNode = document.querySelector(
    "button[aria-label*='stop' i], button[aria-label*='중지'], [data-testid*='stop' i], button[class*='stop' i]"
  );
  return Boolean(stopNode && isElementVisible(stopNode));
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

function buildCodeFingerprint(code) {
  const source = String(code || "").replace(/\r\n?/g, "\n");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const lineCount = source ? source.split("\n").length : 0;
  const hashHex = (hash >>> 0).toString(16).padStart(8, "0");
  return `${lineCount}L-${hashHex}`;
}

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

function decodeBasicEntities(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function stripSingleCodeFence(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  const fenced = trimmed.match(/^```[^\n]*\n?([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : trimmed;
}

function extractPatchEnvelope(text) {
  const normalized = decodeBasicEntities(stripSingleCodeFence(text));
  if (!normalized) return "";

  const wrapperRegex = /<prism-patches\b[^>]*>[\s\S]*?<\/prism-patches>/gi;
  let wrapperMatch = null;
  let found = null;
  while ((wrapperMatch = wrapperRegex.exec(normalized)) !== null) {
    found = wrapperMatch[0];
  }
  return found || normalized;
}

function parsePrismPatches(rawText) {
  const envelope = extractPatchEnvelope(rawText);
  if (!envelope) return { kind: "none", patches: [], baseFingerprint: "" };

  const hasWrapper = /<prism-patches\b[^>]*>/i.test(envelope);
  const wrapperMatch = envelope.match(/<prism-patches\b([^>]*)>/i);
  const wrapperAttrText = wrapperMatch ? wrapperMatch[1] || "" : "";
  const baseMatch = wrapperAttrText.match(/\b(?:base|b)\s*=\s*["']?([a-zA-Z0-9_.:-]+)["']?/i);
  const baseFingerprint = baseMatch ? baseMatch[1] : "";
  const patchRegex = /<prism-patch\b([^>]*)>([\s\S]*?)<\/prism-patch>/gi;
  const patches = [];
  let match = null;

  while ((match = patchRegex.exec(envelope)) !== null) {
    const attrText = match[1] || "";
    const startMatch = attrText.match(/\b(?:start_line|s)\s*=\s*["']?(\d+)["']?/i);
    const endMatch = attrText.match(/\b(?:end_line|e)\s*=\s*["']?(\d+)["']?/i);
    if (!startMatch || !endMatch) continue;

    const startLine = Number(startMatch[1]);
    const endLine = Number(endMatch[1]);
    if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) continue;
    if (startLine <= 0 || endLine <= 0) continue;
    if (endLine < startLine) continue;

    let replacement = (match[2] || "").replace(/\r\n?/g, "\n");
    if (replacement.startsWith("\n")) replacement = replacement.slice(1);
    if (replacement.endsWith("\n")) replacement = replacement.slice(0, -1);

    patches.push({
      startLine,
      endLine,
      replacement,
      index: patches.length,
    });
  }

  if (hasWrapper && patches.length === 0) {
    return { kind: "no_change", patches: [], baseFingerprint };
  }
  if (patches.length === 0) {
    return { kind: "invalid", patches: [], baseFingerprint };
  }

  return { kind: "patches", patches, baseFingerprint };
}

function applyPrismPatches(baseCode, patches) {
  const baseLines = String(baseCode || "").replace(/\r\n?/g, "\n").split("\n");
  const totalLines = baseLines.length;
  const orderedAsc = patches.slice().sort((a, b) => a.startLine - b.startLine || a.index - b.index);

  for (let i = 0; i < orderedAsc.length; i += 1) {
    const patch = orderedAsc[i];
    if (patch.startLine > totalLines || patch.endLine > totalLines) {
      return {
        ok: false,
        reason: `Line range out of bounds: ${patch.startLine}-${patch.endLine} (max ${totalLines})`,
      };
    }
    if (i > 0) {
      const prev = orderedAsc[i - 1];
      if (patch.startLine <= prev.endLine) {
        return {
          ok: false,
          reason: `Overlapping ranges: ${prev.startLine}-${prev.endLine} and ${patch.startLine}-${patch.endLine}`,
        };
      }
    }
  }

  const nextLines = baseLines.slice();
  const orderedDesc = orderedAsc.slice().sort((a, b) => b.startLine - a.startLine || b.index - a.index);
  for (const patch of orderedDesc) {
    const deleteCount = patch.endLine - patch.startLine + 1;
    const replacementLines = patch.replacement ? patch.replacement.split("\n") : [];
    nextLines.splice(patch.startLine - 1, deleteCount, ...replacementLines);
  }

  return { ok: true, code: nextLines.join("\n"), patchCount: orderedAsc.length };
}

function isRiskyHtmlPatch(baseCode, patches) {
  const structuralCloseRe = /<\/\s*(main|body|html)\s*>/i;
  const structuralBlockRe = /<\s*(header|nav|main|section|article|aside|footer)\b[\s\S]*?<\/\s*(header|nav|main|section|article|aside|footer)\s*>/i;
  const baseLines = String(baseCode || "").replace(/\r\n?/g, "\n").split("\n");

  for (const patch of patches) {
    const span = patch.endLine - patch.startLine + 1;
    const replacement = String(patch.replacement || "");
    const replacementLines = replacement ? replacement.split("\n").length : 0;
    const targetSlice = baseLines.slice(Math.max(0, patch.startLine - 1), patch.endLine).join("\n");

    if (span <= 1 && structuralCloseRe.test(replacement)) {
      return true;
    }
    if (span <= 2 && replacementLines >= 15 && structuralBlockRe.test(replacement)) {
      return true;
    }
    if (
      span <= 1 &&
      /<\s*main\b/i.test(replacement) &&
      !/<\s*main\b/i.test(targetSlice) &&
      structuralCloseRe.test(replacement)
    ) {
      return true;
    }
  }

  return false;
}

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

function tryApplySmartPatchPayload(text) {
  if (aiResponseMode !== "patch") return false;
  const source = String(text || "");
  const hasPatchTag = /<\s*prism-patch\b/i.test(source) || /&lt;\s*prism-patch\b/i.test(source);
  if (!hasPatchTag) return false;

  const parsed = parsePrismPatches(source);
  if (parsed.kind === "none") return false;
  if (parsed.kind === "invalid") {
    console.warn("[Prism] Smart Patch ignored: invalid patch payload.");
    notifyPatchApplyRejected("invalid_patch");
    return true;
  }
  if (parsed.kind === "no_change") {
    console.log("[Prism] Smart Patch payload indicates no changes.");
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

    const committed = commitRenderableCode(applied.code, baseLanguage);
    if (!committed) {
      console.warn("[Prism] Smart Patch ignored: patched result is not a supported code type.");
      notifyPatchApplyRejected("unsupported_result");
      return;
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

function hasCompletePatchPayload(text) {
  const source = String(text || "");
  const hasOpen = /<\s*prism-patches\b/i.test(source) || /&lt;\s*prism-patches\b/i.test(source);
  const hasClose = /<\s*\/\s*prism-patches\s*>/i.test(source) || /&lt;\s*\/\s*prism-patches\s*&gt;/i.test(source);
  return hasOpen && hasClose;
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

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PRISM_PANEL_STATUS") {
    panelOpen = Boolean(message.open);
    if (!panelOpen) {
      destroyOrb();
    }
  }

  if (message.type === "PRISM_INJECT_PROMPT") {
    handleInjectToChat(message.text, message.action);
  }

  // UI 상태 변경 수신 (설정 동기화)
  if (message.type === "PRISM_UI_STATE") {
    autoImportEnabled = Boolean(message.autoImportResponse);
    if (message.aiResponseMode === "patch" || message.aiResponseMode === "full") {
      aiResponseMode = message.aiResponseMode;
    }
    updateAutoImportObserver();
  }
});

function handleInjectToChat(text, action) {
  const input = findBestInputCandidate();

  if (input) {
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

    if (action === "send") {
      setTimeout(() => {
        const sendBtn = findBestSendButtonCandidate();
        intelligentExtractor?.noteSubmitAttempt?.({ sendButton: sendBtn, input });
        isAiGenerating = true;
        if (sendBtn) intelligentExtractor?.registerSendButton?.(sendBtn);

        const sendDisabled = Boolean(
          sendBtn && (sendBtn.disabled || sendBtn.getAttribute("aria-disabled") === "true")
        );
        if (sendBtn && !sendDisabled) {
          sendBtn.click();
        } else {
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          }));
        }
      }, 300);
    }
  }
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

function ensureOrb() {
  let orb = document.getElementById(ORB_ID);
  if (orb) return orb;

  orb = document.createElement("button");
  orb.id = ORB_ID;
  orb.type = "button";
  orb.setAttribute("aria-label", "Open Prism side panel");
  orb.setAttribute("title", "Open Prism");

  orb.addEventListener("click", (e) => {
    e.stopPropagation();
    const codeToOpen = lastCode === AUTO_IMPORT_PENDING ? lastRenderableCode : lastCode;
    const languageToOpen = lastCode === AUTO_IMPORT_PENDING ? lastRenderableLanguage : lastLanguage;
    if (!codeToOpen) return;

    panelOpen = true;
    destroyOrb();

    safeSendMessage({
      type: "OPEN_PRISM",
      code: codeToOpen,
      language: languageToOpen,
      theme: detectTheme()
    });
  });

  document.body.appendChild(orb);
  return orb;
}

function showOrb() {
  if (panelOpen) return;
  const orb = ensureOrb();
  orb.dataset.theme = detectTheme();
  requestAnimationFrame(() => {
    orb.classList.add(ORB_ACTIVE_CLASS);
  });
}

function showFeedback() {
  const orb = ensureOrb();
  if (hideTimer) clearTimeout(hideTimer);
  if (cleanupTimer) clearTimeout(cleanupTimer);

  orb.classList.add("prism-orb--feedback");
  orb.dataset.theme = detectTheme();

  void orb.offsetWidth;

  requestAnimationFrame(() => {
    orb.classList.add(ORB_ACTIVE_CLASS);
  });

  hideTimer = setTimeout(() => {
    orb.classList.remove(ORB_ACTIVE_CLASS);
    cleanupTimer = setTimeout(() => {
      destroyOrb();
    }, 500);
  }, 500);
}

function hideOrb() {
  const orb = document.getElementById(ORB_ID);
  if (orb) {
    orb.classList.remove(ORB_ACTIVE_CLASS);
  }
}

function destroyOrb() {
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (cleanupTimer) {
    window.clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
  const orb = document.getElementById(ORB_ID);
  if (orb) {
    orb.remove();
  }
}

function scheduleHide() {
  if (hideTimer) {
    window.clearTimeout(hideTimer);
  }
  hideTimer = window.setTimeout(() => {
    hideOrb();
    hideTimer = null;
  }, 6000);
}
