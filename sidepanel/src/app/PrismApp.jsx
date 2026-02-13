import React, { useState, useEffect, useRef, useMemo, useCallback, useReducer } from 'react';
import Header from '../features/workspace/components/Header.jsx';
import Viewer from '../features/workspace/components/Viewer.jsx';
import CommandBar from '../features/workspace/components/CommandBar.jsx';
import NotesIsland from '../features/workspace/components/NotesIsland.jsx';
import ExpertEditor from '../features/workspace/components/ExpertEditor.jsx';
import { performCaptureInParent } from '../shared/utils/capture.js';
import { useToast } from '../shared/hooks/useToast.jsx';
import { buildCodeFingerprint, buildExportPrompt } from '../core/prompt/promptComposer.js';
import {
  PATCH_FULL_SYNC_CADENCE_OPTIONS,
  UI_SETTINGS_KEY,
  VALID_STARTUP_MODES,
  VALID_THEME_MODES,
  DEFAULT_UI_SETTINGS,
  loadUiSettings,
  resolveThemeModeTheme,
} from '../core/settings/uiSettings.js';
import {
  SHORTCUT_HELP_TEXT,
  isEditableTarget,
  isModKey,
  keyEquals,
} from '../core/settings/shortcuts.js';

const ENABLE_EXPERT_MODE = false;
const ENABLE_PICKER = true;
const SNAPSHOT_COOLDOWN_MS = 900;
const DEFAULT_RUNTIME_CAPABILITIES = Object.freeze({
  picker: true,
  snapshot: true,
  freeze: true,
  reasons: {},
});

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
  let tokenSeq = 1;
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
    const hasToken = /data-prism-token\s*=/.test(tagText);
    const prefix = html.slice(i + 1, nameStart);
    const rest = html.slice(j, k + 1);
    const isSelfClosing = /\/\s*>$/.test(tagText);
    const tagLower = tagName.toLowerCase();
    if (!hasLine || !hasToken) {
      const lineAttr = !hasLine ? ` data-prism-line="${line}"` : "";
      const tokenAttr = !hasToken ? ` data-prism-token="n${(tokenSeq++).toString(36)}"` : "";
      out += `<${prefix}${tagName}${lineAttr}${tokenAttr}${rest}`;
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
  const kind = language && language !== "text" ? language : detectKind(code);
  const source = normalizeSource(url);
  const resolvedTheme = theme || "light";
  return `${kind}::${resolvedTheme}::${source || ""}::${code}`;
}

function buildContentIdentity(code, language, url) {
  if (!code) return "";
  const kind = language && language !== "text" ? language : detectKind(code);
  const source = normalizeSource(url);
  return `${kind}::${source || ""}::${code}`;
}

function normalizeInstructionToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  if (!/^[A-Za-z0-9:_-]{1,64}$/.test(raw)) return "";
  return raw;
}

function normalizeInstructionValue(value) {
  if (value && typeof value === "object") {
    return {
      memoText: String(value.memoText ?? value.text ?? "").trim(),
      token: normalizeInstructionToken(value.token),
    };
  }
  return {
    memoText: String(value || "").trim(),
    token: "",
  };
}

function buildRuntimeInstructionsMap(instructions) {
  const source = instructions && typeof instructions === "object" ? instructions : {};
  const out = {};
  Object.entries(source).forEach(([line, rawValue]) => {
    const numericLine = Number(line);
    if (!Number.isFinite(numericLine) || numericLine <= 0) return;
    const normalized = normalizeInstructionValue(rawValue);
    if (!normalized.memoText) return;
    out[String(numericLine)] = {
      memoText: normalized.memoText,
      token: normalized.token,
    };
  });
  return out;
}

