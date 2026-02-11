/**
 * 특정 탭의 최신 페이로드를 저장합니다.
 * 서비스 워커 중단에 대비해 chrome.storage.session을 사용합니다.
 */
async function storeLatest(tabId, payload) {
  const { latestByTab = {} } = await chrome.storage.session.get("latestByTab");
  latestByTab[tabId] = {
    code: payload.code || "",
    language: payload.language || "text",
    url: payload.url || "",
    theme: payload.theme || "light"
  };
  await chrome.storage.session.set({ latestByTab });
}

/**
 * [단순화] 패널 열림 여부를 단일 변수로 관리합니다.
 * Heartbeat 포트가 연결되어 있으면 열림, 끊기면 닫힘.
 * 탭 ID별 추적은 불필요 — Chrome 사이드패널은 단일 인스턴스입니다.
 */
let activePanelPort = null;

function isPanelCurrentlyOpen() {
  return activePanelPort !== null;
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

    // 사용자 제스처 유지를 위해 sidePanel.open을 최우선으로 호출
    const openPromise = (sender?.tab?.id !== undefined && chrome.sidePanel?.open)
      ? chrome.sidePanel.open({ tabId: sender.tab.id })
      : Promise.resolve();

    (async () => {
      try {
        await storeLatest(tabId, payload);
        await openPromise;

        setTimeout(() => {
          chrome.runtime.sendMessage({ type: "PRISM_RENDER", tabId, ...payload }, () => {
            if (chrome.runtime?.lastError) { /* no-op */ }
          });
        }, 500);
        sendResponse({ ok: true, open: true });
      } catch (e) {
        console.error("[Prism] Failed to open panel:", e);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  // 2. 코드 복사 시 즉시 렌더링 요청 (오브 노출 결정에 중요)
  else if (message?.type === "PRISM_RENDER_NOW") {
    const payload = {
      code: message.code || "",
      language: message.language || "text",
      url: sender?.tab?.url || message.url || "",
      theme: message.theme || "light"
    };

    (async () => {
      await storeLatest(tabId, payload);

      // [단순화] Heartbeat 포트 연결 여부로 즉시 판단 (async 불필요)
      const isOpen = isPanelCurrentlyOpen();

      if (isOpen) {
        chrome.runtime.sendMessage({ type: "PRISM_RENDER", tabId, ...payload }, () => {
          if (chrome.runtime?.lastError) { /* no-op */ }
        });
      }

      sendResponse({ ok: true, open: isOpen });
    })();
    return true; // 비동기 응답 처리
  }

  // 3. 렌더러(패널)로부터 상태 변경 알림 수신
  else if (message.type === "PRISM_PANEL_STATUS") {
    const statusTabId = message.tabId;
    const isOpen = message.open === true;

    // content script에 상태 전파
    chrome.tabs.sendMessage(statusTabId, {
      type: "PRISM_PANEL_STATUS",
      open: isOpen
    }).catch(() => { /* 탭이 이미 닫혔을 경우 무시 */ });

    sendResponse({ ok: true });
    return true;
  }

  // 4. content.js에서 현재 패널 상태 문의
  else if (message?.type === "PRISM_PANEL_STATUS_REQUEST") {
    sendResponse({ ok: true, open: isPanelCurrentlyOpen() });
    return true;
  }

  // 5. 패널이 최신 데이터를 요청할 때 (GET_LATEST)
  else if (message?.type === "PRISM_GET_LATEST") {
    (async () => {
      const targetTabId = message.tabId ?? "_global";
      const { latestByTab = {} } = await chrome.storage.session.get("latestByTab");
      const payload = latestByTab[targetTabId] || { code: "", language: "text", url: "" };
      sendResponse({ ok: true, payload });
    })();
    return true;
  }

  // 5-1. 패널에서 최신 데이터를 갱신 저장
  else if (message?.type === "PRISM_SET_LATEST") {
    (async () => {
      const targetTabId = message.tabId ?? "_global";
      const payload = message.payload || {};
      await storeLatest(targetTabId, payload);

      if (message.notifyTabId) {
        chrome.runtime.sendMessage({ type: "PRISM_RENDER", tabId: targetTabId, ...payload }, () => {
          if (chrome.runtime?.lastError) { /* no-op */ }
        });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  // 6. 기타 유틸리티 메시지 처리
  else if (message?.type === "PRISM_DEVLOG") {
    sendResponse({ ok: true });
  }

  // 7. 프록시(fetch) 요청 처리
  else if (message.type === "PRISM_PROXY_FETCH") {
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
    return true;
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
              chrome.sidePanel.open({ tabId: targetTabId }).catch(() => { });
            }
          });
        });
      }
    });
    sendResponse({ ok: true });
  }

  return true;
});

/**
 * [단순화] Heartbeat 포트 = 패널 열림 상태의 유일한 진실 공급원(SSOT)
 * 포트 연결 → 패널 열림 / 포트 해제 → 패널 닫힘
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "prism-heartbeat") {
    activePanelPort = port;
    let ownerTabId = null;

    port.onMessage.addListener((msg) => {
      if (msg.tabId) {
        ownerTabId = msg.tabId;
      }
    });

    // 패널이 닫혀서 연결이 끊어지면 실행
    port.onDisconnect.addListener(() => {
      activePanelPort = null;

      // Content Script에 닫힘 알림
      if (ownerTabId) {
        chrome.tabs.sendMessage(ownerTabId, {
          type: "PRISM_PANEL_STATUS",
          open: false
        }).catch(() => { });
      }
    });
  }
});

// 탭 종료 시 메모리 정리
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { latestByTab = {} } = await chrome.storage.session.get("latestByTab");
  delete latestByTab[tabId];
  await chrome.storage.session.set({ latestByTab });
});
