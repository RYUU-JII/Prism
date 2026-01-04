const ORB_ID = "prism-orb";
const ORB_ACTIVE_CLASS = "prism-orb--active";
const ORB_LABEL = "Refract";

let lastCode = "";
let lastLanguage = "text";
let hideTimer = null;
let cleanupTimer = null; // 피드백 종료 타이머 추적용
let lastCopyTime = 0; // 중복 복사 방지용 타임스탬프
const GESTURE_WINDOW_MS = 4000;
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

function detectKind(code) {
  if (!code || typeof code !== "string") return "text";

  // 1. Explicit HTML Document
  if (/^\s*<!DOCTYPE\s+html/i.test(code) || /<html[\s>]/i.test(code)) {
    return "html";
  }

  // 2. Strong React/Vue Source Indicators
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

  if (sourceIndicators.some(r => r.test(code))) {
    if (/\bv-|@click|:\w+=|<template>|from\s+['"]vue['"]/.test(code)) return "vue";
    return "react";
  }

  // 3. Framework specific keywords (Hooks, API)
  if (/useState\s*\(|useEffect\s*\(|use[A-Z][a-zA-Z]*\s*\(|ReactDOM/.test(code)) return "react";
  if (/createApp\s*\(|defineComponent\s*\(|from\s+['"]vue['"]/.test(code)) return "vue";

  // 4. Generic HTML Fragment
  if (/<[a-z][\s\S]*>/i.test(code)) return "html";

  return "text";
}

function normalizeClipboard(text) { return (text || "").trim(); }

function detectTheme() {
  try {
    const html = document.documentElement;
    const body = document.body;

    // 1. 명시적인 클래스나 data-theme 속성 확인 (가장 정확함)
    const isDarkAttr = 
      html.classList.contains("dark") || 
      body?.classList?.contains("dark") ||
      html.getAttribute("data-theme") === "dark" ||
      body?.getAttribute("data-theme") === "dark" ||
      html.style.colorScheme === "dark";
    
    if (isDarkAttr) return "dark";

    // 2. 배경색 휘도(Luminance) 계산 로직
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

    // body -> html 순서로 실제 배경색을 확인하여 테마 판별
    const luminance = getLuminance(body) ?? getLuminance(html);
    if (luminance !== null) {
      return luminance < 0.5 ? "dark" : "light";
    }
  } catch (err) {}

  // 3. 모든 감지 실패 시 기본값은 라이트 모드
  return "light";
}

// ... (이벤트 리스너 부분 기존과 동일) ...
document.addEventListener("prism-clipboard-write", (event) => {
  const text = event.detail;
  if (!text || typeof text !== "string") return;
  if (Date.now() - lastUserGestureAt > GESTURE_WINDOW_MS) return;
  handleCodeCopy(text);
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
  // [중복 방지] copy 이벤트와 spy.js가 동시에 트리거될 때 두 번 실행되는 것을 방지 (100ms 디바운스)
  const now = Date.now();
  if (now - lastCopyTime < 100) return;
  lastCopyTime = now;

  const normalized = normalizeClipboard(text);
  const kind = detectKind(normalized);
  if (kind === "text") return;

  lastCode = normalized;
  lastLanguage = kind;

  // [Strict State Management]
  // 상태를 묻지 않고 즉시 렌더링을 시도합니다.
  // 백그라운드는 실제 패널에 메시지 전송을 시도하고, 그 성공 여부(open)를 반환합니다.
  safeSendMessage({
    type: "PRISM_RENDER_NOW",
    code: lastCode,
    language: lastLanguage,
    theme: detectTheme()
  }, (resp) => {
    // 메시지가 패널에 도달했다면(open: true), 패널이 열려있는 것이므로 오브를 띄우지 않습니다.
    if (resp && resp.open) {
      panelOpen = true;
      showFeedback(); // 패널이 열려있으면 버튼 대신 피드백 효과만 노출
    } else {
      // 도달 실패(open: false)라면 패널이 닫힌 것이므로 오브를 보여줍니다.
      panelOpen = false;
      showOrb();
      scheduleHide();
    }
  });
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
  orb.dataset.theme = detectTheme();
  requestAnimationFrame(() => {
    orb.classList.add(ORB_ACTIVE_CLASS);
  });
}

function showFeedback() {
  const orb = ensureOrb();
  
  // 기존 타이머나 상태 초기화
  if (hideTimer) clearTimeout(hideTimer);
  if (cleanupTimer) clearTimeout(cleanupTimer);
  
  // 피드백 모드 클래스 추가 (CSS에서 클릭 방지 및 아이콘 숨김 처리)
  orb.classList.add("prism-orb--feedback");
  orb.dataset.theme = detectTheme();
  
  // [Animation Fix] 브라우저가 초기 상태(width: 0)를 인식하도록 강제 리플로우
  void orb.offsetWidth;

  requestAnimationFrame(() => {
    orb.classList.add(ORB_ACTIVE_CLASS);
  });

  // 0.5초 동안만 빛을 보여주고 사라짐
  hideTimer = setTimeout(() => {
    orb.classList.remove(ORB_ACTIVE_CLASS);
    cleanupTimer = setTimeout(() => {
      destroyOrb(); // 페이드 아웃 후 완전히 제거
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