const initialInteractionState = {
  pickerActive: true,
  canvasFrozen: false,
  focusLine: null,
  focusToken: 0,
  instructions: {},
  activeInstructionLine: null,
  activeInstructionToken: null,
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
          activeInstructionToken: null,
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
          activeInstructionToken: null,
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
      const nextToken = normalizeInstructionToken(action.token);
      const currentForLine = normalizeInstructionValue(state.instructions[String(line)]);
      const activeTokenForLine =
        state.activeInstructionLine === line
          ? normalizeInstructionToken(state.activeInstructionToken)
          : "";
      return {
        ...state,
        pickerActive:
          action.keepPickerActiveAfterSelect === false ? false : state.pickerActive,
        focusLine: line,
        focusToken: state.focusToken + 1,
        activeInstructionLine: line,
        activeInstructionToken: nextToken || activeTokenForLine || currentForLine.token || null,
        activeElementRect: action.rect || null,
      };
    }
    case "SAVE_ACTIVE_INSTRUCTION": {
      const line = state.activeInstructionLine;
      const text = (action.text || "").trim();
      if (!line || !text) return state;
      const key = String(line);
      const existing = normalizeInstructionValue(state.instructions[key]);
      const nextToken = normalizeInstructionToken(
        action.token || state.activeInstructionToken || existing.token
      );
      return {
        ...state,
        instructions: {
          ...state.instructions,
          [line]: {
            memoText: text,
            token: nextToken,
          },
        },
        activeInstructionLine: null,
        activeInstructionToken: null,
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
        activeInstructionToken: null,
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
        activeInstructionToken: shouldClearActive ? null : state.activeInstructionToken,
        activeElementRect: shouldClearActive ? null : state.activeElementRect,
      };
    }
    case "CLEAR_INSTRUCTIONS":
      return {
        ...state,
        instructions: {},
        activeInstructionLine: null,
        activeInstructionToken: null,
        activeElementRect: null,
      };
    case "SET_INSTRUCTIONS": {
      const rawInstructions =
        action.instructions && typeof action.instructions === "object"
          ? action.instructions
          : {};
      const nextInstructions = {};
      Object.entries(rawInstructions).forEach(([key, rawValue]) => {
        const line = Number(key);
        if (!Number.isFinite(line) || line <= 0) return;
        const normalized = normalizeInstructionValue(rawValue);
        if (!normalized.memoText) return;
        nextInstructions[String(line)] = {
          memoText: normalized.memoText,
          token: normalized.token,
        };
      });
      const activeLine = Number(state.activeInstructionLine);
      const keepActive =
        Number.isFinite(activeLine) &&
        activeLine > 0 &&
        Object.prototype.hasOwnProperty.call(nextInstructions, String(activeLine));
      const activeValue = keepActive
        ? normalizeInstructionValue(nextInstructions[String(activeLine)])
        : { memoText: "", token: "" };
      return {
        ...state,
        instructions: nextInstructions,
        activeInstructionLine: keepActive ? activeLine : null,
        activeInstructionToken: keepActive ? activeValue.token || null : null,
        activeElementRect: keepActive ? state.activeElementRect : null,
      };
    }
    case "CLEAR_SELECTION":
      return {
        ...state,
        activeInstructionLine: null,
        activeInstructionToken: null,
        activeElementRect: null,
      };
    default:
      return state;
  }
}

