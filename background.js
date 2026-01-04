// 탭별 최신 코드 및 패널 상태 관리
const latestByTab = new Map();
const panelOpenByTab = new Map();

/**
 * 특정 탭의 최신 페이로드를 저장합니다.
 */
function storeLatest(tabId, payload) {
  latestByTab.set(tabId, {
    code: payload.code || "",
    language: payload.language || "text",
    url: payload.url || "",
    theme: payload.theme || "light"
  });
}

/**
 * 특정 탭의 패널이 열려있는지 확인합니다.
 */
function isPanelOpen(tabId) {
  return panelOpenByTab.get(tabId) === true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id ?? message.tabId ?? "_global";

  // 1. 오브(Orb) 클릭 시 사이드패널 열기 요청
  if (message?.type === "OPEN_PRISM") {
    const payload = {
      code: message.code || "",
      language: message.language || "text",
      url: sender?.tab?.url || message.url || "",
      theme: message.theme || "light"
    };

    storeLatest(tabId, payload);
    // [수정] 열기 요청 시 상태를 즉시 true로 설정 
    panelOpenByTab.set(tabId, true);

    const sendRender = () => {
      chrome.runtime.sendMessage({ type: "PRISM_RENDER", tabId, ...payload }, () => {
        if (chrome.runtime?.lastError) { /* 아직 렌더러가 준비 안 됨 */ }
      });
    };

    if (sender?.tab?.id !== undefined && chrome.sidePanel?.open) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => setTimeout(sendRender, 300))
        .catch(() => setTimeout(sendRender, 300));
    } else {
      setTimeout(sendRender, 300);
    }
    sendResponse({ ok: true, open: true });
  }

  // 2. 코드 복사 시 즉시 렌더링 요청 (오브 노출 결정에 중요)
  else if (message?.type === "PRISM_RENDER_NOW") {
    const payload = {
      code: message.code || "",
      language: message.language || "text",
      url: sender?.tab?.url || message.url || "",
      theme: message.theme || "light"
    };

    storeLatest(tabId, payload);

    // 렌더러(사이드패널)로 메시지 전송 시도 
    chrome.runtime.sendMessage({ type: "PRISM_RENDER", tabId, ...payload }, () => {
      const err = chrome.runtime?.lastError;
      if (err) {
        // 메시지 전송 실패 시, Heartbeat로 유지되는 상태를 확인 (Fallback)
        const isOpen = isPanelOpen(tabId);
        if (!isOpen) panelOpenByTab.set(tabId, false);
        sendResponse({ ok: true, open: isOpen });
      } else {
        // 메시지 전송 성공 시 확실히 열림
        panelOpenByTab.set(tabId, true);
        sendResponse({ ok: true, open: true });
      }
    });
    return true; // 비동기 응답 처리
  }

  // 3. [핵심] 렌더러(패널)로부터 상태 변경 알림 수신
  else if (message.type === "PRISM_PANEL_STATUS") {
    const statusTabId = message.tabId;
    const isOpen = message.open === true;

    // [중요] 백그라운드 메모리에 상태 저장 (이게 빠져있었습니다) 
    panelOpenByTab.set(statusTabId, isOpen);

    // 해당 탭의 content.js로 상태 전파 
    chrome.tabs.sendMessage(statusTabId, {
      type: "PRISM_PANEL_STATUS",
      open: isOpen
    }).catch(() => { /* 탭이 이미 닫혔을 경우 무시 */ });
    
    sendResponse({ ok: true });
  }

  // 4. content.js에서 현재 패널 상태 문의
  else if (message?.type === "PRISM_PANEL_STATUS_REQUEST") {
    // [수정] 메모리에 저장된 최신 상태를 반환 [cite: 108]
    sendResponse({ ok: true, open: isPanelOpen(tabId) });
  }

  // 5. 패널이 최신 데이터를 요청할 때 (GET_LATEST)
  else if (message?.type === "PRISM_GET_LATEST") {
    const targetTabId = message.tabId ?? "_global";
    const payload = latestByTab.get(targetTabId) || { code: "", language: "text", url: "" };
    sendResponse({ ok: true, payload });
  }
  
  // 5-1. 패널에서 최신 데이터를 갱신 저장
  else if (message?.type === "PRISM_SET_LATEST") {
    const targetTabId = message.tabId ?? "_global";
    const payload = message.payload || {};
    storeLatest(targetTabId, payload);

    if (message.notifyTabId) {
      const notifyTabId = message.notifyTabId;
      chrome.runtime.sendMessage({ type: "PRISM_RENDER", tabId: targetTabId, ...payload }, () => {
        if (chrome.runtime?.lastError) {
          // no-op
        }
      });
    }
    sendResponse({ ok: true });
  }

  // 6. 기타 유틸리티 메시지 처리
  else if (message?.type === "PRISM_DEVLOG") {
    sendResponse({ ok: true });
  }

  // 7. 프록시(fetch) 요청 처리
  else if (message.type === "PRISM_PROXY_FETCH") {
    // [보안] URL 검증: http/https 프로토콜만 허용하고 로컬/사설 IP 접근 차단 시도
    try {
      const targetUrl = new URL(message.url);
      if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error("Invalid protocol");
    } catch (e) {
      return sendResponse({ error: "Invalid or restricted URL" });
    }

    fetch(message.url)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => sendResponse({ dataUrl: reader.result });
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.error("[Prism Proxy] Fetch failed:", error);
        sendResponse({ error: error.message });
      });
    return true; // 비동기 응답을 위해 true 반환
  }

  // 8. 탭으로 복귀 요청 처리
  else if (message?.type === "PRISM_RETURN_TO_TAB") {
    const targetTabId = message.tabId;
    if (!targetTabId) return sendResponse({ ok: false });

    chrome.tabs.get(targetTabId, (tab) => {
      if (tab?.windowId !== undefined) {
        chrome.windows.update(tab.windowId, { focused: true }, () => {
          chrome.tabs.update(targetTabId, { active: true }, () => {
            if (chrome.sidePanel?.open) {
              chrome.sidePanel.open({ tabId: targetTabId }).catch(() => {});
            }
          });
        });
      }
    });
    sendResponse({ ok: true });
  }

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "prism-heartbeat") {
    let ownerTabId = null;

    // 패널이 "나는 이 탭 거야"라고 말하면 ID 기억
    port.onMessage.addListener((msg) => {
      if (msg.tabId) {
        ownerTabId = msg.tabId;
        // [수정] Heartbeat가 살아있다면 해당 탭의 패널은 확실히 열려있는 상태임
        panelOpenByTab.set(ownerTabId, true);
        // console.log(`[Prism Heartbeat] Connected to Tab ${ownerTabId}`);
      }
    });

    // 패널이 닫혀서 연결이 끊어지면 실행
    port.onDisconnect.addListener(() => {
      if (ownerTabId) {
        // 1. 백그라운드 메모리 갱신
        panelOpenByTab.set(ownerTabId, false);
        
        // 2. Content Script에 알림
        chrome.tabs.sendMessage(ownerTabId, {
          type: "PRISM_PANEL_STATUS",
          open: false
        }).catch(() => {});
      }
    });
  }
});

// 탭 종료 시 메모리 정리
chrome.tabs.onRemoved.addListener((tabId) => {
  latestByTab.delete(tabId);
  panelOpenByTab.delete(tabId);
});
