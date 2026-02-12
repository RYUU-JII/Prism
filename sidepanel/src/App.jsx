import React, { useState, useEffect, useRef, useMemo, useCallback, useReducer } from 'react';
import Header from './components/Header.jsx';
import Viewer from './components/Viewer.jsx';
import FloatingInput from './components/FloatingInput.jsx';
import NotesIsland from './components/NotesIsland.jsx';
import ExpertEditor from './components/ExpertEditor.jsx';
import { performCaptureInParent } from './utils/capture';
import { useToast } from './hooks/useToast.jsx';

const ENABLE_EXPERT_MODE = false;
const ENABLE_PICKER = true;
const SNAPSHOT_COOLDOWN_MS = 900;
const UI_SETTINGS_KEY = "prism-ui-settings-v3";
const LEGACY_THEME_KEY = "prism-expert-theme";
const VALID_THEME_MODES = ["detect", "light", "dark"];
const VALID_MEMO_RESET_POLICIES = ["on_code_change", "on_copy", "manual"];
const DEFAULT_RUNTIME_CAPABILITIES = Object.freeze({
  picker: true,
  snapshot: true,
  freeze: true,
  reasons: {},
});

const DEFAULT_UI_SETTINGS = {
  themeMode: "detect",
  lockInteractionsWhenPaused: true,
  showTooltips: true,
  captureRange: "visible",
  memoResetPolicy: "on_code_change",
  keepPickerActiveAfterSelect: true,
  exportPromptLevel: 2,
  pickerAutoPause: false,
  pickerHighlight: {
    strength: "medium",
    color: "#14b8a6",
  },
};

function loadUiSettings() {
  try {
    const raw = localStorage.getItem(UI_SETTINGS_KEY);
    if (!raw) return DEFAULT_UI_SETTINGS;
    const parsed = JSON.parse(raw);
    const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
    const themeMode = VALID_THEME_MODES.includes(parsed?.themeMode)
      ? parsed.themeMode
      : legacyTheme === "light" || legacyTheme === "dark"
        ? legacyTheme
        : DEFAULT_UI_SETTINGS.themeMode;
    const exportPromptLevel = [1, 2, 3].includes(Number(parsed?.exportPromptLevel))
      ? Number(parsed.exportPromptLevel)
      : DEFAULT_UI_SETTINGS.exportPromptLevel;
    const captureRange = ["visible", "full"].includes(parsed?.captureRange)
      ? parsed.captureRange
      : DEFAULT_UI_SETTINGS.captureRange;
    const memoResetPolicy = VALID_MEMO_RESET_POLICIES.includes(parsed?.memoResetPolicy)
      ? parsed.memoResetPolicy
      : DEFAULT_UI_SETTINGS.memoResetPolicy;
    const legacyStrength = ["subtle", "medium", "strong"].includes(parsed?.highlightStrength)
      ? parsed.highlightStrength
      : DEFAULT_UI_SETTINGS.pickerHighlight.strength;
    const legacyColor =
      typeof parsed?.highlightColor === "string" && parsed.highlightColor.trim()
        ? parsed.highlightColor
        : DEFAULT_UI_SETTINGS.pickerHighlight.color;
    const pickerHighlightRaw =
      parsed?.pickerHighlight && typeof parsed.pickerHighlight === "object"
        ? parsed.pickerHighlight
        : null;
    const pickerHighlight = {
      strength: ["subtle", "medium", "strong"].includes(pickerHighlightRaw?.strength)
        ? pickerHighlightRaw.strength
        : legacyStrength,
      color:
        typeof pickerHighlightRaw?.color === "string" && pickerHighlightRaw.color.trim()
          ? pickerHighlightRaw.color
          : legacyColor,
    };
    return {
      themeMode,
      lockInteractionsWhenPaused:
        typeof parsed?.lockInteractionsWhenPaused === "boolean"
          ? parsed.lockInteractionsWhenPaused
          : DEFAULT_UI_SETTINGS.lockInteractionsWhenPaused,
      showTooltips:
        typeof parsed?.showTooltips === "boolean"
          ? parsed.showTooltips
          : typeof parsed?.hideHintOverlay === "boolean"
            ? !parsed.hideHintOverlay
            : DEFAULT_UI_SETTINGS.showTooltips,
      captureRange,
      memoResetPolicy,
      keepPickerActiveAfterSelect:
        typeof parsed?.keepPickerActiveAfterSelect === "boolean"
          ? parsed.keepPickerActiveAfterSelect
          : DEFAULT_UI_SETTINGS.keepPickerActiveAfterSelect,
      exportPromptLevel,
      pickerAutoPause:
        typeof parsed?.pickerAutoPause === "boolean"
          ? parsed.pickerAutoPause
          : DEFAULT_UI_SETTINGS.pickerAutoPause,
      pickerHighlight,
    };
  } catch (err) {
    return DEFAULT_UI_SETTINGS;
  }
}

function resolveThemeModeTheme(themeMode, detectedTheme) {
  if (themeMode === "light" || themeMode === "dark") return themeMode;
  return detectedTheme === "dark" ? "dark" : "light";
}

function normalizeSource(url) {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch (err) {
    return url;
  }
}