function PrismApp() {
  const [latestPayload, setLatestPayload] = useState(null);
  const [expertMode, setExpertMode] = useState(false);
  const [initialUiSettings] = useState(() => loadUiSettings());
  const [uiSettings, setUiSettings] = useState(initialUiSettings);
  const [isEditorModeEnabled, setIsEditorModeEnabled] = useState(
    () => (initialUiSettings?.startupMode || "view") === "edit"
  );
  const [globalMemoText, setGlobalMemoText] = useState("");
  const [interactionState, dispatchInteraction] = useReducer(
    interactionReducer,
    initialInteractionState
  );
  const [runtimeCapabilities, setRuntimeCapabilities] = useState(() => DEFAULT_RUNTIME_CAPABILITIES);
  const [previewInstructionLine, setPreviewInstructionLine] = useState(null);
  const [notesPulseToken, setNotesPulseToken] = useState(0);
  const [repairNudgeToken, setRepairNudgeToken] = useState(0);
  const {
    pickerActive,
    focusLine,
    focusToken,
    instructions,
    activeInstructionLine,
    activeInstructionToken,
    canvasFrozen,
    activeElementRect,
  } = interactionState;

  const viewerRef = useRef(null);
  const panelShellRef = useRef(null);
  const altHoldPickerActiveRef = useRef(false);
  const pickerWasActiveBeforeAltHoldRef = useRef(false);
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
  const patchExportTurnRef = useRef(0);
  const pendingFullSyncRef = useRef(false);
  const lastExportSnapshotRef = useRef(null);
  const lastAutoRetryKeyRef = useRef("");
  const lastPatchRejectRef = useRef({ key: "", at: 0 });
  const patchRejectStreakRef = useRef(0);
  const { toast, showToast } = useToast();
  const activeTheme = useMemo(
    () => resolveThemeModeTheme(uiSettings.themeMode, latestPayload?.theme),
    [uiSettings.themeMode, latestPayload?.theme]
  );
  const runtimeInstructions = useMemo(
    () => buildRuntimeInstructionsMap(instructions),
    [instructions]
  );
  const targetedInstructionEntries = useMemo(() => {
    const codeLines = String(latestPayload?.code || "").split("\n");
    return Object.entries(instructions)
      .map(([line, rawValue]) => {
        const numericLine = Number(line) || 1;
        const normalized = normalizeInstructionValue(rawValue);
        if (!normalized.memoText) return null;
        return {
          line: numericLine,
          memoText: normalized.memoText,
          token: normalized.token,
          sourceLineText: codeLines[numericLine - 1] || "",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.line - b.line);
  }, [instructions, latestPayload?.code]);
  const globalInstructionEntry = useMemo(() => {
    const memo = String(globalMemoText || "").trim();
    if (!memo) return null;
    return {
      line: 0,
      memoText: memo,
      token: "global",
      sourceLineText: "",
      isGlobal: true,
    };
  }, [globalMemoText]);
  const instructionEntries = useMemo(() => {
    if (!globalInstructionEntry) return targetedInstructionEntries;
    return [globalInstructionEntry, ...targetedInstructionEntries];
  }, [globalInstructionEntry, targetedInstructionEntries]);
  const targetedInstructionCount = targetedInstructionEntries.length;
  const instructionCount = instructionEntries.length;
  const selectedLine = Number(activeInstructionLine) || null;
  const selectedInstruction =
    selectedLine
      ? normalizeInstructionValue(instructions[String(selectedLine)])
      : { memoText: String(globalMemoText || "").trim(), token: "" };
  const selectedInstructionToken = useMemo(() => {
    const direct = normalizeInstructionToken(activeInstructionToken);
    if (direct) return direct;
    if (!selectedLine) return "";
    return normalizeInstructionValue(instructions[String(selectedLine)]).token;
  }, [activeInstructionToken, instructions, selectedLine]);
  const selectedMemoText = selectedInstruction.memoText || "";
  const isHtmlPayload = latestPayload?.language === "html";
  const isPickerDisabled =
    !ENABLE_PICKER ||
    !isHtmlPayload ||
    runtimeCapabilities?.picker === false;
  const isSnapshotDisabled =
    !latestPayload?.code ||
    (isHtmlPayload && runtimeCapabilities?.snapshot === false);
  const isFreezeDisabled =
    !latestPayload?.code ||
    !isHtmlPayload ||
    (isHtmlPayload && runtimeCapabilities?.freeze === false);
  const isExportPromptDisabled =
    !latestPayload?.code ||
    !isHtmlPayload ||
    instructionCount === 0;
  const pickerEnabledForRuntime = Boolean(
    ENABLE_PICKER &&
      !isPickerDisabled &&
      pickerActive
  );
  const { targetTabId, isWindowMode } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      targetTabId: params.get("tabId"),
      isWindowMode: params.get("mode") === "window",
    };
  }, []);

  const [windowHintVisible, setWindowHintVisible] = useState(false);
  const [commandBarMaxWidthPx, setCommandBarMaxWidthPx] = useState(null);

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

  useEffect(() => {
    const panelEl = panelShellRef.current;
    if (!panelEl) return undefined;

    const setHalfWidth = () => {
      const width = Number(panelEl.clientWidth) || 0;
      if (width <= 0) return;
      setCommandBarMaxWidthPx(Math.round(width * 0.5));
    };

    setHalfWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", setHalfWidth);
      return () => {
        window.removeEventListener("resize", setHalfWidth);
      };
    }

    const observer = new ResizeObserver(() => {
      setHalfWidth();
    });
    observer.observe(panelEl);
    return () => {
      observer.disconnect();
    };
  }, []);

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
      pickerActive: pickerEnabledForRuntime,
      frozen: Boolean(canvasFrozen),
      instructions: runtimeInstructions,
      instructionsCount: targetedInstructionCount,
      previewLine: isEditorModeEnabled ? previewInstructionLine : null,
      editingLine:
        isEditorModeEnabled && Number.isFinite(selectedLine) && selectedLine > 0
          ? selectedLine
          : null,
      editingToken:
        isEditorModeEnabled && Number.isFinite(selectedLine) && selectedLine > 0
          ? selectedInstructionToken || null
          : null,
      settings: uiSettings,
      autoImportResponse: Boolean(uiSettings.autoImportResponse),
      isViewMode: !isEditorModeEnabled,
    };
  }, [canvasFrozen, isEditorModeEnabled, pickerEnabledForRuntime, previewInstructionLine, runtimeInstructions, selectedInstructionToken, selectedLine, targetedInstructionCount, uiSettings]);

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
    const kind = language && language !== "text" ? language : detectKind(code);
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
    const instructionKeys = Object.keys(currentInstructions);
    const hasGlobalMemo = Boolean(String(globalMemoText || "").trim());
    if (instructionKeys.length === 0 && !hasGlobalMemo) return;
    if (uiSettings.memoResetPolicy === "on_code_change") {
      dispatchInteraction({ type: "CLEAR_INSTRUCTIONS" });
      setGlobalMemoText("");
      setPreviewInstructionLine(null);
      showToast("코드 변경으로 메모가 초기화되었습니다.");
      return;
    }
    if (instructionKeys.length === 0) return;

    const maxLine = Math.max(1, String(nextCode || "").split("\n").length);
    const nextInstructions = {};
    instructionKeys.forEach((key) => {
      const line = Number(key);
      if (!Number.isFinite(line) || line <= 0 || line > maxLine) return;
      nextInstructions[String(line)] = currentInstructions[key];
    });
    const removedCount = instructionKeys.length - Object.keys(nextInstructions).length;
    if (removedCount <= 0) return;

    dispatchInteraction({ type: "SET_INSTRUCTIONS", instructions: nextInstructions });
    setPreviewInstructionLine((prev) =>
      prev && Object.prototype.hasOwnProperty.call(nextInstructions, String(prev)) ? prev : null
    );
    showToast(`코드 변경으로 ${removedCount}개 메모가 정리되었습니다.`);
  }, [globalMemoText, showToast, uiSettings.memoResetPolicy]);

  const updateViewer = useCallback((code, language, url, sourceTheme) => {
    const resolvedTheme = resolveThemeModeTheme(uiSettings.themeMode, sourceTheme);
    if (!code) {
      lastRenderKeyRef.current = "";
      hasRenderedOnceRef.current = false;
      contentIdentityRef.current = "";
      renderPayload("", "text", "", sourceTheme, resolvedTheme);
      return;
    }
    const kind = language && language !== "text" ? language : detectKind(code);
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
    if (!isEditorModeEnabled) return;
    if (isPickerDisabled) return;
    if (!isHtmlPayload) return;
    if (pickerActive) return;
    dispatchInteraction({ type: "SET_PICKER_ACTIVE", active: true });
  }, [isHtmlPayload, isPickerDisabled, isEditorModeEnabled, pickerActive]);

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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "PRISM_SET_VIEW_MODE", enabled: !isEditorModeEnabled });
      }
    });
  }, [isEditorModeEnabled]);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "PRISM_UI_STATE",
          autoImportResponse: Boolean(uiSettings.autoImportResponse),
          aiResponseMode: uiSettings.aiResponseMode,
        });
      }
    });
  }, [uiSettings.aiResponseMode, uiSettings.autoImportResponse]);

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
        const line = Number(data.line) || 1;
        const nextToken = normalizeInstructionToken(data.token);
        const currentToken = normalizeInstructionToken(activeInstructionToken);
        if (Number(activeInstructionLine) === line && currentToken === nextToken) {
          dispatchInteraction({ type: "CLEAR_SELECTION" });
          return;
        }
        dispatchInteraction({
          type: "PICKER_SELECT",
          line,
          token: nextToken,
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

      if (data.type === "PRISM_PICKER_DEBUG_COPY") {
        const text = typeof data.text === "string" ? data.text : "";
        if (!text) return;
        const copyPromise =
          navigator.clipboard && navigator.clipboard.writeText
            ? navigator.clipboard.writeText(text)
            : Promise.reject(new Error("clipboard_unavailable"));
        copyPromise
          .then(() => {
            showToast("디버그 스냅샷 복사됨");
          })
          .catch(() => {
            showToast("디버그 스냅샷 복사 실패");
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
        showToast(data.reason || "메모 대상 요소를 찾지 못했습니다.");
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
  }, [activeInstructionLine, activeInstructionToken, pickerActive, returnToSourceTab, showToast, uiSettings.keepPickerActiveAfterSelect]);

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

  const handleClearSelection = useCallback(() => {
    dispatchInteraction({ type: "CLEAR_SELECTION" });
  }, []);

  const handleAddMemoFromCommandBar = useCallback((text) => {
    const lineNumber = Number(activeInstructionLine) || null;
    const nextText = (text || "").trim();
    if (!nextText) return false;
    if (lineNumber) {
      dispatchInteraction({ type: "PICKER_SELECT", line: lineNumber, keepPickerActiveAfterSelect: true });
      dispatchInteraction({ type: "SAVE_ACTIVE_INSTRUCTION", text: nextText });
      showToast(`Line ${lineNumber} 메모 저장됨`);
    } else {
      setGlobalMemoText(nextText);
      showToast("라인 미지정 메모 저장됨");
    }
    setNotesPulseToken((prev) => prev + 1);
    return true;
  }, [activeInstructionLine, showToast]);

  const handleRemoveMemoFromCommandBar = useCallback(() => {
    const lineNumber = Number(activeInstructionLine) || null;
    if (lineNumber) {
      dispatchInteraction({ type: "PICKER_SELECT", line: lineNumber, keepPickerActiveAfterSelect: true });
      dispatchInteraction({ type: "REMOVE_ACTIVE_INSTRUCTION" });
      showToast(`Line ${lineNumber} 메모 삭제됨`);
      return;
    }
    if (!String(globalMemoText || "").trim()) return;
    setGlobalMemoText("");
    showToast("라인 미지정 메모 삭제됨");
  }, [activeInstructionLine, globalMemoText, showToast]);

  const handleInstructionHover = useCallback((line) => {
    setPreviewInstructionLine(line);
  }, []);

  const handleInstructionSelect = useCallback((payload) => {
    const numericLine =
      payload && typeof payload === "object"
        ? Number(payload.line)
        : Number(payload);
    if (!Number.isFinite(numericLine) || numericLine < 0) return;
    if (numericLine === 0) {
      dispatchInteraction({ type: "CLEAR_SELECTION" });
      return;
    }
    const token =
      payload && typeof payload === "object"
        ? normalizeInstructionToken(payload.token)
        : "";
    dispatchInteraction({
      type: "PICKER_SELECT",
      line: numericLine,
      token,
      keepPickerActiveAfterSelect: true,
    });
    const viewer = viewerRef.current;
    if (viewer?.contentWindow) {
      viewer.contentWindow.postMessage(
        {
          type: "PRISM_INSTRUCTION_NAVIGATE",
          line: numericLine,
          token,
          behavior: "smooth",
        },
        "*"
      );
    }
  }, []);

  const handleInstructionDelete = useCallback((payload) => {
    const numericLine =
      payload && typeof payload === "object"
        ? Number(payload.line)
        : Number(payload);
    if (!Number.isFinite(numericLine) || numericLine < 0) return;
    if (numericLine === 0) {
      setGlobalMemoText("");
      showToast("라인 미지정 메모 삭제됨");
      return;
    }
    const token =
      payload && typeof payload === "object"
        ? normalizeInstructionToken(payload.token)
        : "";
    dispatchInteraction({
      type: "PICKER_SELECT",
      line: numericLine,
      token,
      keepPickerActiveAfterSelect: true,
    });
    dispatchInteraction({ type: "REMOVE_ACTIVE_INSTRUCTION" });
    showToast(`Line ${numericLine} 메모 삭제됨`);
  }, [showToast]);

  const handleClearAllInstructions = useCallback(() => {
    if (instructionCount === 0) return;
    dispatchInteraction({ type: "CLEAR_INSTRUCTIONS" });
    setGlobalMemoText("");
    setPreviewInstructionLine(null);
    showToast("모든 메모가 삭제되었습니다.");
  }, [instructionCount, showToast]);

  const sendPromptToActiveTab = useCallback((prompt, action) => {
    return new Promise((resolve) => {
      if (!prompt) {
        resolve({ ok: false, reason: "empty_prompt" });
        return;
      }
      if (action !== "inject" && action !== "send") {
        resolve({ ok: true, skipped: true });
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        if (!activeTabId) {
          resolve({ ok: false, reason: "no_active_tab" });
          return;
        }
        chrome.tabs.sendMessage(
          activeTabId,
          {
            type: "PRISM_INJECT_PROMPT",
            text: prompt,
            action,
          },
          (response) => {
            const runtimeErr = chrome.runtime?.lastError;
            if (runtimeErr) {
              resolve({ ok: false, reason: runtimeErr.message || "send_message_failed" });
              return;
            }
            if (response && response.ok === false) {
              resolve({ ok: false, reason: response.reason || "inject_failed" });
              return;
            }
            resolve({ ok: true });
          }
        );
      });
    });
  }, []);

  const handleExportPrompt = useCallback(async (options = {}) => {
    const payload = options.payload || latestPayloadRef.current;
    const entries = Array.isArray(options.instructionEntries)
      ? options.instructionEntries.map((entry) => ({ ...entry }))
      : instructionEntries.map((entry) => ({ ...entry }));
    const selectedTargetFromOptions =
      options.selectedTarget && typeof options.selectedTarget === "object"
        ? options.selectedTarget
        : null;
    const selectedTarget =
      selectedTargetFromOptions ||
      (
        Number.isFinite(selectedLine) &&
        selectedLine > 0
          ? {
              line: selectedLine,
              token: selectedInstructionToken || "",
            }
          : null
      );
    const settingsSnapshot =
      options.settings && typeof options.settings === "object"
        ? { ...options.settings }
        : { ...uiSettings };
    const silentWhenNoMemo = Boolean(options.silentWhenNoMemo);
    const skipClipboard = Boolean(options.skipClipboard);
    const keepMemos = Boolean(options.keepMemos);
    const manualForceFullSync = Boolean(options.forceFullSync);
    const recoveryHint = typeof options.recoveryHint === "string" ? options.recoveryHint.trim() : "";
    const actionOverride = ["copy", "inject", "send"].includes(options.actionOverride)
      ? options.actionOverride
      : null;
    const action = actionOverride || settingsSnapshot.exportAction || "copy";

    if (!payload?.code) return false;
    if (entries.length === 0) {
      if (!silentWhenNoMemo) showToast("메모를 남겨주세요.");
      return false;
    }

    const cadence = PATCH_FULL_SYNC_CADENCE_OPTIONS.includes(Number(settingsSnapshot.patchFullSyncEvery))
      ? Number(settingsSnapshot.patchFullSyncEvery)
      : 0;
    const dueByCadence =
      settingsSnapshot.aiResponseMode === "patch" &&
      cadence > 0 &&
      ((patchExportTurnRef.current + 1) % cadence === 0);
    const forceFullSync = manualForceFullSync || pendingFullSyncRef.current || dueByCadence;
    const promptBundle = buildExportPrompt({
      payload,
      instructionEntries: entries,
      settings: settingsSnapshot,
      forceFullSync,
      recoveryHint,
      activeSelection: selectedTarget,
    });
    if (!promptBundle.prompt) return false;

    let defaultToast = skipClipboard
      ? promptBundle.forcedFullSync
        ? "Full sync prompt 전송됨"
        : "Prompt 전송됨"
      : promptBundle.forcedFullSync
        ? "Full sync prompt copied to clipboard!"
        : "Prompt copied to clipboard!";
    if (promptBundle.autoEscalatedToFull) {
      defaultToast = skipClipboard
        ? "복합 수정 감지: Full Code 요청으로 자동 전환 후 전송"
        : "복합 수정 감지: Full Code 요청으로 자동 전환";
    }
    const toastMessage =
      typeof options.toastMessage === "string" && options.toastMessage.trim()
        ? options.toastMessage.trim()
        : defaultToast;

    const applyPostExportState = async () => {
      const dispatchResult = await sendPromptToActiveTab(promptBundle.prompt, action);
      if (!dispatchResult?.ok) {
        pendingFullSyncRef.current = true;
        if (Boolean(options.isRetry)) {
          lastAutoRetryKeyRef.current = "";
          if (lastExportSnapshotRef.current) {
            lastExportSnapshotRef.current.retryUsed = false;
          }
        }
        const dispatchReason = dispatchResult?.reason ? ` (${dispatchResult.reason})` : "";
        showToast(`프롬프트 전송 실패${dispatchReason}`);
        return false;
      }

      if (!keepMemos && settingsSnapshot.memoResetPolicy === "on_copy") {
        dispatchInteraction({ type: "CLEAR_INSTRUCTIONS" });
        setGlobalMemoText("");
        setPreviewInstructionLine(null);
      }

      if (settingsSnapshot.aiResponseMode === "patch") {
        patchExportTurnRef.current =
          promptBundle.resolvedResponseMode === "patch"
            ? promptBundle.forcedFullSync
              ? 0
              : patchExportTurnRef.current + 1
            : 0;
      } else {
        patchExportTurnRef.current = 0;
      }
      pendingFullSyncRef.current = false;
      lastAutoRetryKeyRef.current = "";
      lastPatchRejectRef.current = { key: "", at: 0 };
      patchRejectStreakRef.current = 0;

      lastExportSnapshotRef.current = {
        createdAt: Date.now(),
        payload: { ...payload },
        instructionEntries: entries.map((entry) => ({ ...entry })),
        selectedTarget: selectedTarget ? { ...selectedTarget } : null,
        settings: { ...settingsSnapshot, aiResponseMode: promptBundle.resolvedResponseMode },
        baseFingerprint: promptBundle.baseFingerprint,
        retryUsed: Boolean(options.isRetry),
      };
      if (toastMessage) showToast(toastMessage);
      return true;
    };

    if (skipClipboard) {
      return applyPostExportState();
    }

    try {
      await navigator.clipboard.writeText(promptBundle.prompt);
    } catch (err) {
      showToast("클립보드 복사 실패");
      return false;
    }

    return applyPostExportState();
  }, [instructionEntries, selectedInstructionToken, selectedLine, sendPromptToActiveTab, showToast, uiSettings]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return undefined;

    const describeReason = (reason) => {
      if (reason === "base_mismatch") return "기준 코드 불일치";
      if (reason === "invalid_patch") return "패치 포맷 오류";
      if (reason === "missing_base") return "기준 코드 없음";
      if (reason === "apply_failed") return "라인 적용 실패";
      if (reason === "risky_patch") return "구조 위험 패치";
      if (reason === "broken_layout") return "레이아웃 붕괴 감지";
      if (reason === "unsupported_result") return "결과 타입 불일치";
      return "알 수 없음";
    };

    const handlePatchReject = (message) => {
      if (message?.type !== "PRISM_PATCH_APPLY_REJECTED") return;

      const reason = String(message.reason || "unknown");
      const expectedBase = String(message.expectedBase || "");
      const currentBase = String(message.currentBase || "");
      const snapshotForStaleCheck = lastExportSnapshotRef.current;
      if (
        reason === "base_mismatch" &&
        snapshotForStaleCheck?.baseFingerprint &&
        expectedBase &&
        currentBase &&
        snapshotForStaleCheck.baseFingerprint === expectedBase &&
        currentBase !== expectedBase
      ) {
        const liveCode = String(latestPayloadRef.current?.code || "");
        if (liveCode) {
          const liveFingerprint = buildCodeFingerprint(liveCode);
          if (liveFingerprint === currentBase) {
            // Old patch was re-detected after it had already been applied.
            return;
          }
        }
      }
      const rejectKey = `${reason}|${expectedBase}|${currentBase}`;
      const now = Date.now();
      if (
        lastPatchRejectRef.current.key === rejectKey &&
        now - Number(lastPatchRejectRef.current.at || 0) < 3000
      ) {
        return;
      }
      lastPatchRejectRef.current = { key: rejectKey, at: now };
      patchRejectStreakRef.current += 1;

      const reasonText = describeReason(reason);
      const rejectStreak = patchRejectStreakRef.current;
      const hardFailReasons = new Set([
        "invalid_patch",
        "base_mismatch",
        "missing_base",
        "risky_patch",
        "broken_layout",
      ]);
      const shouldEscalateToFull = hardFailReasons.has(reason) || rejectStreak >= 2;
      if (!uiSettings.retryFullSyncOnReject) {
        pendingFullSyncRef.current = true;
        showToast(`Smart Patch 거부됨 (${reasonText}) - 다음 전송은 Full Code`);
        return;
      }

      const snapshot = lastExportSnapshotRef.current;
      if (!snapshot || snapshot.retryUsed) {
        pendingFullSyncRef.current = true;
        triggerRepairNudge();
        showToast(`Smart Patch 거부됨 (${reasonText})`);
        return;
      }
      if (now - Number(snapshot.createdAt || 0) > 10 * 60 * 1000) {
        pendingFullSyncRef.current = true;
        triggerRepairNudge();
        showToast(`Smart Patch 거부됨 (${reasonText}) - 이전 컨텍스트 만료`);
        return;
      }

      const retryKey = `${snapshot.baseFingerprint || ""}|${reason}|${shouldEscalateToFull ? "full" : "patch"}`;
      if (lastAutoRetryKeyRef.current === retryKey) {
        pendingFullSyncRef.current = true;
        triggerRepairNudge();
        showToast(`Smart Patch 거부됨 (${reasonText})`);
        return;
      }
      lastAutoRetryKeyRef.current = retryKey;
      snapshot.retryUsed = true;

      const recoveryHint = shouldEscalateToFull
        ? `The previous patch failed (${reason}). Return full updated code only for recovery.`
        : `The previous patch failed (${reason}). Retry in strict <prism-patches> format only.`;
      handleExportPrompt({
        payload: snapshot.payload,
        instructionEntries: snapshot.instructionEntries,
        selectedTarget: snapshot.selectedTarget,
        settings: snapshot.settings,
        forceFullSync: shouldEscalateToFull,
        recoveryHint,
        skipClipboard: true,
        keepMemos: true,
        actionOverride: "send",
        isRetry: true,
        toastMessage: shouldEscalateToFull
          ? `Smart Patch 거부됨 (${reasonText}) -> Full Code 재시도 전송`
          : `Smart Patch 거부됨 (${reasonText}) -> Patch 재시도 전송`,
        silentWhenNoMemo: true,
      }).then((retried) => {
        if (!retried) {
          pendingFullSyncRef.current = true;
          triggerRepairNudge();
          showToast(`Smart Patch 거부됨 (${reasonText}) - 자동 재시도 실패`);
        }
      });
    };

    chrome.runtime.onMessage.addListener(handlePatchReject);
    return () => {
      chrome.runtime.onMessage.removeListener(handlePatchReject);
    };
  }, [handleExportPrompt, showToast, triggerRepairNudge, uiSettings.retryFullSyncOnReject]);

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

  const handleToggleEditorMode = useCallback(() => {
    setIsEditorModeEnabled((prev) => {
      const next = !prev;
      showToast(next ? "편집 모드가 활성화되었습니다" : "편집 모드가 비활성화되었습니다");
      return next;
    });
  }, [showToast]);

  useEffect(() => {
    if (isEditorModeEnabled) return;
    altHoldPickerActiveRef.current = false;
    pickerWasActiveBeforeAltHoldRef.current = false;
    if (pickerActive) {
      dispatchInteraction({ type: "SET_PICKER_ACTIVE", active: false });
    }
    if (activeInstructionLine || activeInstructionToken || activeElementRect) {
      dispatchInteraction({ type: "CLEAR_SELECTION" });
    }
  }, [
    activeElementRect,
    activeInstructionLine,
    activeInstructionToken,
    isEditorModeEnabled,
    pickerActive,
  ]);

  const handleFreezeToggle = useCallback(() => {
    if (isFreezeDisabled) {
      const reason = runtimeCapabilities?.reasons?.freeze;
      if (reason) showToast(reason);
      return;
    }
    dispatchInteraction({ type: "TOGGLE_FROZEN" });
    showToast(canvasFrozen ? "재생 재개됨" : "일시정지됨");
  }, [canvasFrozen, isFreezeDisabled, runtimeCapabilities?.reasons?.freeze, showToast]);

  const triggerRepairNudge = useCallback(() => {
    setRepairNudgeToken((prev) => prev + 1);
  }, []);

  const handleRequestFullCodeRepair = useCallback(async () => {
    const confirmed = window.confirm("자동 복구에 실패했습니다. Full Code 요청으로 강제 전송할까요?");
    if (!confirmed) return;
    await handleExportPrompt({
      forceFullSync: true,
      actionOverride: "send",
      skipClipboard: true,
      keepMemos: true,
      toastMessage: "Repair 요청: Full Code 전송됨",
    });
  }, [handleExportPrompt]);

  const handleTogglePickerShortcut = useCallback(() => {
    if (isPickerDisabled) {
      const reason = runtimeCapabilities?.reasons?.picker || "현재 상태에서는 피커를 사용할 수 없습니다.";
      showToast(reason);
      return;
    }
    dispatchInteraction({
      type: "TOGGLE_PICKER",
      autoPause: uiSettings?.pickerAutoPause !== false,
    });
    showToast(pickerActive ? "피커 비활성화됨" : "피커 활성화됨");
  }, [
    isPickerDisabled,
    pickerActive,
    runtimeCapabilities?.reasons?.picker,
    showToast,
    uiSettings?.pickerAutoPause,
  ]);

  const handleShowShortcutHelp = useCallback(() => {
    showToast(`Shortcuts: ${SHORTCUT_HELP_TEXT}`);
  }, [showToast]);

  useEffect(() => {
    if (isWindowMode) return undefined;

    const handleGlobalShortcut = (event) => {
      const mod = isModKey(event);
      const shift = Boolean(event.shiftKey);
      const alt = Boolean(event.altKey);
      const isEditable = isEditableTarget(event.target);

      if (!mod) {
        if (isEditable) return;
        if (!shift && !alt && keyEquals(event, "p")) {
          event.preventDefault();
          handleTogglePickerShortcut();
        }
        return;
      }

      if (!shift && !alt && keyEquals(event, "/")) {
        event.preventDefault();
        handleShowShortcutHelp();
        return;
      }
      if (shift && !alt && keyEquals(event, "p")) {
        event.preventDefault();
        handleFreezeToggle();
        return;
      }
      if (shift && !alt && keyEquals(event, "v")) {
        event.preventDefault();
        handleToggleEditorMode();
        return;
      }
      if (shift && !alt && keyEquals(event, "x")) {
        event.preventDefault();
        handleClearAllInstructions();
        return;
      }

      if (isEditable) return;
      if (!shift && !alt && keyEquals(event, "Enter")) {
        event.preventDefault();
        handleExportPrompt();
      }
    };

    window.addEventListener("keydown", handleGlobalShortcut);
    return () => {
      window.removeEventListener("keydown", handleGlobalShortcut);
    };
  }, [
    handleClearAllInstructions,
    handleExportPrompt,
    handleFreezeToggle,
    handleShowShortcutHelp,
    handleTogglePickerShortcut,
    handleToggleEditorMode,
    isWindowMode,
  ]);

  useEffect(() => {
    if (isWindowMode) return undefined;

    const handleAltHoldKeyDown = (event) => {
      if (event.key !== "Alt") return;
      if (event.repeat) return;
      if (!isEditorModeEnabled || isPickerDisabled) return;
      if (altHoldPickerActiveRef.current) return;

      altHoldPickerActiveRef.current = true;
      pickerWasActiveBeforeAltHoldRef.current = pickerActive;

      if (!pickerActive) {
        dispatchInteraction({ type: "SET_PICKER_ACTIVE", active: true });
      }
    };

    const releaseAltHoldPicker = () => {
      if (!altHoldPickerActiveRef.current) return;
      const shouldRestoreInactive = !pickerWasActiveBeforeAltHoldRef.current;
      altHoldPickerActiveRef.current = false;
      pickerWasActiveBeforeAltHoldRef.current = false;
      if (shouldRestoreInactive) {
        dispatchInteraction({ type: "SET_PICKER_ACTIVE", active: false });
      }
    };

    const handleAltHoldKeyUp = (event) => {
      if (event.key !== "Alt") return;
      releaseAltHoldPicker();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") releaseAltHoldPicker();
    };

    window.addEventListener("keydown", handleAltHoldKeyDown);
    window.addEventListener("keyup", handleAltHoldKeyUp);
    window.addEventListener("blur", releaseAltHoldPicker);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleAltHoldKeyDown);
      window.removeEventListener("keyup", handleAltHoldKeyUp);
      window.removeEventListener("blur", releaseAltHoldPicker);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [dispatchInteraction, isEditorModeEnabled, isPickerDisabled, isWindowMode, pickerActive]);

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
      if (key === "patchFullSyncEvery") {
        const nextValue = PATCH_FULL_SYNC_CADENCE_OPTIONS.includes(Number(value))
          ? Number(value)
          : DEFAULT_UI_SETTINGS.patchFullSyncEvery;
        return {
          ...prev,
          patchFullSyncEvery: nextValue,
        };
      }
      if (key === "startupMode") {
        const nextMode = VALID_STARTUP_MODES.includes(String(value))
          ? String(value)
          : DEFAULT_UI_SETTINGS.startupMode;
        return {
          ...prev,
          startupMode: nextMode,
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
    <div className="panel-shell" ref={panelShellRef}>
      <div className="viewer-container">
        <div className="viewer-frame">
          <div className="panel-shell__virtual-top">
            <Header
              onSaveHtml={handleSaveHtml}
              onSnapshot={() => handleSnapshot("download")}
              onCopy={() => handleSnapshot("clipboard")}
              onOpenWindow={handleOpenWindow}
              isSnapshotDisabled={isSnapshotDisabled}
              isFreezeDisabled={isFreezeDisabled}
              canvasFrozen={canvasFrozen}
              onFreezeToggle={handleFreezeToggle}
              uiSettings={uiSettings}
              onToggleSetting={handleToggleSetting}
              onUpdateSetting={handleUpdateSetting}
              themeMode={uiSettings.themeMode}
              onThemeModeChange={handleThemeModeChange}
              isEditorModeEnabled={isEditorModeEnabled}
              onToggleEditorMode={handleToggleEditorMode}
              rightSlot={
                <NotesIsland
                  instructionEntries={instructionEntries}
                  instructionCount={instructionCount}
                  canvasFrozen={canvasFrozen}
                  pulseToken={notesPulseToken}
                  onInstructionHover={handleInstructionHover}
                  onInstructionSelect={handleInstructionSelect}
                  onInstructionDelete={handleInstructionDelete}
                  onClearAllInstructions={handleClearAllInstructions}
                />
              }
            />
          </div>
          <Viewer ref={viewerRef} onReady={handleViewerReady} />
          <div
            id="prism-capture-flash"
            ref={flashRef}
            onAnimationEnd={handleFlashAnimationEnd}
          />
          <div className="panel-shell__virtual-bottom">
            <CommandBar
              onSend={handleExportPrompt}
              onRequestRepair={handleRequestFullCodeRepair}
              onAddMemo={handleAddMemoFromCommandBar}
              onRemoveMemo={handleRemoveMemoFromCommandBar}
              onClearSelection={handleClearSelection}
              selectedLine={selectedLine}
              selectedMemoText={selectedMemoText}
              selectionToken={focusToken}
              isExportDisabled={isExportPromptDisabled}
              maxWidthPx={commandBarMaxWidthPx}
              repairNudgeToken={repairNudgeToken}
            />
          </div>
        </div>
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

export default PrismApp;
