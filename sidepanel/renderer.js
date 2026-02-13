document.documentElement.lang = navigator.language || "en";
const viewer = document.getElementById("viewer");
const snapshotBtn = document.getElementById("snapshot-btn");
const copyBtn = document.getElementById("copy-btn");
const saveHtmlBtn = document.getElementById("save-html-btn");
const openWindowBtn = document.getElementById("open-window-btn");
const panelShell = document.querySelector(".panel-shell");
const panelContent = document.querySelector(".panel-shell__content");
const expertModeBtn = document.getElementById("expert-mode-btn");
const expertThemeBtn = document.getElementById("expert-theme-btn");
const pickerBtn = document.getElementById("picker-btn");
const expertEditorContainer = document.getElementById("expert-editor-container");
const expertEditorMount = document.getElementById("expert-editor");
const ENABLE_EXPERT_MODE = false;
const ENABLE_PICKER = false;
let pendingPayload = null;
let viewerReady = false;
let latestPayload = null;
let pendingSnapshotAction = null;
let currentTabId = null;
let expertMode = false;
let editorView = null;
let editorApplyingRemote = false;
let expertTheme = "dark";
let pickerActive = false;
let pendingPickerToggle = false;
let editorInitPromise = null;
let lastRenderKey = "";
let hasRenderedOnce = false;
let toastTimer = null;
let toastEl = null;
let flashEl = null;
let snapshotCooldownUntil = 0;
const SNAPSHOT_COOLDOWN_MS = 900;
if (!ENABLE_EXPERT_MODE) {
document.body.classList.add("prism-no-expert");
if (expertModeBtn) expertModeBtn.disabled = true;
if (expertThemeBtn) expertThemeBtn.disabled = true;
if (expertEditorContainer) expertEditorContainer.setAttribute("aria-hidden", "true");
expertMode = false;
}
if (!ENABLE_PICKER) {
document.body.classList.add("prism-no-picker");
if (pickerBtn) pickerBtn.disabled = true;
pickerActive = false;
pendingPickerToggle = false;
}
function ensureToast() {
if (toastEl || !panelShell) return toastEl;
const el = document.createElement("div");
el.id = "prism-toast";
el.setAttribute("role", "status");
el.setAttribute("aria-live", "polite");
panelShell.appendChild(el);
toastEl = el;
return toastEl;
}
function ensureFlash() {
if (flashEl || !panelShell) return flashEl;
const el = document.createElement("div");
el.id = "prism-capture-flash";
panelShell.appendChild(el);
flashEl = el;
return flashEl;
}
function showToast(message) {
const el = ensureToast();
if (!el) return;
el.textContent = message;
el.classList.add("is-visible");
if (toastTimer) window.clearTimeout(toastTimer);
toastTimer = window.setTimeout(() => {
el.classList.remove("is-visible");
toastTimer = null;
}, 2200);
}
function flashCapture() {
const el = ensureFlash();
if (!el) return;
el.classList.remove("active");
void el.offsetWidth;
el.classList.add("active");
}
const storedTheme = localStorage.getItem("prism-expert-theme");
if (storedTheme === "light" || storedTheme === "dark") {
expertTheme = storedTheme;
}
const urlParams = new URLSearchParams(window.location.search);
const targetTabId = urlParams.get("tabId");
const windowHint = document.getElementById("window-hint");
const scriptLoadCache = new Map();
const styleLoadCache = new Map();
if (windowHint && targetTabId) {
windowHint.classList.add("is-visible");
window.setTimeout(() => {
windowHint.classList.remove("is-visible");
}, 5000);
}
async function toDataURL(url, baseUrl) {
if (!url || url.startsWith("data:")) return url;
let absoluteUrl = url;
if (url.startsWith("/") && baseUrl) {
const origin = baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`;
absoluteUrl = new URL(url, new URL(origin).origin).href;
}
try {
const response = await fetch(absoluteUrl);
const blob = await response.blob();
return new Promise((resolve) => {
const reader = new FileReader();
reader.onloadend = () => resolve(reader.result);
reader.readAsDataURL(blob);
});
} catch (err) {
return new Promise((resolve) => {
chrome.runtime.sendMessage({
type: "PRISM_PROXY_FETCH",
url: absoluteUrl
}, (response) => {
if (response?.dataUrl) resolve(response.dataUrl);
else resolve(url);
});
});
}
}
async function inlineAllResources(element, baseUrl) {
const imgs = Array.from(element.querySelectorAll("img"));
await Promise.all(imgs.map(async (img) => {
img.src = await toDataURL(img.src, baseUrl);
}));
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
if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
if (scriptLoadCache.has(src)) return scriptLoadCache.get(src);
const promise = new Promise((resolve, reject) => {
const script = document.createElement("script");
script.src = chrome.runtime.getURL(src);
script.async = true;
script.onload = () => resolve(globalName ? window[globalName] : true);
script.onerror = () => {
scriptLoadCache.delete(src);
reject(new Error(`Failed to load ${src}`));
};
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
function applyExpertThemeUI() {
if (!ENABLE_EXPERT_MODE) return;
if (expertEditorContainer) {
expertEditorContainer.dataset.theme = expertTheme;
}
if (expertThemeBtn) {
const label = expertThemeBtn.querySelector("span");
if (label) {
label.textContent = expertTheme === "dark" ? "Dark" : "Light";
}
expertThemeBtn.setAttribute("aria-pressed", expertTheme === "dark" ? "true" : "false");
}
}
function applyGlobalTheme(theme) {
if (!theme) return;
document.body.dataset.theme = theme;
expertTheme = theme;
applyExpertThemeUI();
}
function applyPickerUI() {
if (!ENABLE_PICKER) return;
if (pickerBtn) {
pickerBtn.classList.toggle("active", pickerActive);
pickerBtn.setAttribute("aria-pressed", pickerActive ? "true" : "false");
}
}
function updatePickerAvailability() {
if (!ENABLE_PICKER) return;
const canPick = latestPayload?.language === "html";
if (!pickerBtn) return;
pickerBtn.disabled = !canPick;
pickerBtn.title = canPick ? "Pick element" : "Element picker: HTML only";
if (!canPick && pickerActive) {
pickerActive = false;
applyPickerUI();
sendPickerToggle();
}
}
function sendPickerToggle() {
if (!ENABLE_PICKER) return;
if (!viewerReady) {
pendingPickerToggle = true;
return;
}
pendingPickerToggle = false;
viewer.contentWindow.postMessage(
{ type: "PRISM_PICKER_TOGGLE", active: pickerActive },
"*"
);
}
function buildEditorTheme(CM) {
const isDark = expertTheme === "dark";
return CM.EditorView.theme({
"&": {
height: "100%",
backgroundColor: isDark ? "#1e1e1e" : "#ffffff",
color: isDark ? "#d4d4d4" : "#1f1f1f"
},
".cm-scroller": { overflow: "auto" },
".cm-gutters": {
backgroundColor: isDark ? "#252526" : "#f3f3f3",
color: isDark ? "#858585" : "#6b6b6b",
borderRight: isDark ? "1px solid #333333" : "1px solid #e1e1e1"
},
".cm-content": {
fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
fontSize: "14px",
lineHeight: "1.5",
padding: "10px 0"
},
".cm-cursor": { borderLeftColor: isDark ? "#aeafad" : "#111111" },
".cm-selectionBackground": { backgroundColor: isDark ? "#264f78" : "#add6ff" },
".cm-activeLine": { backgroundColor: isDark ? "#2a2d2e" : "#f0f0f0" },
".cm-activeLineGutter": { backgroundColor: isDark ? "#2a2d2e" : "#f0f0f0" }
});
}
async function ensureExpertEditor() {
if (editorView) return editorView;
if (!expertEditorMount) return null;
if (editorInitPromise) return editorInitPromise;
window.codemirror = window.codemirror || {};
editorInitPromise = (async () => {
try {
await loadScriptOnce("sidepanel/vendor/codemirror-bundle.js", "CodeMirrorBundle");
if (window.codemirror && (window.codemirror.EditorView || window.codemirror.basicSetup)) {
window.CodeMirrorBundle = window.codemirror;
}
const CM = getCodeMirrorBundle();
if (!CM || !CM.EditorView) {
throw new Error("EditorView not found in bundle. Check if the bundle exports 'codemirror' or 'CodeMirrorBundle'.");
}
const updateListener = CM.EditorView.updateListener.of((update) => {
if (!update.docChanged || editorApplyingRemote) return;
const newCode = update.state.doc.toString();
renderPayload(newCode, detectKind(newCode), latestPayload?.url, latestPayload?.theme);
});
const extensions = [
CM.basicSetup,
CM.html(),
updateListener,
buildEditorTheme(CM)
];
if (expertEditorMount) {
expertEditorMount.textContent = "";
}
if (CM.EditorState?.create) {
editorView = new CM.EditorView({
state: CM.EditorState.create({
doc: latestPayload?.code || "",
extensions
}),
parent: expertEditorMount
});
} else {
editorView = new CM.EditorView({
doc: latestPayload?.code || "",
extensions,
parent: expertEditorMount
});
}
return editorView;
} catch (err) {
console.error("[Prism] Expert Editor Init Error:", err);
return null;
} finally {
editorInitPromise = null;
}
})();
return editorInitPromise;
}
function setEditorContent(code) {
if (!editorView) return;
editorApplyingRemote = true;
editorView.dispatch({
changes: { from: 0, to: editorView.state.doc.length, insert: code || "" }
});
editorApplyingRemote = false;
}
function focusEditorAtLine(lineNumber) {
const targetLine = Number(lineNumber);
if (!Number.isFinite(targetLine) || targetLine < 1) return;
const applySelection = () => {
if (!editorView) return;
const line = editorView.state.doc.line(targetLine);
editorView.dispatch({
selection: { anchor: line.from, head: line.to },
scrollIntoView: true
});
editorView.focus();
};
if (!expertMode) {
setExpertMode(true, { skipEditorSync: true });
}
if (!editorView) {
ensureExpertEditor().then(() => {
if (editorView && latestPayload?.code) {
const current = editorView.state.doc.toString();
if (current !== latestPayload.code) {
setEditorContent(latestPayload.code);
}
}
applySelection();
});
return;
}
applySelection();
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
async function performCaptureInParent(data) {
const action = pendingSnapshotAction || "download";
pendingSnapshotAction = null;
let container = null;
let stage = null;
let host = null;
try {
if (!data || !data.html) {
throw new Error("No capture payload provided.");
}
const VIRTUAL_WIDTH = 1280;
const VIRTUAL_HEIGHT = Math.max(720, Math.ceil(Number(data.height) || 0));
host = document.createElement("div");
host.id = "prism-capture-host";
host.style.cssText = `
position: fixed;
left: -10000px;
top: 0;
width: 1px;
height: 1px;
pointer-events: none;
z-index: -9999;
`;
const shadowRoot = host.attachShadow({ mode: "open" });
container = document.createElement("div");
container.id = "prism-capture-root";
container.className = (data.bodyClass || "").trim();
container.style.cssText = `
position: fixed;
left: -5000px;
top: 0;
width: ${VIRTUAL_WIDTH}px;
height: ${VIRTUAL_HEIGHT}px;
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
stage.querySelectorAll("[data-prism-picker-overlay='true'], [data-prism-picker-hover-proxy='true'], [data-prism-svg-instruction-proxy='true']").forEach((el) => {
el.remove();
});
stage.querySelectorAll(".prism-has-instruction, .prism-has-instruction--background, .prism-has-instruction--svg, .prism-has-instruction--picker-focus").forEach((el) => {
if (!el || !el.classList) return;
el.classList.remove("prism-has-instruction");
el.classList.remove("prism-has-instruction--background");
el.classList.remove("prism-has-instruction--svg");
el.classList.remove("prism-has-instruction--picker-focus");
});
stage.querySelectorAll("script").forEach((el) => el.remove());
stage.querySelectorAll("link[rel='stylesheet']").forEach((el) => el.remove());
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
shadowRoot.appendChild(container);
document.body.appendChild(host);
const baseUrl = latestPayload?.url || "";
await inlineAllResources(stage, baseUrl);
await loadStyleOnce("sidepanel/theme.css").catch(() => {});
if (data.html.includes("class=")) {
await loadStyleOnce("sidepanel/tailwind.css").catch(() => {});
}
await loadScriptOnce("sidepanel/vendor/modern-screenshot.js");
if (document.fonts && document.fonts.ready) {
await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 250))]);
}
await waitForPaint(3);
await new Promise((resolve) => setTimeout(resolve, 300));
if (!window.modernScreenshot || typeof window.modernScreenshot.domToPng !== "function") {
throw new Error("modernScreenshot library (domToPng) not found.");
}
const { domToPng } = window.modernScreenshot;
const dataUrl = await domToPng(stage, {
width: VIRTUAL_WIDTH,
height: VIRTUAL_HEIGHT,
scale: 2,
backgroundColor: data.background || "#ffffff",
style: {
transform: "scale(1)",
transformOrigin: "top left"
},
features: {
copyStyles: true,
}
});
if (action === "clipboard") {
await copyImageToClipboard(dataUrl);
return;
}
const blob = dataUrlToBlob(dataUrl);
const url = URL.createObjectURL(blob);
chrome.downloads.download({ url, filename: "prism-desktop-snapshot.png", saveAs: true }, () => {
URL.revokeObjectURL(url);
});
} catch (err) {
console.error("[Prism] Parent capture failed:", err);
} finally {
if (host) {
host.remove();
} else if (container) {
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
if (sourceIndicators.some(r => r.test(code))) {
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
function postToSandbox(payload) {
if (!viewerReady) {
pendingPayload = payload;
return;
}
viewer.contentWindow.postMessage({ type: "RENDER", ...payload }, "*");
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
function renderPayload(code, language, url, theme) {
if (!code) {
latestPayload = null;
updatePickerAvailability();
postToSandbox({ code: "", language: "text", url: "" });
return;
}
const kind = language && language !== "text" ? language : detectKind(code);
const source = normalizeSource(url);
const fixedCode = fixRelativePaths(code, source);
const sandboxCode = kind === "html" ? addPrismLineAttributes(fixedCode) : fixedCode;
latestPayload = { code, language: kind, url: source, theme: theme || "light" };
postToSandbox({ ...latestPayload, code: sandboxCode });
updatePickerAvailability();
}
function updateViewer(code, language, url, theme) {
if (!code) {
lastRenderKey = "";
hasRenderedOnce = false;
renderPayload(code, language, url, theme);
return;
}
applyGlobalTheme(theme);
const nextKey = buildRenderKey(code, language, url, theme);
if (hasRenderedOnce && nextKey === lastRenderKey) {
return;
}
lastRenderKey = nextKey;
hasRenderedOnce = true;
if (ENABLE_EXPERT_MODE && expertMode) {
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
function setExpertMode(active, options = {}) {
if (!ENABLE_EXPERT_MODE) {
expertMode = false;
return;
}
expertMode = Boolean(active);
applyExpertThemeUI();
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
if (editorView && !options.skipEditorSync) {
const nextCode = latestPayload?.code || "";
if (nextCode && editorView.state.doc.toString() !== nextCode) {
setEditorContent(nextCode);
}
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
alert("No code to render.");
return;
}
const tabId = currentTabId ?? "_global";
const url = chrome.runtime.getURL(`sidepanel/window.html?tabId=${encodeURIComponent(tabId)}`);
chrome.tabs.create({ url }, (createdTab) => {
const notifyTabId = createdTab?.id;
chrome.runtime.sendMessage({
type: "PRISM_SET_LATEST",
tabId,
payload: latestPayload,
notifyTabId
}, () => {
window.close();
});
});
});
}
if (expertModeBtn && ENABLE_EXPERT_MODE) {
expertModeBtn.addEventListener("click", () => {
setExpertMode(!expertMode);
});
}
if (pickerBtn && ENABLE_PICKER) {
pickerBtn.addEventListener("click", () => {
if (pickerBtn.disabled) return;
pickerActive = !pickerActive;
applyPickerUI();
sendPickerToggle();
});
}
if (expertThemeBtn && ENABLE_EXPERT_MODE) {
expertThemeBtn.addEventListener("click", () => {
const newTheme = expertTheme === "dark" ? "light" : "dark";
localStorage.setItem("prism-expert-theme", newTheme);
applyGlobalTheme(newTheme);
if (editorView) {
const code = editorView.state.doc.toString();
editorView.destroy();
editorView = null;
if (expertEditorMount) {
expertEditorMount.textContent = "";
}
ensureExpertEditor().then(() => setEditorContent(code));
}
});
}
if (snapshotBtn) {
snapshotBtn.addEventListener("click", () => {
if (!viewerReady) return;
if (pendingSnapshotAction || Date.now() < snapshotCooldownUntil) {
showToast("Processing... please wait.");
return;
}
flashCapture();
snapshotCooldownUntil = Date.now() + SNAPSHOT_COOLDOWN_MS;
pendingSnapshotAction = "download";
viewer.contentWindow.postMessage({ type: "PRISM_SNAPSHOT" }, "*");
});
}
if (copyBtn) {
copyBtn.addEventListener("click", () => {
if (!viewerReady) return;
if (pendingSnapshotAction || Date.now() < snapshotCooldownUntil) {
showToast("Processing... please wait.");
return;
}
flashCapture();
snapshotCooldownUntil = Date.now() + SNAPSHOT_COOLDOWN_MS;
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
if (data.type === "PRISM_PICKER_SELECT") {
if (!ENABLE_PICKER) return;
pickerActive = false;
applyPickerUI();
sendPickerToggle();
focusEditorAtLine(data.line);
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
performCaptureInParent(data);
return;
}
const { type, dataUrl, error, stage, meta } = data;
if (type === "PRISM_SNAPSHOT_RESULT" && dataUrl) {
const action = pendingSnapshotAction || "download";
pendingSnapshotAction = null;
if (action === "clipboard") {
copyImageToClipboard(dataUrl).catch((err) => console.warn("[Prism] Clipboard copy failed:", err));
flashCapture();
showToast("Image copied to clipboard.");
} else {
const blob = dataUrlToBlob(dataUrl);
const url = URL.createObjectURL(blob);
chrome.downloads.download({ url, filename: "prism-snapshot.png", saveAs: true }, () => URL.revokeObjectURL(url));
flashCapture();
showToast("Image saved.");
}
}
if (type === "PRISM_SNAPSHOT_RESULT" && error) {
console.warn("[Prism] Snapshot failed:", stage ? `(${stage})` : "", error, meta || "");
pendingSnapshotAction = null;
}
if (type === "PRISM_SNAPSHOT_STATUS") {
}
});
viewer.addEventListener("load", () => {
viewerReady = true;
viewer.classList.add("is-ready");
if (pendingPayload) {
postToSandbox(pendingPayload);
pendingPayload = null;
}
if (pendingPickerToggle && ENABLE_PICKER) {
sendPickerToggle();
}
});
window.addEventListener("beforeunload", () => {
notifyPanelStatus(false);
});
let lifecyclePort = null;
function connectHeartbeat() {
try {
lifecyclePort = chrome.runtime.connect({ name: "prism-heartbeat" });
lifecyclePort.onDisconnect.addListener(() => {
lifecyclePort = null;
setTimeout(connectHeartbeat, 1000);
});
if (targetTabId || currentTabId) {
const tabId = targetTabId ? Number(targetTabId) : currentTabId;
lifecyclePort.postMessage({ tabId });
}
} catch (e) {
console.warn("[Prism] Failed to connect heartbeat:", e);
}
}
connectHeartbeat();
function notifyPanelStatus(open) {
const finalTabId = targetTabId ? Number(targetTabId) : currentTabId;
if (!finalTabId) return;
if (open) {
chrome.runtime.sendMessage({
type: "PRISM_PANEL_STATUS",
tabId: finalTabId,
open: true
});
if (lifecyclePort) {
try {
lifecyclePort.postMessage({ tabId: finalTabId });
} catch (e) {
lifecyclePort = null;
connectHeartbeat();
}
}
}
}
requestLatest();
applyExpertThemeUI();
applyPickerUI();
