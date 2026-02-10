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
async function isPanelOpen(tabId) {
const { panelOpenByTab = {} } = await chrome.storage.session.get("panelOpenByTab");
return panelOpenByTab[tabId] === true;
}
async function setPanelStatus(tabId, isOpen) {
const { panelOpenByTab = {} } = await chrome.storage.session.get("panelOpenByTab");
if (isOpen) {
panelOpenByTab[tabId] = true;
} else {
delete panelOpenByTab[tabId];
}
await chrome.storage.session.set({ panelOpenByTab });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
const tabId = sender?.tab?.id ?? message.tabId ?? "_global";
if (message?.type === "OPEN_PRISM") {
const payload = {
code: message.code || "",
language: message.language || "text",
url: sender?.tab?.url || message.url || "",
theme: message.theme || "light"
};
const openPromise = (sender?.tab?.id !== undefined && chrome.sidePanel?.open)
? chrome.sidePanel.open({ tabId: sender.tab.id })
: Promise.resolve();
(async () => {
try {
await storeLatest(tabId, payload);
await setPanelStatus(tabId, true);
await openPromise;
setTimeout(() => {
chrome.runtime.sendMessage({ type: "PRISM_RENDER", tabId, ...payload }, () => {
if (chrome.runtime?.lastError) {  }
});
}, 500);
sendResponse({ ok: true, open: true });
} catch (e) {
console.error("[Prism] Failed to open panel:", e);
await setPanelStatus(tabId, false);
sendResponse({ ok: false, error: e.message });
}
})();
return true;
}
else if (message?.type === "PRISM_RENDER_NOW") {
const payload = {
code: message.code || "",
language: message.language || "text",
url: sender?.tab?.url || message.url || "",
theme: message.theme || "light"
};
(async () => {
await storeLatest(tabId, payload);
chrome.runtime.sendMessage({ type: "PRISM_RENDER", tabId, ...payload }, async () => {
const err = chrome.runtime?.lastError;
if (err) {
const isOpen = await isPanelOpen(tabId);
if (!isOpen) await setPanelStatus(tabId, false);
sendResponse({ ok: true, open: isOpen });
} else {
await setPanelStatus(tabId, true);
sendResponse({ ok: true, open: true });
}
});
})();
return true;
}
else if (message.type === "PRISM_PANEL_STATUS") {
const statusTabId = message.tabId;
const isOpen = message.open === true;
(async () => {
await setPanelStatus(statusTabId, isOpen);
chrome.tabs.sendMessage(statusTabId, {
type: "PRISM_PANEL_STATUS",
open: isOpen
}).catch(() => {  });
})();
sendResponse({ ok: true });
return true;
}
else if (message?.type === "PRISM_PANEL_STATUS_REQUEST") {
(async () => {
const isOpen = await isPanelOpen(tabId);
sendResponse({ ok: true, open: isOpen });
})();
return true;
}
else if (message?.type === "PRISM_GET_LATEST") {
(async () => {
const targetTabId = message.tabId ?? "_global";
const { latestByTab = {} } = await chrome.storage.session.get("latestByTab");
const payload = latestByTab[targetTabId] || { code: "", language: "text", url: "" };
sendResponse({ ok: true, payload });
})();
return true;
}
else if (message?.type === "PRISM_SET_LATEST") {
(async () => {
const targetTabId = message.tabId ?? "_global";
const payload = message.payload || {};
await storeLatest(targetTabId, payload);
if (message.notifyTabId) {
chrome.runtime.sendMessage({ type: "PRISM_RENDER", tabId: targetTabId, ...payload }, () => {
if (chrome.runtime?.lastError) {  }
});
}
sendResponse({ ok: true });
})();
return true;
}
else if (message?.type === "PRISM_DEVLOG") {
sendResponse({ ok: true });
}
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
port.onMessage.addListener((msg) => {
if (msg.tabId) {
ownerTabId = msg.tabId;
setPanelStatus(ownerTabId, true);
}
});
port.onDisconnect.addListener(() => {
if (ownerTabId) {
setPanelStatus(ownerTabId, false);
chrome.tabs.sendMessage(ownerTabId, {
type: "PRISM_PANEL_STATUS",
open: false
}).catch(() => {});
}
});
}
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
const { latestByTab = {}, panelOpenByTab = {} } = await chrome.storage.session.get(["latestByTab", "panelOpenByTab"]);
delete latestByTab[tabId];
delete panelOpenByTab[tabId];
await chrome.storage.session.set({ latestByTab, panelOpenByTab });
});
chrome.runtime.onSuspend.addListener(() => {
});
