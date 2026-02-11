import React, { useState, useEffect, useRef, useMemo, useCallback, useReducer } from 'react';
import Header from './components/Header.jsx';
import Viewer from './components/Viewer.jsx';
import FloatingInput from './components/FloatingInput.jsx';
import ExpertEditor from './components/ExpertEditor.jsx';
import { performCaptureInParent } from './utils/capture';
import { useToast } from './hooks/useToast.jsx';

const ENABLE_EXPERT_MODE = false;
const ENABLE_PICKER = true;
const SNAPSHOT_COOLDOWN_MS = 900;

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
  if (/^\s*<!DOCTYPE\s+html/i.test(code) || /<html[\s>]/i.test(code)) {
    return "html";
  }
  const sourceIndicators = [
    /^\s*import\s+.*\s+from\s+['"].*['"]/m,
    /^\s*export\s+(default\s+)?(function|class|const|var|let)\s+/m,
    /className\s*=/i,
    /htmlFor\s*=/i,
    /dangerouslySetInnerHTML/i,
    /<\s*>\s*[\s\S]*<\/\s*>/,
    /\bv-(if|for|else|model|show|bind|on)\b/,
    /@click\s*=|@submit\s*=/,
    /:\w+\s*=/
  ];
  if (sourceIndicators.some((r) => r.test(code))) {
    if (/\bv-|@click|:\w+=|<template>|from\s+['"]vue['"]/.test(code)) return "vue";
    return "react";
  }
  if (/useState\s*\(|useEffect\s*\(|use[A-Z][a-zA-Z]*\s*\(|ReactDOM/.test(code)) return "react";
  if (/createApp\s*\(|defineComponent\s*\(|from\s+['"]vue['"]/.test(code)) return "vue";
  if (/<[a-z][\s\S]*>/i.test(code)) return "html";
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
  const kind = language && language !== "text" ? language : detectKind(code);
  const source = normalizeSource(url);
  const resolvedTheme = theme || "light";
  return `${kind}::${resolvedTheme}::${source || ""}::${code}`;
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
      return { ...state, pickerActive: true };
    }
    case "TOGGLE_FROZEN":
      return { ...state, canvasFrozen: !state.canvasFrozen };
    case "PICKER_SELECT": {
      const line = Number(action.line) || 1;
      return {
        ...state,
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
    case "CLEAR_SELECTION":
      return { ...state, activeInstructionLine: null, activeElementRect: null };
    default:
      return state;
  }
}

function App() {
  const [latestPayload, setLatestPayload] = useState(null);
  const [expertMode, setExpertMode] = useState(false);
  const [expertTheme, setExpertTheme] = useState(() => {
    const storedTheme = localStorage.getItem("prism-expert-theme");
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
  });
  const [interactionState, dispatchInteraction] = useReducer(
    interactionReducer,
    initialInteractionState
  );
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
  const { ToastComponent, showToast } = useToast();

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
    document.body.dataset.theme = expertTheme;
  }, [expertTheme]);

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
    void el.offsetWidth;
    el.classList.add("active");
  }, []);

  const applyGlobalTheme = useCallback((theme) => {
    if (!theme) return;
    document.body.dataset.theme = theme;
    setExpertTheme(theme);
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
      instructionsCount: Object.keys(instructions).length,
    };
  }, [canvasFrozen, instructions, pickerActive]);

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

  const renderPayload = useCallback((code, language, url, theme) => {
    if (!code) {
      latestPayloadRef.current = null;
      setLatestPayload(null);
      postToSandbox({ code: "", language: "text", url: "" });
      return;
    }
    const kind = language && language !== "text" ? language : detectKind(code);
    const source = normalizeSource(url);
    const fixedCode = fixRelativePaths(code, source);
    const sandboxCode = kind === "html" ? addPrismLineAttributes(fixedCode) : fixedCode;
    const payload = { code, language: kind, url: source, theme: theme || "light" };
    latestPayloadRef.current = payload;
    setLatestPayload(payload);
    postToSandbox({ ...payload, code: sandboxCode });
  }, [postToSandbox]);

  const updateViewer = useCallback((code, language, url, theme) => {
    if (!code) {
      lastRenderKeyRef.current = "";
      hasRenderedOnceRef.current = false;
      renderPayload("", "text", "", theme);
      return;
    }
    applyGlobalTheme(theme);
    const kind = language && language !== "text" ? language : detectKind(code);
    const source = normalizeSource(url);
    const resolvedTheme = theme || "light";
    const renderKey = buildRenderKey(code, kind, source, resolvedTheme);
    if (hasRenderedOnceRef.current && renderKey === lastRenderKeyRef.current) {
      return;
    }
    hasRenderedOnceRef.current = true;
    lastRenderKeyRef.current = renderKey;
    renderPayload(code, kind, source, resolvedTheme);
  }, [applyGlobalTheme, renderPayload]);

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
    if (!ENABLE_PICKER) return;
    const canPick = latestPayload?.language === "html";
    if (!canPick && pickerActive) {
      dispatchInteraction({ type: "SET_PICKER_ACTIVE", active: false });
    }
  }, [latestPayload?.language, pickerActive]);

  useEffect(() => {
    sendUiState();
  }, [sendUiState]);

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
  }, [returnToSourceTab, showToast]);

  const handleSnapshot = useCallback((action = "download") => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.contentWindow || !viewerReadyRef.current) return;
    if (pendingSnapshotActionRef.current || Date.now() < snapshotCooldownRef.current) {
      showToast("Processing... please wait.");
      return;
    }
    flashCapture();
    snapshotCooldownRef.current = Date.now() + SNAPSHOT_COOLDOWN_MS;
    pendingSnapshotActionRef.current = action;
    viewer.contentWindow.postMessage({ type: "PRISM_SNAPSHOT" }, "*");
  }, [flashCapture, showToast]);

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

  const handleThemeToggle = useCallback(() => {
    const newTheme = expertTheme === "dark" ? "light" : "dark";
    localStorage.setItem("prism-expert-theme", newTheme);
    applyGlobalTheme(newTheme);
  }, [applyGlobalTheme, expertTheme]);

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

  const handleExportPrompt = useCallback(() => {
    const payload = latestPayloadRef.current;
    if (!payload?.code) return;
    if (Object.keys(instructions).length === 0) {
      showToast("먼저 요소에 메모를 남겨주세요.");
      return;
    }

    const lines = payload.code.split('\n');
    let prompt = "Please modify the following HTML based on the provided instructions.\n\n";

    prompt += "### INSTRUCTIONS\n";
    Object.entries(instructions).forEach(([line, text]) => {
      prompt += `- Line ${line}: ${text}\n`;
    });

    prompt += "\n### TARGET SNIPPETS\n";
    Object.keys(instructions).forEach(lineNum => {
      const idx = Number(lineNum) - 1;
      const start = Math.max(0, idx - 2);
      const end = Math.min(lines.length, idx + 3);
      prompt += `--- Snippet around Line ${lineNum} ---\n`;
      prompt += lines.slice(start, end).join('\n');
      prompt += "\n\n";
    });

    // Simple Skeleton logic (remove attributes, keep tags)
    const skeleton = payload.code
      .replace(/<([a-z0-9-]+)[^>]*>/gi, '<$1>')
      .replace(/<\/([a-z0-9-]+)>/gi, '</$1>');

    prompt += "### FULL STRUCTURE (SKELETON)\n";
    prompt += skeleton;

    navigator.clipboard.writeText(prompt).then(() => {
      showToast("Prompt copied to clipboard!");
    });
  }, [instructions, showToast]);

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
    if (latestPayload?.language !== "html") return;
    dispatchInteraction({ type: "TOGGLE_PICKER" });
  }, [latestPayload?.language]);

  const handleFreezeToggle = useCallback(() => {
    dispatchInteraction({ type: "TOGGLE_FROZEN" });
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      sendPanelStatus(false);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [sendPanelStatus]);

  const isPickerDisabled = latestPayload?.language !== "html";

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
      <ToastComponent />
      <div id="prism-capture-flash" ref={flashRef} />
      <Header
        onSaveHtml={handleSaveHtml}
        onSnapshot={() => handleSnapshot("download")}
        onCopy={() => handleSnapshot("clipboard")}
        onOpenWindow={handleOpenWindow}
        onThemeToggle={handleThemeToggle}
        onExportPrompt={handleExportPrompt}
        pickerActive={pickerActive}
        onPickerToggle={handlePickerToggle}
        isPickerDisabled={isPickerDisabled}
        instructionCount={Object.keys(instructions).length}
        canvasFrozen={canvasFrozen}
        onFreezeToggle={handleFreezeToggle}
      />
      <div className="viewer-container">
        <Viewer ref={viewerRef} onReady={handleViewerReady} />
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
          theme={expertTheme}
          focusLine={focusLine}
          focusToken={focusToken}
        />
      )}
    </div>
  );
}

export default App;
