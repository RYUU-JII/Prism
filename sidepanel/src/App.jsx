import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Header from './components/Header.jsx';
import Viewer from './components/Viewer.jsx';
import Footer from './components/Footer.jsx';
import ExpertEditor from './components/ExpertEditor.jsx';
import { performCaptureInParent } from './utils/capture';
import { useToast } from './hooks/useToast.jsx';

const ENABLE_EXPERT_MODE = false;
const ENABLE_PICKER = false;
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

function App() {
  const [latestPayload, setLatestPayload] = useState(null);
  const [expertMode, setExpertMode] = useState(false);
  const [expertTheme, setExpertTheme] = useState(() => {
    const storedTheme = localStorage.getItem("prism-expert-theme");
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
  });
  const [pickerActive, setPickerActive] = useState(false);
  const [focusLine, setFocusLine] = useState(null);
  const [focusToken, setFocusToken] = useState(0);
  const viewerRef = useRef(null);
  const viewerReadyRef = useRef(false);
  const pendingPayloadRef = useRef(null);
  const pendingPickerToggleRef = useRef(false);
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

  const sendPickerToggle = useCallback(() => {
    if (!ENABLE_PICKER) return;
    const viewer = viewerRef.current;
    if (!viewer || !viewer.contentWindow || !viewerReadyRef.current) {
      pendingPickerToggleRef.current = true;
      return;
    }
    pendingPickerToggleRef.current = false;
    viewer.contentWindow.postMessage(
      { type: "PRISM_PICKER_TOGGLE", active: pickerActive },
      "*"
    );
  }, [pickerActive]);

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
    if (pendingPickerToggleRef.current) {
      sendPickerToggle();
    }
  }, [postToSandbox, sendPickerToggle]);

  useEffect(() => {
    if (!ENABLE_PICKER) return;
    const canPick = latestPayload?.language === "html";
    if (!canPick && pickerActive) {
      setPickerActive(false);
    }
  }, [latestPayload?.language, pickerActive]);

  useEffect(() => {
    if (!ENABLE_PICKER) return;
    sendPickerToggle();
  }, [pickerActive, sendPickerToggle]);

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
        setPickerActive(false);
        const lineNumber = Number(data.line) || 1;
        setFocusLine(lineNumber);
        setFocusToken((token) => token + 1);
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
    if (!ENABLE_EXPERT_MODE) return;
    const newTheme = expertTheme === "dark" ? "light" : "dark";
    localStorage.setItem("prism-expert-theme", newTheme);
    applyGlobalTheme(newTheme);
  }, [applyGlobalTheme, expertTheme]);

  const handleCodeUpdate = useCallback((newCode) => {
    const payload = latestPayloadRef.current;
    if (!payload) return;
    updateViewer(newCode, detectKind(newCode), payload.url, payload.theme);
  }, [updateViewer]);

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
    setPickerActive((prev) => !prev);
  }, [latestPayload?.language]);

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
      />
      <Viewer ref={viewerRef} onReady={handleViewerReady} />
      {ENABLE_EXPERT_MODE && expertMode && (
        <ExpertEditor
          code={latestPayload?.code || ""}
          onCodeUpdate={handleCodeUpdate}
          theme={expertTheme}
          focusLine={focusLine}
          focusToken={focusToken}
        />
      )}
      <Footer
        expertMode={expertMode}
        onExpertModeToggle={handleExpertToggle}
        expertTheme={expertTheme}
        onExpertThemeToggle={handleThemeToggle}
        pickerActive={pickerActive}
        onPickerToggle={handlePickerToggle}
        isPickerDisabled={isPickerDisabled}
        isExpertEnabled={ENABLE_EXPERT_MODE}
        isPickerEnabled={ENABLE_PICKER}
      />
    </div>
  );
}

export default App;
