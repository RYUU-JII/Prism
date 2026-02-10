const ORB_ID = "prism-orb";
const ORB_ACTIVE_CLASS = "prism-orb--active";
const ORB_LABEL = "Refract";
let lastCode = "";
let lastLanguage = "text";
let hideTimer = null;
let cleanupTimer = null;
let lastCopyTime = 0;
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
function normalizeClipboard(text) { return (text || "").trim(); }
function detectTheme() {
try {
const html = document.documentElement;
const body = document.body;
const isDarkAttr =
html.classList.contains("dark") ||
body?.classList?.contains("dark") ||
html.getAttribute("data-theme") === "dark" ||
body?.getAttribute("data-theme") === "dark" ||
html.style.colorScheme === "dark";
if (isDarkAttr) return "dark";
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
const luminance = getLuminance(body) ?? getLuminance(html);
if (luminance !== null) {
return luminance < 0.5 ? "dark" : "light";
}
} catch (err) {}
return "light";
}
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
if (!panelOpen) {
destroyOrb();
}
}
});
safeSendMessage({ type: "PRISM_PANEL_STATUS_REQUEST" }, (resp) => {
if (resp && typeof resp.open === 'boolean') {
panelOpen = resp.open;
if (panelOpen) destroyOrb();
}
});
function handleCodeCopy(text) {
const now = Date.now();
if (now - lastCopyTime < 100) return;
lastCopyTime = now;
const normalized = normalizeClipboard(text);
const kind = detectKind(normalized);
if (kind === "text") return;
lastCode = normalized;
lastLanguage = kind;
safeSendMessage({
type: "PRISM_RENDER_NOW",
code: lastCode,
language: lastLanguage,
theme: detectTheme()
}, (resp) => {
if (resp && resp.open) {
panelOpen = true;
showFeedback();
} else {
panelOpen = false;
showOrb();
scheduleHide();
}
});
}
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
panelOpen = true;
destroyOrb();
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
if (panelOpen) return;
const orb = ensureOrb();
orb.dataset.theme = detectTheme();
requestAnimationFrame(() => {
orb.classList.add(ORB_ACTIVE_CLASS);
});
}
function showFeedback() {
const orb = ensureOrb();
if (hideTimer) clearTimeout(hideTimer);
if (cleanupTimer) clearTimeout(cleanupTimer);
orb.classList.add("prism-orb--feedback");
orb.dataset.theme = detectTheme();
void orb.offsetWidth;
requestAnimationFrame(() => {
orb.classList.add(ORB_ACTIVE_CLASS);
});
hideTimer = setTimeout(() => {
orb.classList.remove(ORB_ACTIVE_CLASS);
cleanupTimer = setTimeout(() => {
destroyOrb();
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
