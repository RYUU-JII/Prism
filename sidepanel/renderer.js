document.documentElement.lang = navigator.language || "en";

const viewer = document.getElementById("viewer");
const snapshotBtn = document.getElementById("snapshot-btn");
const copyBtn = document.getElementById("copy-btn");
const saveHtmlBtn = document.getElementById("save-html-btn");
const openWindowBtn = document.getElementById("open-window-btn");
const panelShell = document.querySelector(".panel-shell");
const expertModeBtn = document.getElementById("expert-mode-btn");
const expertEditorContainer = document.getElementById("expert-editor-container");
const expertEditorMount = document.getElementById("expert-editor");

let pendingPayload = null;
let viewerReady = false;
let latestPayload = null;
let pendingSnapshotAction = null;
let currentTabId = null;
let expertMode = false;
let editorView = null;
let editorApplyingRemote = false;

const urlParams = new URLSearchParams(window.location.search);
const targetTabId = urlParams.get("tabId");

const scriptLoadCache = new Map();
const styleLoadCache = new Map();

/**
 * 상대 경로를 절대 경로로 변환하고 Base64로 바꿉니다.
 * @param {string} url - 이미지 경로
 * @param {string} baseUrl - 원본 사이트 주소
 */
async function toDataURL(url, baseUrl) {
  if (!url || url.startsWith("data:")) return url;

  let absoluteUrl = url;
  if (url.startsWith("/") && baseUrl) {
    const origin = baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`;
    absoluteUrl = new URL(url, new URL(origin).origin).href;
  }

  try {
    // 1. 먼저 직접 시도
    const response = await fetch(absoluteUrl);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    // 2. 실패 시(CORS 에러 등) 백그라운드 프록시 활용
    console.info(`[Prism] CORS detected. Requesting proxy for: ${absoluteUrl}`);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        type: "PRISM_PROXY_FETCH", 
        url: absoluteUrl 
      }, (response) => {
        if (response?.dataUrl) resolve(response.dataUrl);
        else resolve(url); // 끝내 실패하면 원본 반환
      });
    });
  }
}

/**
 * 모든 리소스를 인라인화할 때 baseUrl을 함께 넘깁니다.
 */
async function inlineAllResources(element, baseUrl) {
  // 1. <img> 태그 처리
  const imgs = Array.from(element.querySelectorAll("img"));
  await Promise.all(imgs.map(async (img) => {
    img.src = await toDataURL(img.src, baseUrl);
  }));

  // 2. background-image 처리
  const allElements = Array.from(element.querySelectorAll("*"));
  await Promise.all(allElements.map(async (el) => {
    const style = window.getComputedStyle(el);
    const bgImg = style.backgroundImage;
    if (bgImg && bgImg.includes("url(")) {
      const match = bgImg.match(/url\(["']?(.*?)["']?\)/);
      if (match && match[1]) {
        const base64 = await toDataURL(match[1], baseUrl);
        el.style.backgroundImage = `url("${base64}")`;
      }
    }
  }));
}

function returnToSourceTab() {
  if (!targetTabId) return;
  const tabId = Number(targetTabId);
  if (!Number.isFinite(tabId)) return;

  // [추가] 창을 닫기 전에 "나 닫힌다"고 명시적으로 알림
  notifyPanelStatus(false);

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
}

if (targetTabId) {
  window.addEventListener("mousedown", (event) => {
    console.log("[Prism] mousedown:", {
      button: event.button,
      buttons: event.buttons,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey
    });
    if (event.button === 4) {
      returnToSourceTab();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.altKey && event.key === "ArrowLeft") {
      returnToSourceTab();
    }
  });
}

function loadScriptOnce(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve();
  if (scriptLoadCache.has(src)) return scriptLoadCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(src);
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
  scriptLoadCache.set(src, promise);
  return promise;
}

function loadStyleOnce(href) {
  if (styleLoadCache.has(href)) return styleLoadCache.get(href);
  const existing = document.querySelector(`link[data-prism-style="${href}"]`);
  if (existing) return Promise.resolve();
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL(href);
    link.dataset.prismStyle = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load ${href}`));
    document.head.appendChild(link);
  });
  styleLoadCache.set(href, promise);
  return promise;
}

