const ORB_ID = "prism-orb";
const ORB_ACTIVE_CLASS = "prism-orb--active";
const ORB_LABEL = "Refract";

let lastCode = "";
let lastLanguage = "text";
let hideTimer = null;
const SPY_SOURCE = "prism-clipboard";
const GESTURE_WINDOW_MS = 2000;
let lastUserGestureAt = 0;
let panelOpen = false;

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

// ... (detectKind, normalizeClipboard, detectTheme 함수는 기존과 동일) ...
function detectKind(text) {
  if (!text) return "text";
  const reactHints = [/from\s+['"]react['"]/i, /import\s+React/i, /ReactDOM/i, /className=/i, /useState\(/i, /useEffect\(/i];
  const vueHints = [/from\s+['"]vue['"]/i, /createApp\s*\(/i, /new\s+Vue\s*\(/i, /defineComponent\(/i];
  const htmlHints = [/<!doctype html/i, /<html[\s>]/i, /<body[\s>]/i, /<head[\s>]/i, /<template[\s>]/i, /<div[\s>]/i, /<section[\s>]/i];

  if (reactHints.some((re) => re.test(text))) return "react";
  if (vueHints.some((re) => re.test(text))) return "vue";
  if (htmlHints.some((re) => re.test(text))) return "html";
  if (/<[a-z][\s\S]*>/i.test(text)) return "html";
  return "text";
}

function normalizeClipboard(text) { return (text || "").trim(); }

function detectTheme() {
  // ... (기존과 동일)
  try {
    if (document.documentElement.classList.contains("dark")) return "dark";
    if (document.body?.classList?.contains("dark")) return "dark";
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) return "dark";
    const bg = window.getComputedStyle(document.body).backgroundColor;
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      const luminance = (0.299 * Number(match[1]) + 0.587 * Number(match[2]) + 0.114 * Number(match[3])) / 255;
      return luminance < 0.5 ? "dark" : "light";
    }
  } catch (err) {}
  return "light";
}

// ... (이벤트 리스너 부분 기존과 동일) ...
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const payload = event.data || {};
  if (payload.source !== SPY_SOURCE || typeof payload.text !== "string") return;
  if (Date.now() - lastUserGestureAt > GESTURE_WINDOW_MS) return;
  handleCodeCopy(payload.text);
});

["pointerdown", "keydown"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
      if (event && event.isTrusted === false) return;
      lastUserGestureAt = Date.now();
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
    console.log("[Prism] 패널 상태 변경 감지:", message.open);
    panelOpen = Boolean(message.open);
    
    // 패널이 닫혔다면(false), 다음 복사 시 오브가 뜰 준비를 함
    if (!panelOpen) {
      destroyOrb(); // 혹시 남아있을지 모를 오브 정리
    }
  }
});

// 페이지 로드 시 현재 패널 상태 한 번 확인 (초기화)
safeSendMessage({ type: "PRISM_PANEL_STATUS_REQUEST" }, (resp) => {
  if (resp && typeof resp.open === 'boolean') {
    panelOpen = resp.open;
    if (panelOpen) destroyOrb();
  }
});


function handleCodeCopy(text) {
  const normalized = normalizeClipboard(text);
  const kind = detectKind(normalized);
  if (kind === "text") return;

  lastCode = normalized;
  lastLanguage = kind;

  // 메시지를 보내기 전에 이미 로컬 변수 panelOpen이 true라면
  // 굳이 응답을 기다리지 말고 즉시 전송 후 함수 종료 (Orb 안 띄움)
  if (panelOpen) {
    safeSendMessage({
      type: "PRISM_RENDER_NOW",
      code: lastCode,
      language: lastLanguage,
      theme: detectTheme()
    });
    destroyOrb(); // 혹시 떠있다면 제거
    return;
  }

  // 패널이 닫혀있다고 판단될 때만 메시지 후 응답 확인
  safeSendMessage(
    {
      type: "PRISM_RENDER_NOW",
      code: lastCode,
      language: lastLanguage,
      theme: detectTheme()
    },
    (resp) => {
      // 응답에서 온 open 상태도 확인 (이중 체크)
      // 백그라운드 스크립트가 resp.open을 안 보내줄 수도 있으므로
      // resp.open이 명확히 true일 때만 open으로 간주하거나, 기존 panelOpen 유지
      const isOpenResponse = Boolean(resp?.open);
      
      // 로컬 상태 업데이트
      if (isOpenResponse) {
        panelOpen = true;
      }

      if (panelOpen) {
        destroyOrb();
        return;
      }

      showOrb();
      scheduleHide();
    }
  );
}

// ... (UI 로직은 ensureOrb, showOrb, hideOrb, destroyOrb, scheduleHide 기존 유지) ...
function ensureOrb() {
  let orb = document.getElementById(ORB_ID);
  if (orb) return orb;

  orb = document.createElement("button");
  orb.id = ORB_ID;
  orb.type = "button";
  orb.setAttribute("aria-label", "Open Prism side panel");
  orb.setAttribute("title", "Open Prism");
  orb.innerHTML = `<span>${ORB_LABEL}</span>`;

  orb.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!lastCode) return;

    // 클릭 시 패널이 열리므로 상태 즉시 변경
    panelOpen = true; 
    destroyOrb(); // 오브 즉시 제거

    safeSendMessage({
      type: "OPEN_PRISM",
      code: lastCode,
      language: lastLanguage,
      theme: detectTheme()
    });
  });

  document.body.appendChild(orb);
  return orb;
}

function showOrb() {
  if (panelOpen) return; // 패널 열려있으면 절대 실행 안 함
  const orb = ensureOrb();
  requestAnimationFrame(() => {
    orb.classList.add(ORB_ACTIVE_CLASS);
  });
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