function detectKind(code) {
  if (!code || typeof code !== "string") return "text";
  const source = String(code);

  if (/^\s*<!DOCTYPE\s+html/i.test(source) || /<html[\s>]/i.test(source)) {
    return "html";
  }

  const angularIndicators = [
    /from\s+['"]@angular\//,
    /\b@Component\s*\(/,
    /\bNgModule\s*\(/,
    /\bbootstrapApplication\s*\(/,
  ];
  if (angularIndicators.some((r) => r.test(source))) return "angular";

  const svelteIndicators = [
    /from\s+['"]svelte(?:\/|['"])/,
    /<svelte:[a-z-]+/i,
    /{#(if|each|await)\b/,
  ];
  if (svelteIndicators.some((r) => r.test(source))) return "svelte";

  const vueIndicators = [
    /\bv-(if|for|else|model|show|bind|on)\b/,
    /@click\s*=|@submit\s*=/,
    /:\w+\s*=/,
    /<template[\s>]/i,
    /from\s+['"]vue['"]/,
    /createApp\s*\(/,
    /defineComponent\s*\(/,
    /defineProps\s*\(/,
    /defineEmits\s*\(/,
  ];
  if (vueIndicators.some((r) => r.test(source))) return "vue";

  const reactIndicators = [
    /className\s*=/i,
    /htmlFor\s*=/i,
    /dangerouslySetInnerHTML/i,
    /useState\s*\(|useEffect\s*\(|useMemo\s*\(|useCallback\s*\(|useRef\s*\(/,
    /ReactDOM|createRoot\s*\(/,
    /from\s+['"]react['"]/,
    /from\s+['"]react-dom(?:\/client)?['"]/,
    /<\s*>\s*[\s\S]*<\/\s*>/,
    /<\s*[A-Z][A-Za-z0-9_]*(\s|>)/,
  ];
  if (reactIndicators.some((r) => r.test(source))) return "react";

  if (/<[a-z][\s\S]*>/i.test(source)) return "html";
  return "text";
}

function resolveHintedKind(language) {
  const value = typeof language === "string" ? language.toLowerCase() : "";
  if (value === "html") return "html";
  if (value === "react") return "react";
  if (value === "vue") return "vue";
  if (value === "angular") return "angular";
  if (value === "svelte") return "svelte";
  return "text";
}

function resolveRenderKind(language, code) {
  const hinted = resolveHintedKind(language);
  const inferred = detectKind(code);

  if (inferred === "angular" || inferred === "svelte") return inferred;
  if (hinted === "text" && inferred !== "text") return inferred;
  if ((hinted === "react" || hinted === "vue") && inferred === "html") return "html";
  return hinted;
}

function countNewlines(text) {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") count += 1;
  }
  return count;
}

function addPrismLineAttributes(html) {
  if (!html) return html;
  const lower = html.toLowerCase();
  let out = "";
  let i = 0;
  let line = 1;
  let inScript = false;
  let inStyle = false;

  while (i < html.length) {
    if (inScript || inStyle) {
      const endTag = inScript ? "</script" : "</style";
      const endIndex = lower.indexOf(endTag, i);
      if (endIndex === -1) {
        const chunk = html.slice(i);
        out += chunk;
        line += countNewlines(chunk);
        return out;
      }
      const chunk = html.slice(i, endIndex);
      out += chunk;
      line += countNewlines(chunk);
      i = endIndex;
      inScript = false;
      inStyle = false;
      continue;
    }

    const ch = html[i];
    if (ch !== "<") {
      if (ch === "\n") line += 1;
      out += ch;
      i += 1;
      continue;
    }

    const next = lower[i + 1];
    if (next === "/" || next === "!" || next === "?") {
      out += "<";
      i += 1;
      continue;
    }

    let j = i + 1;
    while (j < html.length && /\s/.test(html[j])) j += 1;
    const nameStart = j;
    while (j < html.length && /[A-Za-z0-9:-]/.test(html[j])) j += 1;
    const tagName = html.slice(nameStart, j);
    if (!tagName) {
      out += "<";
      i += 1;
      continue;
    }

    let k = j;
    let quote = null;
    while (k < html.length) {
      const c = html[k];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ">") {
        break;
      }
      k += 1;
    }
    if (k >= html.length) {
      out += html.slice(i);
      return out;
    }

    const tagText = html.slice(i, k + 1);
    const hasLine = /data-prism-line\s*=/.test(tagText);
    const prefix = html.slice(i + 1, nameStart);
    const rest = html.slice(j, k + 1);
    const isSelfClosing = /\/\s*>$/.test(tagText);
    const tagLower = tagName.toLowerCase();
    if (!hasLine) {
      out += `<${prefix}${tagName} data-prism-line="${line}"${rest}`;
    } else {
      out += tagText;
    }
    line += countNewlines(tagText);
    i = k + 1;
    if (!isSelfClosing && tagLower === "script") inScript = true;
    if (!isSelfClosing && tagLower === "style") inStyle = true;
  }
  return out;
}

function fixRelativePaths(html, baseUrl) {
  if (!baseUrl || !html) return html;
  const origin = baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`;
  return html.replace(/src=["']\/([^"']+)["']/g, (match, path) => {
    try {
      const absoluteUrl = new URL(path, origin).href;
      return `src="${absoluteUrl}"`;
    } catch (e) {
      return match;
    }
  });
}

function buildRenderKey(code, language, url, theme) {
  if (!code) return "";
  const kind = resolveRenderKind(language, code);
  const source = normalizeSource(url);
  const resolvedTheme = theme || "light";
  return `${kind}::${resolvedTheme}::${source || ""}::${code}`;
}

function buildContentIdentity(code, language, url) {
  if (!code) return "";
  const kind = resolveRenderKind(language, code);
  const source = normalizeSource(url);
  return `${kind}::${source || ""}::${code}`;
}

const initialInteractionState = {
  pickerActive: false,
  canvasFrozen: false,
  focusLine: null,
  focusToken: 0,
  instructions: {},
  activeInstructionLine: null,
  activeElementRect: null,
};

function interactionReducer(state, action) {
  switch (action.type) {
    case "SET_PICKER_ACTIVE": {
      const active = Boolean(action.active);
      if (state.pickerActive === active) return state;
      if (!active) {
        return {
          ...state,
          pickerActive: false,
          activeInstructionLine: null,
          activeElementRect: null,
        };
      }
      return { ...state, pickerActive: true };
    }
    case "TOGGLE_PICKER": {
      const nextActive = !state.pickerActive;
      if (!nextActive) {
        return {
          ...state,
          pickerActive: false,
          activeInstructionLine: null,
          activeElementRect: null,
        };
      }
      return {
        ...state,
        pickerActive: true,
        canvasFrozen: action.autoPause ? true : state.canvasFrozen,
      };
    }
    case "TOGGLE_FROZEN":
      return { ...state, canvasFrozen: !state.canvasFrozen };
    case "PICKER_SELECT": {
      const line = Number(action.line) || 1;
      return {
        ...state,
        pickerActive:
          action.keepPickerActiveAfterSelect === false ? false : state.pickerActive,
        focusLine: line,
        focusToken: state.focusToken + 1,
        activeInstructionLine: line,
        activeElementRect: action.rect || null,
      };
    }
    case "SAVE_ACTIVE_INSTRUCTION": {
      const line = state.activeInstructionLine;
      const text = (action.text || "").trim();
      if (!line || !text) return state;
      return {
        ...state,
        instructions: { ...state.instructions, [line]: text },
        activeInstructionLine: null,
        activeElementRect: null,
      };
    }
    case "REMOVE_ACTIVE_INSTRUCTION": {
      const line = state.activeInstructionLine;
      if (!line) return state;
      const nextInstructions = { ...state.instructions };
      delete nextInstructions[line];
      return {
        ...state,
        instructions: nextInstructions,
        activeInstructionLine: null,
        activeElementRect: null,
      };
    }
    case "REMOVE_INSTRUCTION_BY_LINE": {
      const line = Number(action.line);
      if (!Number.isFinite(line) || line <= 0) return state;
      const key = String(line);
      if (!Object.prototype.hasOwnProperty.call(state.instructions, key)) return state;
      const nextInstructions = { ...state.instructions };
      delete nextInstructions[key];
      const shouldClearActive = state.activeInstructionLine === line;
      return {
        ...state,
        instructions: nextInstructions,
        activeInstructionLine: shouldClearActive ? null : state.activeInstructionLine,
        activeElementRect: shouldClearActive ? null : state.activeElementRect,
      };
    }
    case "CLEAR_INSTRUCTIONS":
      return {
        ...state,
        instructions: {},
        activeInstructionLine: null,
        activeElementRect: null,
      };
    case "SET_INSTRUCTIONS": {
      const nextInstructions =
        action.instructions && typeof action.instructions === "object"
          ? action.instructions
          : {};
      const activeLine = state.activeInstructionLine;
      const keepActive =
        Number.isFinite(activeLine) &&
        activeLine > 0 &&
        Object.prototype.hasOwnProperty.call(nextInstructions, String(activeLine));
      return {
        ...state,
        instructions: nextInstructions,
        activeInstructionLine: keepActive ? activeLine : null,
        activeElementRect: keepActive ? state.activeElementRect : null,
      };
    }
    case "CLEAR_SELECTION":
      return { ...state, activeInstructionLine: null, activeElementRect: null };
    default:
      return state;
  }
}

function App() {
  const [latestPayload, setLatestPayload] = useState(null);
  const [expertMode, setExpertMode] = useState(false);
  const [uiSettings, setUiSettings] = useState(() => loadUiSettings());
  const [interactionState, dispatchInteraction] = useReducer(
    interactionReducer,
    initialInteractionState
  );
  const [runtimeCapabilities, setRuntimeCapabilities] = useState(() => DEFAULT_RUNTIME_CAPABILITIES);
  const [previewInstructionLine, setPreviewInstructionLine] = useState(null);
  const {
    pickerActive,
    focusLine,
    focusToken,
    instructions,
    activeInstructionLine,
    activeElementRect,
    canvasFrozen,
  } = interactionState;

  const viewerRef = useRef(null);
  const viewerReadyRef = useRef(false);
  const pendingPayloadRef = useRef(null);
  const pendingUiStateRef = useRef(null);
  const pendingSnapshotActionRef = useRef(null);
  const lastRenderKeyRef = useRef("");
  const hasRenderedOnceRef = useRef(false);
  const latestPayloadRef = useRef(null);
  const currentTabIdRef = useRef(null);
  const panelPortRef = useRef(null);
  const snapshotCooldownRef = useRef(0);
  const flashRef = useRef(null);
  const instructionsRef = useRef(instructions);
  const contentIdentityRef = useRef("");
  const { toast, showToast } = useToast();
  const activeTheme = useMemo(
    () => resolveThemeModeTheme(uiSettings.themeMode, latestPayload?.theme),
    [uiSettings.themeMode, latestPayload?.theme]
  );
  const instructionEntries = useMemo(() => {
    const codeLines = String(latestPayload?.code || "").split("\n");
    return Object.entries(instructions)
      .map(([line, memoText]) => {
        const numericLine = Number(line) || 1;
        return {
          line: numericLine,
          memoText: String(memoText || ""),
          sourceLineText: codeLines[numericLine - 1] || "",
        };
      })
      .sort((a, b) => a.line - b.line);
  }, [instructions, latestPayload?.code]);
  const instructionCount = instructionEntries.length;
  const isHtmlPayload = latestPayload?.language === "html";
  const hasRenderableHtml = Boolean(latestPayload?.code) && isHtmlPayload;
  const isPickerDisabled =
    !ENABLE_PICKER ||
    !hasRenderableHtml;
  const isSnapshotDisabled =
    !latestPayload?.code ||
    (isHtmlPayload && runtimeCapabilities?.snapshot === false);
  const isFreezeDisabled =
    !latestPayload?.code ||
    !isHtmlPayload;
  const isExportPromptDisabled =
    !latestPayload?.code ||
    !isHtmlPayload ||
    isPickerDisabled;

  const { targetTabId, isWindowMode } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      targetTabId: params.get("tabId"),
      isWindowMode: params.get("mode") === "window",
    };
  }, []);

  const [windowHintVisible, setWindowHintVisible] = useState(false);

  useEffect(() => {
    latestPayloadRef.current = latestPayload;
  }, [latestPayload]);

  useEffect(() => {
    instructionsRef.current = instructions;
  }, [instructions]);

  useEffect(() => {
    document.body.dataset.theme = activeTheme;
  }, [activeTheme]);

  useEffect(() => {
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(uiSettings));
  }, [uiSettings]);

  useEffect(() => {
    if (!isWindowMode) return;
    document.body.classList.add("prism-window");
    return () => {
      document.body.classList.remove("prism-window");
    };
  }, [isWindowMode]);

  const flashCapture = useCallback(() => {
    const el = flashRef.current;
    if (!el) return;
    el.classList.remove("active");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add("active");
      });
    });
  }, []);

  const handleFlashAnimationEnd = useCallback((event) => {
    event.currentTarget.classList.remove("active");
  }, []);

  const postToSandbox = useCallback((payload) => {
    if (!payload) return;
    const viewer = viewerRef.current;
    if (!viewer || !viewer.contentWindow || !viewerReadyRef.current) {
      pendingPayloadRef.current = payload;
      return;
    }
    viewer.contentWindow.postMessage({ type: "RENDER", ...payload }, "*");
  }, []);

  const buildUiStatePayload = useCallback(() => {
    return {
      type: "PRISM_UI_STATE",
      pickerActive: Boolean(ENABLE_PICKER && pickerActive),
      frozen: Boolean(canvasFrozen),
      instructions,
      instructionsCount: instructionCount,
      previewLine: previewInstructionLine,
      editingLine:
        Number.isFinite(activeInstructionLine) && activeInstructionLine > 0
          ? activeInstructionLine
          : null,
      settings: uiSettings,
    };
  }, [
    activeInstructionLine,
    canvasFrozen,
    instructionCount,
    instructions,
    pickerActive,
    previewInstructionLine,
    uiSettings,
  ]);

  const sendUiState = useCallback((payloadOverride) => {
    const viewer = viewerRef.current;
    const payload = payloadOverride || buildUiStatePayload();
    if (!viewer?.contentWindow || !viewerReadyRef.current) {
      pendingUiStateRef.current = payload;
      return;
    }
    pendingUiStateRef.current = null;
    viewer.contentWindow.postMessage(payload, "*");
  }, [buildUiStatePayload]);

  const renderPayload = useCallback((code, language, url, sourceTheme, renderTheme) => {
    if (!code) {
      latestPayloadRef.current = null;
      setLatestPayload(null);
      setRuntimeCapabilities(DEFAULT_RUNTIME_CAPABILITIES);
      contentIdentityRef.current = "";
      postToSandbox({ code: "", language: "text", url: "", theme: renderTheme || "light" });
      return;
    }
    const kind = resolveRenderKind(language, code);
    const source = normalizeSource(url);
    const fixedCode = fixRelativePaths(code, source);
    const sandboxCode = kind === "html" ? addPrismLineAttributes(fixedCode) : fixedCode;
    const payload = { code, language: kind, url: source, theme: sourceTheme || "light" };
    latestPayloadRef.current = payload;
    setLatestPayload(payload);
    setRuntimeCapabilities(DEFAULT_RUNTIME_CAPABILITIES);
    postToSandbox({
      ...payload,
      theme: renderTheme || "light",
      code: sandboxCode,
    });
  }, [postToSandbox]);

  const applyInstructionPolicyForContentChange = useCallback((nextCode) => {
    const currentInstructions = instructionsRef.current || {};
    const currentKeys = Object.keys(currentInstructions);
    if (currentKeys.length === 0) return;

    if (uiSettings.memoResetPolicy === "on_code_change") {
      dispatchInteraction({ type: "CLEAR_INSTRUCTIONS" });
      setPreviewInstructionLine(null);
      showToast("코드 변경으로 메모가 초기화되었습니다.");
      return;
    }

    const maxLine = Math.max(1, String(nextCode || "").split("\n").length);
    const nextInstructions = {};
    currentKeys.forEach((key) => {
      const line = Number(key);
      if (!Number.isFinite(line) || line <= 0 || line > maxLine) return;
      nextInstructions[String(line)] = currentInstructions[key];
    });
    const removedCount = currentKeys.length - Object.keys(nextInstructions).length;
    if (removedCount <= 0) return;

    dispatchInteraction({ type: "SET_INSTRUCTIONS", instructions: nextInstructions });
    setPreviewInstructionLine((prev) =>
      prev && Object.prototype.hasOwnProperty.call(nextInstructions, String(prev)) ? prev : null
    );
    showToast(`코드 변경으로 ${removedCount}개 메모가 제거되었습니다.`);
  }, [showToast, uiSettings.memoResetPolicy]);

  const updateViewer = useCallback((code, language, url, sourceTheme) => {
    const resolvedTheme = resolveThemeModeTheme(uiSettings.themeMode, sourceTheme);
    if (!code) {
      lastRenderKeyRef.current = "";
      hasRenderedOnceRef.current = false;
      contentIdentityRef.current = "";
      renderPayload("", "text", "", sourceTheme, resolvedTheme);
      return;
    }
    const kind = resolveRenderKind(language, code);
    const source = normalizeSource(url);
    const contentIdentity = buildContentIdentity(code, kind, source);
    if (contentIdentityRef.current && contentIdentityRef.current !== contentIdentity) {
      applyInstructionPolicyForContentChange(code);
    }
    contentIdentityRef.current = contentIdentity;
    const renderKey = buildRenderKey(code, kind, source, resolvedTheme);
    if (hasRenderedOnceRef.current && renderKey === lastRenderKeyRef.current) {
      return;
    }
    hasRenderedOnceRef.current = true;
    lastRenderKeyRef.current = renderKey;
    renderPayload(code, kind, source, sourceTheme, resolvedTheme);
  }, [applyInstructionPolicyForContentChange, renderPayload, uiSettings.themeMode]);

  const sendPanelStatus = useCallback((open) => {
    const tabId = currentTabIdRef.current;
    if (tabId === null || tabId === undefined) return;
    chrome.runtime.sendMessage(
      { type: "PRISM_PANEL_STATUS", tabId, open: Boolean(open) },
      () => {
        if (chrome.runtime?.lastError) {
          // Ignore transient messaging errors.
        }
      }
    );
    if (open && panelPortRef.current) {
      try {
        panelPortRef.current.postMessage({ tabId });
      } catch (err) {
        panelPortRef.current = null;
      }
    }
  }, []);

  const connectHeartbeat = useCallback(() => {
    try {
      const port = chrome.runtime.connect({ name: "prism-heartbeat" });
      panelPortRef.current = port;
      port.onDisconnect.addListener(() => {
        panelPortRef.current = null;
        setTimeout(connectHeartbeat, 1000);
      });
      if (currentTabIdRef.current !== null && currentTabIdRef.current !== undefined) {
        port.postMessage({ tabId: currentTabIdRef.current });
      }
    } catch (err) {
      panelPortRef.current = null;
    }
  }, []);

  const setTabId = useCallback((tabId) => {
    if (tabId === null || tabId === undefined) return;
    currentTabIdRef.current = tabId;
    if (panelPortRef.current) {
      try {
        panelPortRef.current.postMessage({ tabId });
      } catch (err) {
        panelPortRef.current = null;
      }
    }
  }, []);

  const requestLatest = useCallback((tabId) => {
    chrome.runtime.sendMessage({ type: "PRISM_GET_LATEST", tabId }, (resp) => {
      if (resp?.payload) {
        updateViewer(resp.payload.code, resp.payload.language, resp.payload.url, resp.payload.theme);
      }
    });
  }, [updateViewer]);

  const resolveTabId = useCallback(() => {
    if (targetTabId) {
      const parsedId = Number(targetTabId);
      const tabId = Number.isFinite(parsedId) ? parsedId : targetTabId;
      setTabId(tabId);
      sendPanelStatus(true);
      requestLatest(tabId);
      return;
    }

    if (chrome.tabs?.getCurrent) {
      chrome.tabs.getCurrent((tab) => {
        if (tab?.id !== undefined) {
          setTabId(tab.id);
          sendPanelStatus(true);
          requestLatest(tab.id);
          return;
        }
        if (chrome.tabs?.query) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs?.[0]?.id;
            if (tabId !== undefined) {
              setTabId(tabId);
              sendPanelStatus(true);
            }
            requestLatest(tabId);
          });
        } else {
          requestLatest();
        }
      });
      return;
    }

    if (chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs?.[0]?.id;
        if (tabId !== undefined) {
          setTabId(tabId);
          sendPanelStatus(true);
        }
        requestLatest(tabId);
      });
      return;
    }

    requestLatest();
  }, [requestLatest, sendPanelStatus, setTabId, targetTabId]);

  const returnToSourceTab = useCallback(() => {
    if (!targetTabId) return;
    const tabId = Number(targetTabId);
    if (!Number.isFinite(tabId)) return;
    sendPanelStatus(false);
    chrome.tabs.get(tabId, (tab) => {
      if (!tab?.windowId) return;
      chrome.windows.update(tab.windowId, { focused: true }, () => {
        chrome.tabs.update(tabId, { active: true }, () => {
          if (chrome.sidePanel?.open) {
            chrome.sidePanel.open({ tabId }).finally(() => {
              window.close();
            });
          } else {
            window.close();
          }
        });
      });
    });
  }, [sendPanelStatus, targetTabId]);

  useEffect(() => {
    if (!isWindowMode || !targetTabId) return;
    setWindowHintVisible(true);
    const timer = window.setTimeout(() => setWindowHintVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [isWindowMode, targetTabId]);

  useEffect(() => {
    if (!isWindowMode || !targetTabId) return;
    const handleMouse = (event) => {
      if (event.button === 4) {
        returnToSourceTab();
      }
    };
    const handleKey = (event) => {
      if (event.altKey && event.key === "ArrowLeft") {
        returnToSourceTab();
      }
    };
    window.addEventListener("mousedown", handleMouse);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleMouse);
      window.removeEventListener("keydown", handleKey);
    };
  }, [isWindowMode, returnToSourceTab, targetTabId]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }

    const handleMessages = (message) => {
      if (message?.type === "PRISM_RENDER") {
        // [수정] 탭 ID가 달라도 항상 렌더링을 수행
        // Chrome 사이드패널은 탭 전환 시에도 동일 인스턴스가 유지되므로
        // 어떤 탭에서 온 메시지든 수용하고 내부 tabId를 갱신
        if (message.tabId !== undefined) {
          setTabId(message.tabId);
        }
        updateViewer(message.code, message.language, message.url, message.theme);
        sendPanelStatus(true);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessages);
    connectHeartbeat();
    resolveTabId();

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessages);
      sendPanelStatus(false);
      if (panelPortRef.current) {
        panelPortRef.current.disconnect();
        panelPortRef.current = null;
      }
    };
  }, [connectHeartbeat, resolveTabId, sendPanelStatus, setTabId, updateViewer]);

  const handleViewerReady = useCallback(() => {
    viewerReadyRef.current = true;
    if (pendingPayloadRef.current) {
      postToSandbox(pendingPayloadRef.current);
      pendingPayloadRef.current = null;
    }
    if (pendingUiStateRef.current) {
      sendUiState(pendingUiStateRef.current);
    } else {
      sendUiState();
    }
  }, [postToSandbox, sendUiState]);

  useEffect(() => {
    if (isPickerDisabled && pickerActive) {
      dispatchInteraction({ type: "SET_PICKER_ACTIVE", active: false });
    }
  }, [isPickerDisabled, pickerActive]);

  useEffect(() => {
    if (isFreezeDisabled && canvasFrozen) {
      dispatchInteraction({ type: "TOGGLE_FROZEN" });
    }
  }, [canvasFrozen, isFreezeDisabled]);

  useEffect(() => {
    sendUiState();
  }, [sendUiState]);

  useEffect(() => {
    const payload = latestPayloadRef.current;
    if (!payload?.code) return;
    updateViewer(payload.code, payload.language, payload.url, payload.theme);
  }, [uiSettings.themeMode, updateViewer]);

  useEffect(() => {
    const handleMessage = (event) => {
      const viewer = viewerRef.current;
      if (!viewer || event.source !== viewer.contentWindow) return;
      const data = event.data || {};

      if (data.type === "PRISM_RETURN_REQUEST") {
        returnToSourceTab();
        return;
      }

      if (data.type === "PRISM_PICKER_SELECT") {
        if (!ENABLE_PICKER) return;
        dispatchInteraction({
          type: "PICKER_SELECT",
          line: data.line,
          rect: data.rect || null,
          keepPickerActiveAfterSelect: uiSettings.keepPickerActiveAfterSelect,
        });
        return;
      }

      if (data.type === "PRISM_DEVLOG") {
        chrome.runtime.sendMessage({
          type: "PRISM_DEVLOG",
          source: "sandbox",
          stage: data.stage,
          payload: data.payload
        });
        return;
      }

      if (data.type === "PRISM_RUNTIME_CAPABILITIES") {
        const caps = data.capabilities || {};
        setRuntimeCapabilities({
          picker: caps.picker !== false,
          snapshot: caps.snapshot !== false,
          freeze: caps.freeze !== false,
          reasons: caps.reasons && typeof caps.reasons === "object" ? caps.reasons : {},
        });
        return;
      }

      if (data.type === "PRISM_CAPTURE_UNSUPPORTED") {
        pendingSnapshotActionRef.current = null;
        snapshotCooldownRef.current = 0;
        showToast(data.reason || "Snapshot unavailable for current render.");
        return;
      }

      if (data.type === "PRISM_PICKER_UNSUPPORTED") {
        if (pickerActive) {
          dispatchInteraction({ type: "SET_PICKER_ACTIVE", active: false });
        }
        showToast(data.reason || "Picker unavailable for current render.");
        return;
      }

      if (data.type === "PRISM_INSTRUCTION_NAVIGATE_MISS") {
        showToast(data.reason || "지정한 메모 대상 요소를 찾지 못했습니다.");
        return;
      }

      if (data.type === "PRISM_EXPORT_FOR_CAPTURE") {
        const action = pendingSnapshotActionRef.current || "download";
        pendingSnapshotActionRef.current = null;
        performCaptureInParent(
          { ...data, action },
          latestPayloadRef.current,
          showToast
        );
        return;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [pickerActive, returnToSourceTab, showToast, uiSettings.keepPickerActiveAfterSelect]);

  const handleSnapshot = useCallback((action = "download") => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.contentWindow || !viewerReadyRef.current) return;
    if (isSnapshotDisabled) {
      const reason = runtimeCapabilities?.reasons?.snapshot;
      if (reason) showToast(reason);
      return;
    }
    if (pendingSnapshotActionRef.current || Date.now() < snapshotCooldownRef.current) {
      showToast("Processing... please wait.");
      return;
    }
    flashCapture();
    snapshotCooldownRef.current = Date.now() + SNAPSHOT_COOLDOWN_MS;
    pendingSnapshotActionRef.current = action;
    viewer.contentWindow.postMessage({ type: "PRISM_SNAPSHOT" }, "*");
  }, [flashCapture, isSnapshotDisabled, runtimeCapabilities?.reasons?.snapshot, showToast]);

  const handleSaveHtml = useCallback(() => {
    const payload = latestPayloadRef.current;
    if (!payload?.code) return;
    const blob = new Blob([payload.code], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download(
      {
        url,
        filename: "prism-export.html",
        saveAs: true,
      },
      () => URL.revokeObjectURL(url)
    );
  }, []);

  const handleThemeModeChange = useCallback((nextThemeMode) => {
    const resolvedThemeMode = VALID_THEME_MODES.includes(nextThemeMode)
      ? nextThemeMode
      : "detect";
    setUiSettings((prev) => ({
      ...prev,
      themeMode: resolvedThemeMode,
    }));
  }, []);

  const handleCodeUpdate = useCallback((newCode) => {
    const payload = latestPayloadRef.current;
    if (!payload) return;
    updateViewer(newCode, detectKind(newCode), payload.url, payload.theme);
  }, [updateViewer]);

  const handleSaveInstruction = useCallback((text) => {
    const lineNumber = activeInstructionLine;
    const nextText = (text || "").trim();
    if (!lineNumber || !nextText) return;
    dispatchInteraction({ type: "SAVE_ACTIVE_INSTRUCTION", text: nextText });
    showToast(`Line ${lineNumber} 메모 저장됨`);
  }, [activeInstructionLine, showToast]);

  const handleClearSelection = useCallback(() => {
    dispatchInteraction({ type: "CLEAR_SELECTION" });
  }, []);

  const handleRemoveInstruction = useCallback(() => {
    const lineNumber = activeInstructionLine;
    if (!lineNumber) return;
    dispatchInteraction({ type: "REMOVE_ACTIVE_INSTRUCTION" });
    showToast(`Line ${lineNumber} 메모 삭제됨`);
  }, [activeInstructionLine, showToast]);

  const handleInstructionHover = useCallback((line) => {
    const nextLine = Number(line);
    if (!Number.isFinite(nextLine) || nextLine <= 0) {
      setPreviewInstructionLine(null);
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(instructionsRef.current || {}, String(nextLine))) {
      setPreviewInstructionLine(null);
      return;
    }
    setPreviewInstructionLine(nextLine);
  }, []);

  const handleInstructionSelect = useCallback((line) => {
    const lineNumber = Number(line);
    if (!Number.isFinite(lineNumber) || lineNumber <= 0) return;
    const viewer = viewerRef.current;
    setPreviewInstructionLine(null);
    if (!viewer || !viewer.contentWindow || !viewerReadyRef.current) {
      showToast("Viewer is not ready yet.");
      return;
    }
    viewer.contentWindow.postMessage(
      { type: "PRISM_INSTRUCTION_NAVIGATE", line: lineNumber, behavior: "smooth" },
      "*"
    );
  }, [showToast]);

  const handleInstructionDelete = useCallback((line) => {
    const lineNumber = Number(line);
    if (!Number.isFinite(lineNumber) || lineNumber <= 0) return;
    dispatchInteraction({ type: "REMOVE_INSTRUCTION_BY_LINE", line: lineNumber });
    setPreviewInstructionLine((prev) => (prev === lineNumber ? null : prev));
    showToast(`Line ${lineNumber} 메모 삭제됨`);
  }, [showToast]);

  const handleClearAllInstructions = useCallback(() => {
    if (instructionCount === 0) return;
    dispatchInteraction({ type: "CLEAR_INSTRUCTIONS" });
    setPreviewInstructionLine(null);
    showToast("모든 메모가 삭제되었습니다.");
  }, [instructionCount, showToast]);

  const handleExportPrompt = useCallback(() => {
    const payload = latestPayloadRef.current;
    if (!payload?.code) return;
    if (instructionEntries.length === 0) {
      showToast("먼저 요소에 메모를 남겨주세요.");
      return;
    }

    const detailLevel = [1, 2, 3].includes(Number(uiSettings.exportPromptLevel))
      ? Number(uiSettings.exportPromptLevel)
      : 2;
    const lines = payload.code.split('\n');
    let prompt = "Please modify the following HTML based on the provided instructions.\n\n";

    prompt += "### INSTRUCTIONS\n";
    instructionEntries.forEach(({ line, memoText }) => {
      prompt += `- Line ${line}: ${memoText}\n`;
    });

    if (detailLevel >= 2) {
      prompt += "\n### TARGET SNIPPETS\n";
      instructionEntries.forEach(({ line }) => {
        const lineNum = String(line);
        const idx = Number(lineNum) - 1;
        const start = Math.max(0, idx - 2);
        const end = Math.min(lines.length, idx + 3);
        prompt += `--- Snippet around Line ${lineNum} ---\n`;
        prompt += lines.slice(start, end).join('\n');
        prompt += "\n\n";
      });
    }

    if (detailLevel >= 3) {
      prompt += "### FULL CODE\n";
      prompt += payload.code;
    }

    navigator.clipboard.writeText(prompt).then(() => {
      if (uiSettings.memoResetPolicy === "on_copy") {
        dispatchInteraction({ type: "CLEAR_INSTRUCTIONS" });
        setPreviewInstructionLine(null);
        showToast("Prompt copied. 메모가 초기화되었습니다.");
        return;
      }
      showToast("Prompt copied to clipboard!");
    });
  }, [instructionEntries, showToast, uiSettings.exportPromptLevel, uiSettings.memoResetPolicy]);

  const handleOpenWindow = useCallback(() => {
    const payload = latestPayloadRef.current;
    if (!payload?.code) {
      alert("No code to render.");
      return;
    }
    const tabId = currentTabIdRef.current ?? "_global";
    const url = chrome.runtime.getURL(
      `sidepanel/dist/index.html?mode=window&tabId=${encodeURIComponent(tabId)}`
    );
    chrome.tabs.create({ url }, (createdTab) => {
      const notifyTabId = createdTab?.id;
      chrome.runtime.sendMessage(
        {
          type: "PRISM_SET_LATEST",
          tabId,
          payload,
          notifyTabId
        },
        () => {
          window.close();
        }
      );
    });
  }, []);

  const handleExpertToggle = useCallback(() => {
    if (!ENABLE_EXPERT_MODE) return;
    setExpertMode((prev) => !prev);
  }, []);

  const handlePickerToggle = useCallback(() => {
    if (!ENABLE_PICKER) return;
    if (isPickerDisabled) {
      const reason = runtimeCapabilities?.reasons?.picker;
      if (reason) showToast(reason);
      return;
    }
    if (runtimeCapabilities?.picker === false) {
      const reason = runtimeCapabilities?.reasons?.picker;
      if (reason) showToast(reason);
    }
    dispatchInteraction({
      type: "TOGGLE_PICKER",
      autoPause: uiSettings.pickerAutoPause,
    });
  }, [isPickerDisabled, runtimeCapabilities?.picker, runtimeCapabilities?.reasons?.picker, showToast, uiSettings.pickerAutoPause]);

  const handleFreezeToggle = useCallback(() => {
    if (isFreezeDisabled) {
      const reason = runtimeCapabilities?.reasons?.freeze;
      if (reason) showToast(reason);
      return;
    }
    if (runtimeCapabilities?.freeze === false) {
      const reason = runtimeCapabilities?.reasons?.freeze;
      if (reason) showToast(reason);
    }
    dispatchInteraction({ type: "TOGGLE_FROZEN" });
  }, [isFreezeDisabled, runtimeCapabilities?.freeze, runtimeCapabilities?.reasons?.freeze, showToast]);

  const handleToggleSetting = useCallback((key) => {
    setUiSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleUpdateSetting = useCallback((key, value) => {
    setUiSettings((prev) => {
      if (key === "pickerHighlightStrength") {
        return {
          ...prev,
          pickerHighlight: {
            ...(prev.pickerHighlight || DEFAULT_UI_SETTINGS.pickerHighlight),
            strength: value,
          },
        };
      }
      if (key === "pickerHighlightColor") {
        return {
          ...prev,
          pickerHighlight: {
            ...(prev.pickerHighlight || DEFAULT_UI_SETTINGS.pickerHighlight),
            color: value,
          },
        };
      }
      if (key === "memoResetPolicy") {
        return {
          ...prev,
          memoResetPolicy: VALID_MEMO_RESET_POLICIES.includes(value)
            ? value
            : DEFAULT_UI_SETTINGS.memoResetPolicy,
        };
      }
      return {
        ...prev,
        [key]: value,
      };
    });
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      sendPanelStatus(false);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [sendPanelStatus]);

  if (isWindowMode) {
    return (
      <div className="prism-window">
        <div
          id="window-hint"
          className={windowHintVisible ? "is-visible" : ""}
          role="status"
          aria-live="polite"
        >
          Alt + Left to go back
        </div>
        <Viewer ref={viewerRef} onReady={handleViewerReady} containerClassName="prism-window__content" />
      </div>
    );
  }

  return (
    <div className="panel-shell">
      <Header
        onSaveHtml={handleSaveHtml}
        onSnapshot={() => handleSnapshot("download")}
        onCopy={() => handleSnapshot("clipboard")}
        onOpenWindow={handleOpenWindow}
        onExportPrompt={handleExportPrompt}
        pickerActive={pickerActive}
        onPickerToggle={handlePickerToggle}
        isPickerDisabled={isPickerDisabled}
        isSnapshotDisabled={isSnapshotDisabled}
        isFreezeDisabled={isFreezeDisabled}
        isExportPromptDisabled={isExportPromptDisabled}
        instructionCount={instructionCount}
        canvasFrozen={canvasFrozen}
        onFreezeToggle={handleFreezeToggle}
        uiSettings={uiSettings}
        onToggleSetting={handleToggleSetting}
        onUpdateSetting={handleUpdateSetting}
        themeMode={uiSettings.themeMode}
        onThemeModeChange={handleThemeModeChange}
      />
      <div className="viewer-container">
        <NotesIsland
          instructionEntries={instructionEntries}
          instructionCount={instructionCount}
          toastMessage={toast?.isVisible ? toast.message : ""}
          pickerActive={pickerActive}
          canvasFrozen={canvasFrozen}
          onInstructionHover={handleInstructionHover}
          onInstructionSelect={handleInstructionSelect}
          onInstructionDelete={handleInstructionDelete}
          onClearAllInstructions={handleClearAllInstructions}
        />
        <div className="viewer-frame">
          <Viewer ref={viewerRef} onReady={handleViewerReady} />
          <div
            id="prism-capture-flash"
            ref={flashRef}
            onAnimationEnd={handleFlashAnimationEnd}
          />
        </div>
        {activeInstructionLine !== null && (
          <FloatingInput
            line={activeInstructionLine}
            initialValue={instructions[activeInstructionLine] || ''}
            elementRect={activeElementRect}
            viewerRect={viewerRef.current?.getBoundingClientRect?.()}
            canvasFrozen={canvasFrozen}
            onSave={handleSaveInstruction}
            onRemove={handleRemoveInstruction}
            onClose={handleClearSelection}
          />
        )}
      </div>
      {ENABLE_EXPERT_MODE && expertMode && (
        <ExpertEditor
          code={latestPayload?.code || ""}
          onCodeUpdate={handleCodeUpdate}
          theme={activeTheme}
          focusLine={focusLine}
          focusToken={focusToken}
        />
      )}
    </div>
  );
}

export default App;