function getCodeMirrorBundle() {
  return window.CM6 || window.CodeMirrorBundle;
}

async function ensureExpertEditor() {
  if (editorView || !expertEditorMount) return;
  await loadScriptOnce("sidepanel/vendor/codemirror-bundle.js", "CodeMirrorBundle");
  const CM = getCodeMirrorBundle();
  if (!CM?.EditorView) {
    console.error("[Prism] CodeMirror bundle failed to load or export EditorView.");
    return;
  }

  const updateListener = CM.EditorView.updateListener.of((update) => {
    if (!update.docChanged || editorApplyingRemote) return;
    const newCode = update.state.doc.toString();
    renderPayload(newCode, detectKind(newCode), latestPayload?.url, latestPayload?.theme);
  });

  editorView = new CM.EditorView({
    doc: latestPayload?.code || "",
    extensions: [CM.basicSetup, CM.html(), updateListener],
    parent: expertEditorMount
  });
}

function setEditorContent(code) {
  if (!editorView) return;
  editorApplyingRemote = true;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: code || "" }
  });
  editorApplyingRemote = false;
}

function applyInlineStyles(element, styles) {
  if (!element || !styles) return;
  Object.keys(styles).forEach((key) => {
    element.style[key] = styles[key];
  });
}

function waitForPaint(frames = 2) {
  return new Promise((resolve) => {
    let count = 0;
    const tick = () => {
      count += 1;
      if (count >= frames) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

/**
 * 부모 컨텍스트에서 캡처를 수행합니다.
 * modern-screenshot을 사용하여 데스크톱 뷰(1280px)를 강제하고 SVG 방식으로 렌더링합니다.
 */
async function performCaptureInParent(data) {
  console.info("[Prism] Desktop-view capture requested via modern-screenshot.", {
    originalHeight: data?.height,
    classes: data?.classes
  });
  
  const action = pendingSnapshotAction || "download";
  pendingSnapshotAction = null;

  let container = null;
  let stage = null;
  
  try {
    if (!data || !data.html) {
      throw new Error("No capture payload provided.");
    }

    // [기존 유지] 데스크톱 가상 해상도 설정 (가로 1280px 고정)
    const VIRTUAL_WIDTH = 1280;
    const VIRTUAL_HEIGHT = Math.max(720, Math.ceil(Number(data.height) || 0));

    // 컨테이너 생성
    container = document.createElement("div");
    container.id = "prism-capture-root";
    container.className = (data.bodyClass || "").trim();
    container.style.cssText = `
      position: fixed;
      left: -5000px;
      top: 0;
      width: ${VIRTUAL_WIDTH}px;
      height: ${VIRTUAL_HEIGHT}px;
      z-index: -9999;
      pointer-events: none;
      box-sizing: border-box;
      contain: layout paint;
      overflow: hidden;
    `;
    
    applyInlineStyles(container, data.bodyStyles);
    container.style.background = data.background || container.style.background || "#ffffff";
    container.style.color = data.color || container.style.color || "#111111";
    container.style.fontFamily = data.fontFamily || container.style.fontFamily || "inherit";

    stage = document.createElement("div");
    stage.id = "prism-root";
    stage.className = (data.classes || "").trim();
    stage.style.width = "100%";
    stage.style.height = "100%";
    stage.style.position = "relative";
    stage.style.boxSizing = "border-box";
    applyInlineStyles(stage, data.rootStyles);
    stage.innerHTML = data.html;

    // [기존 유지] 불필요한 스크립트 및 외부 객체 제거/대체 로직
    stage.querySelectorAll("script").forEach((el) => el.remove());
    stage.querySelectorAll("link[rel='stylesheet']").forEach((el) => el.remove());
    
    // iframe, object 등 캡처 불가능한 요소 플레이스홀더 처리 (복구됨)
    stage.querySelectorAll("iframe, frame, object, embed").forEach((el) => {
      const placeholder = document.createElement("div");
      const rect = el.getBoundingClientRect();
      placeholder.style.width = rect.width ? `${rect.width}px` : "100%";
      placeholder.style.height = rect.height ? `${rect.height}px` : "150px";
      placeholder.style.background = "#f3f4f6";
      placeholder.style.border = "1px dashed #d1d5db";
      placeholder.style.display = "flex";
      placeholder.style.alignItems = "center";
      placeholder.style.justifyContent = "center";
      placeholder.style.color = "#9ca3af";
      placeholder.style.fontSize = "12px";
      placeholder.textContent = "External Content (Snapshot Unsupported)";
      el.replaceWith(placeholder);
    });

    container.appendChild(stage);
    document.body.appendChild(container);

    // [신규 기능 적용] 캡처 전 리소스 인라인화 실행
    console.info("[Prism] Inlining external resources to prevent CORS issues...");
    const baseUrl = latestPayload?.url || ""; 
    await inlineAllResources(stage, baseUrl);

    // 스타일 및 Tailwind, 라이브러리 로드
    await loadStyleOnce("sidepanel/theme.css").catch(() => {});
    if (data.html.includes("class=")) {
      window.tailwind = window.tailwind || {};
      window.tailwind.config = window.tailwind.config || { darkMode: "class" };
      await loadScriptOnce("sidepanel/vendor/tailwindcss.js");
    }

    await loadScriptOnce("sidepanel/vendor/modern-screenshot.js");

    if (document.fonts && document.fonts.ready) {
      await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 250))]);
    }

    // 렌더링 안정화 대기 (인라인화 후 렌더링 시간 고려하여 약간 여유 둠)
    await waitForPaint(3);
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    console.info("[Prism] Capture executing with modern-screenshot", { width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT });

    if (!window.modernScreenshot || typeof window.modernScreenshot.domToPng !== "function") {
      throw new Error("modernScreenshot library (domToPng) not found.");
    }

    const { domToPng } = window.modernScreenshot;

    // domToPng 실행
    const dataUrl = await domToPng(stage, {
      width: VIRTUAL_WIDTH,
      height: VIRTUAL_HEIGHT,
      scale: 2, // 고해상도
      backgroundColor: data.background || "#ffffff",
      style: {
        transform: "scale(1)",
        transformOrigin: "top left"
      },
      features: {
        copyStyles: true,
      }
    });

    // 결과 처리 (클립보드 / 다운로드)
    if (action === "clipboard") {
      await copyImageToClipboard(dataUrl);
      console.info("[Prism] Snapshot copied to clipboard.");
      return;
    }
    
    const blob = dataUrlToBlob(dataUrl);
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: "prism-desktop-snapshot.png", saveAs: true }, () => {
      URL.revokeObjectURL(url);
    });
    console.info("[Prism] Snapshot download triggered.");

  } catch (err) {
    console.error("[Prism] Parent capture failed:", err);
  } finally {
    if (container) {
      container.remove();
    }
  }
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
  if (/from\s+['"]react['"]|ReactDOM|useState\(|className=/i.test(code)) return "react";
  if (/from\s+['"]vue['"]|createApp\s*\(|new\s+Vue\s*\(/i.test(code)) return "vue";
  if (/<[a-z][\s\S]*>/i.test(code)) return "html";
  return "text";
}

function postToSandbox(payload) {
  if (!viewerReady) {
    pendingPayload = payload;
    return;
  }
  viewer.contentWindow.postMessage({ type: "RENDER", ...payload }, "*");
}

/**
 * HTML 내의 모든 src="/..." 형태를 src="https://사이트/..."로 강제 변환
 */
function fixRelativePaths(html, baseUrl) {
  if (!baseUrl || !html) return html;
  
  // baseUrl이 'github.com'이면 'https://github.com'으로 정규화
  const origin = baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`;
  
  // 정규식으로 src="/..." 패턴을 찾아 절대 경로로 치환
  return html.replace(/src=["']\/([^"']+)["']/g, (match, path) => {
    try {
      const absoluteUrl = new URL(path, origin).href;
      return `src="${absoluteUrl}"`;
    } catch (e) {
      return match;
    }
  });
}

function renderPayload(code, language, url, theme) {
  if (!code) {
    postToSandbox({ code: "", language: "text", url: "" });
    return;
  }

  const kind = language && language !== "text" ? language : detectKind(code);
  const source = normalizeSource(url);
  const fixedCode = fixRelativePaths(code, source);

  latestPayload = { code, language: kind, url: source, theme: theme || "light" };
  postToSandbox({ ...latestPayload, code: fixedCode });
}

function updateViewer(code, language, url, theme) {
  if (!code) {
    renderPayload(code, language, url, theme);
    return;
  }

  if (expertMode) {
    if (editorView) {
      setEditorContent(code);
      renderPayload(code, language, url, theme);
    } else if (expertEditorMount) {
      ensureExpertEditor().then(() => {
        if (editorView) {
          setEditorContent(code);
        }
        renderPayload(code, language, url, theme);
      });
    } else {
      renderPayload(code, language, url, theme);
    }
    return;
  }

  renderPayload(code, language, url, theme);
}

function setExpertMode(active) {
  expertMode = Boolean(active);
  if (expertEditorContainer) {
    expertEditorContainer.classList.toggle("active", expertMode);
    expertEditorContainer.setAttribute("aria-hidden", expertMode ? "false" : "true");
  }
  if (expertModeBtn) {
    expertModeBtn.setAttribute("aria-pressed", expertMode ? "true" : "false");
    expertModeBtn.classList.toggle("active", expertMode);
  }

  if (expertMode) {
    ensureExpertEditor().then(() => {
      if (editorView) {
        setEditorContent(latestPayload?.code || "");
      }
      if (latestPayload?.code) {
        renderPayload(latestPayload.code, latestPayload.language, latestPayload.url, latestPayload.theme);
      }
    });
  }
}

function requestLatest() {
  if (targetTabId) {
    const parsedId = Number(targetTabId);
    currentTabId = Number.isFinite(parsedId) ? parsedId : targetTabId;
    notifyPanelStatus(true);
    chrome.runtime.sendMessage({ type: "PRISM_GET_LATEST", tabId: currentTabId }, (resp) => {
      if (resp?.payload) {
        updateViewer(resp.payload.code, resp.payload.language, resp.payload.url, resp.payload.theme);
      }
    });
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    currentTabId = tabId ?? null;
    notifyPanelStatus(true);
    chrome.runtime.sendMessage({ type: "PRISM_GET_LATEST", tabId }, (resp) => {
      if (resp?.payload) {
        updateViewer(resp.payload.code, resp.payload.language, resp.payload.url, resp.payload.theme);
      }
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (targetTabId && message?.tabId && String(message.tabId) !== String(targetTabId)) {
    return;
  }
  if (message?.type === "PRISM_RENDER") {
    currentTabId = message.tabId ?? currentTabId;
    notifyPanelStatus(true);
    updateViewer(message.code, message.language, message.url, message.theme);
  }
});

if (openWindowBtn) {
  openWindowBtn.addEventListener("click", () => {
    if (!latestPayload?.code) {
      alert("렌더링할 코드가 없습니다.");
      return;
    }

    const blob = new Blob([latestPayload.code], { type: "text/html;charset=utf-8" });
    const reader = new FileReader();

    reader.onloadend = function() {
      const tabId = currentTabId ?? "temp";
      const url = chrome.runtime.getURL(`sidepanel/window.html?tabId=${encodeURIComponent(tabId)}`);

      chrome.tabs.create({ url: url });
      window.close();
    };
    reader.readAsDataURL(blob);
  });
}

if (expertModeBtn) {
  expertModeBtn.addEventListener("click", () => {
    setExpertMode(!expertMode);
  });
}

if (snapshotBtn) {
  snapshotBtn.addEventListener("click", () => {
    if (!viewerReady) return;
    pendingSnapshotAction = "download";
    viewer.contentWindow.postMessage({ type: "PRISM_SNAPSHOT" }, "*");
  });
}

if (copyBtn) {
  copyBtn.addEventListener("click", () => {
    if (!viewerReady) return;
    pendingSnapshotAction = "clipboard";
    viewer.contentWindow.postMessage({ type: "PRISM_SNAPSHOT" }, "*");
  });
}

if (saveHtmlBtn) {
  saveHtmlBtn.addEventListener("click", () => {
    if (!latestPayload?.code) return;
    const blob = new Blob([latestPayload.code], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download(
      {
        url,
        filename: "prism-export.html",
        saveAs: true,
      },
      () => URL.revokeObjectURL(url)
    );
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function copyImageToClipboard(dataUrl) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    console.warn("[Prism] Clipboard API not available.");
    return;
  }
  const blob = dataUrlToBlob(dataUrl);
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

window.addEventListener("message", (event) => {
  if (event.source !== viewer.contentWindow) return;
  const data = event.data || {};

  if (data.type === "PRISM_RETURN_REQUEST") {
    returnToSourceTab();
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

  // 1. 샌드박스로부터 캡처용 데이터를 받았을 때 실행
  if (data.type === "PRISM_EXPORT_FOR_CAPTURE") {
    performCaptureInParent(data);
    return;
  }

  const { type, dataUrl, error, stage, meta } = data;

  if (type === "PRISM_SNAPSHOT_RESULT" && dataUrl) {
    const action = pendingSnapshotAction || "download";
    pendingSnapshotAction = null;
    if (action === "clipboard") {
      copyImageToClipboard(dataUrl).catch((err) => console.warn("[Prism] Clipboard copy failed:", err));
    } else {
      const blob = dataUrlToBlob(dataUrl);
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({ url, filename: "prism-snapshot.png", saveAs: true }, () => URL.revokeObjectURL(url));
    }
  }

  if (type === "PRISM_SNAPSHOT_RESULT" && error) {
    console.warn("[Prism] Snapshot failed:", stage ? `(${stage})` : "", error, meta || "");
    pendingSnapshotAction = null;
  }

  if (type === "PRISM_SNAPSHOT_STATUS") {
    console.info("[Prism] Snapshot status:", stage || "unknown");
  }
});

viewer.addEventListener("load", () => {
  viewerReady = true;
  if (pendingPayload) {
    postToSandbox(pendingPayload);
    pendingPayload = null;
  }
});

window.addEventListener("beforeunload", () => {
  notifyPanelStatus(false); // 패널이 닫힐 때 'false' 신호를 백그라운드로 전송
});

let lifecyclePort = null;

try {
  lifecyclePort = chrome.runtime.connect({ name: "prism-heartbeat" });
} catch (e) {
  console.warn("[Prism] Failed to connect heartbeat:", e);
}

function notifyPanelStatus(open) {
  const finalTabId = targetTabId ? Number(targetTabId) : currentTabId;
  
  if (!finalTabId) return;

  if (open) {
    chrome.runtime.sendMessage({ 
      type: "PRISM_PANEL_STATUS", 
      tabId: finalTabId, 
      open: true 
    });

    // 2. [핵심] Heartbeat 포트에 "나 이 탭 담당이야"라고 등록
    if (lifecyclePort) {
      try {
        lifecyclePort.postMessage({ tabId: finalTabId });
      } catch (e) {
        // 연결이 끊겼다면 재연결 시도
        lifecyclePort = chrome.runtime.connect({ name: "prism-heartbeat" });
        lifecyclePort.postMessage({ tabId: finalTabId });
      }
    }
  }
}


requestLatest();
