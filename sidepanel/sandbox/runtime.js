import {
  DEFAULT_UI_SETTINGS,
  normalizeUiSettings,
  sources
} from "./constants.js";
import { escapeHtml, pickStyles } from "./helpers.js";
import { createReactRenderer } from "./renderers/react.js";
import { createVueRenderer } from "./renderers/vue.js";
import { createHtmlRenderer } from "./renderers/html.js";

/* --- [2. JavaScript runtime bootstrap] --- */
document.documentElement.lang = navigator.language || "en";

const root = document.getElementById("prism-root");
const scriptCache = new Map();
let activeReactRoot = null;
let activeVueApp = null;
let activeVueStyleNodes = [];
let reactEsmRunner = null;
let reactRenderToken = 0;
let uiState = {
  pickerActive: false,
  frozen: false,
  instructions: {},
  previewLine: null,
  editingLine: null,
  settings: { ...DEFAULT_UI_SETTINGS }
};
// Dynamic library loader
function loadScript(src) {
  if (scriptCache.has(src)) return scriptCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
  scriptCache.set(src, promise);
  return promise;
}

async function loadLibraries(names) {
  const scripts = names.map(name => sources[name]).filter(Boolean);
  await Promise.all(scripts.map(src => loadScript(src)));
}

// --- [3. Code rendering and dispatch] ---
function resetVueStyles() {
  if (!Array.isArray(activeVueStyleNodes) || activeVueStyleNodes.length === 0) {
    activeVueStyleNodes = [];
    return;
  }
  activeVueStyleNodes.forEach((node) => {
    if (node && node.remove) node.remove();
  });
  activeVueStyleNodes = [];
}

function applyVueStyles(styles) {
  resetVueStyles();
  if (!Array.isArray(styles) || styles.length === 0) return;
  activeVueStyleNodes = styles
    .map((cssText) => String(cssText || "").trim())
    .filter(Boolean)
    .map((cssText) => {
      const style = document.createElement("style");
      style.dataset.prismVueStyle = "true";
      style.textContent = cssText;
      document.head.appendChild(style);
      return style;
    });
}
function cleanupReactRunner() {
  if (activeReactRoot && typeof activeReactRoot.unmount === "function") {
    try {
      activeReactRoot.unmount();
    } catch (err) {}
  }
  activeReactRoot = null;
  if (activeVueApp && typeof activeVueApp.unmount === "function") {
    try {
      activeVueApp.unmount();
    } catch (err) {}
  }
  activeVueApp = null;
  window.__PRISM_VUE_APP__ = null;
  resetVueStyles();
  if (reactEsmRunner && reactEsmRunner.parentNode) {
    reactEsmRunner.parentNode.removeChild(reactEsmRunner);
  }
  reactEsmRunner = null;
  window.__PRISM_ROOT__ = null;
}


const { renderReact } = createReactRenderer({
  root,
  cleanupReactRunner,
  loadLibraries,
  nextReactRenderToken: () => {
    reactRenderToken += 1;
    return reactRenderToken;
  },
  setActiveReactRoot: (value) => {
    activeReactRoot = value;
  },
  setReactEsmRunner: (value) => {
    reactEsmRunner = value;
  }
});

const { renderVue } = createVueRenderer({
  root,
  applyVueStyles,
  cleanupReactRunner,
  loadLibraries,
  setActiveVueApp: (value) => {
    activeVueApp = value;
  }
});

const { renderHtml } = createHtmlRenderer({
  root,
  cleanupReactRunner,
  getUiState: () => uiState
});
function renderUnsupportedFramework(kind) {
  cleanupReactRunner();
  root.className = "mode-text";
  const label = kind === "angular" ? "Angular" : "Svelte";
  root.innerHTML =
    `<div class="prism-error">${label} source requires a compile/build step. ` +
    `Paste compiled JS output or full runnable HTML instead.</div>`;
}

function resolveHintedKind(language) {
  return language === "html"
    ? "html"
    : (language === "react"
      ? "react"
      : (language === "vue"
        ? "vue"
        : (language === "angular"
          ? "angular"
          : (language === "svelte" ? "svelte" : "text"))));
}

function detectRuntimeKind(code) {
  if (!code || typeof code !== "string") return "text";
  const source = String(code);

  if (/^\s*<!DOCTYPE\s+html/i.test(source) || /<html[\s>]/i.test(source)) {
    return "html";
  }

  const angularIndicators = [
    /from\s+['"]@angular\//,
    /\b@Component\s*\(/,
    /\bNgModule\s*\(/,
    /\bbootstrapApplication\s*\(/,
  ];
  if (angularIndicators.some((r) => r.test(source))) return "angular";

  const svelteIndicators = [
    /from\s+['"]svelte(?:\/|['"])/,
    /<svelte:[a-z-]+/i,
    /{#(if|each|await)\b/,
  ];
  if (svelteIndicators.some((r) => r.test(source))) return "svelte";

  const vueIndicators = [
    /\bv-(if|for|else|model|show|bind|on)\b/,
    /@click\s*=|@submit\s*=/,
    /:\w+\s*=/,
    /<template[\s>]/i,
    /from\s+['"]vue['"]/,
    /createApp\s*\(/,
    /defineComponent\s*\(/,
    /defineProps\s*\(/,
    /defineEmits\s*\(/,
  ];
  if (vueIndicators.some((r) => r.test(source))) return "vue";

  const reactIndicators = [
    /className\s*=/i,
    /htmlFor\s*=/i,
    /dangerouslySetInnerHTML/i,
    /useState\s*\(|useEffect\s*\(|useMemo\s*\(|useCallback\s*\(|useRef\s*\(/,
    /ReactDOM|createRoot\s*\(/,
    /from\s+['"]react['"]/,
    /from\s+['"]react-dom(?:\/client)?['"]/,
    /<\s*>\s*[\s\S]*<\/\s*>/,
    /<\s*[A-Z][A-Za-z0-9_]*(\s|>)/,
  ];
  if (reactIndicators.some((r) => r.test(source))) return "react";

  if (/<[a-z][\s\S]*>/i.test(source)) return "html";
  return "text";
}

function resolveRenderKind(language, code) {
  const hinted = resolveHintedKind(language);
  const inferred = detectRuntimeKind(code);

  if (inferred === "angular" || inferred === "svelte") return inferred;
  if (hinted === "text" && inferred !== "text") return inferred;
  if (hinted === "react" && inferred === "html") return "html";
  if (hinted === "vue" && inferred === "html") return "html";
  return hinted;
}

// --- [4. Capture payload extraction and delivery] ---

function collectCanvasSnapshots(scope) {
  const canvases = Array.from((scope || document).querySelectorAll("canvas"));
  return canvases.map((canvas, index) => {
    let captureId = canvas.getAttribute("data-prism-capture-id");
    if (!captureId) {
      captureId = "prism-canvas-" + index;
      canvas.setAttribute("data-prism-capture-id", captureId);
    }
    const computed = window.getComputedStyle(canvas);
    let dataUrl = "";
    let tainted = false;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch (err) {
      dataUrl = "";
      tainted = true;
    }
    return {
      id: captureId,
      dataUrl,
      tainted,
      width: canvas.width || 0,
      height: canvas.height || 0,
      cssWidth: computed.width || "",
      cssHeight: computed.height || "",
      display: computed.display || ""
    };
  });
}

// Capture either visible viewport or full content, based on UI setting.
function captureSnapshot() {
  const frame = root.querySelector("iframe");

  if (frame?.contentWindow) {
    frame.contentWindow.postMessage({ type: "PRISM_SNAPSHOT" }, "*");
    return;
  }

  try {
    const rootStyle = window.getComputedStyle(root);
    const bodyStyle = window.getComputedStyle(document.body);
    const docStyle = window.getComputedStyle(document.documentElement);
    const keys = [
      "display",
      "flexDirection",
      "flexWrap",
      "alignItems",
      "justifyContent",
      "alignContent",
      "gap",
      "rowGap",
      "columnGap",
      "background",
      "backgroundColor",
      "color",
      "padding",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "margin",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
      "boxSizing",
      "fontFamily",
      "fontSize",
      "lineHeight",
      "letterSpacing"
    ];

    const rootRect = root.getBoundingClientRect();
    const visibleWidth = Math.max(
      1,
      Math.ceil(rootRect.width || root.clientWidth || window.innerWidth || 0)
    );
    const visibleHeight = Math.max(
      1,
      Math.ceil(rootRect.height || root.clientHeight || window.innerHeight || 0)
    );
    const fullWidth = Math.max(
      visibleWidth,
      Math.ceil(root.scrollWidth || 0),
      Math.ceil(root.offsetWidth || 0)
    );
    const fullHeight = Math.max(
      visibleHeight,
      Math.ceil(root.scrollHeight || 0),
      Math.ceil(root.offsetHeight || 0)
    );
    const captureRange = uiState?.settings?.captureRange === "full" ? "full" : "visible";
    const captureWidth = captureRange === "full" ? fullWidth : visibleWidth;
    const captureHeight = captureRange === "full" ? fullHeight : visibleHeight;

    const payload = {
      type: "PRISM_EXPORT_FOR_CAPTURE",
      html: root.innerHTML,
      width: captureWidth,
      height: captureHeight,
      captureRange,
      classes: document.documentElement.className + " " + root.className,
      bodyClass: document.body.className || "",
      bodyStyles: pickStyles(bodyStyle, keys),
      rootStyles: pickStyles(rootStyle, keys),
      background:
        rootStyle.backgroundColor ||
        bodyStyle.backgroundColor ||
        docStyle.backgroundColor ||
        "#ffffff",
      color: rootStyle.color || bodyStyle.color || docStyle.color || "#111111",
      fontFamily: rootStyle.fontFamily || bodyStyle.fontFamily || docStyle.fontFamily || "",
      canvasSnapshots: collectCanvasSnapshots(root)
    };

    window.parent.postMessage(payload, "*");
  } catch (error) {
    console.error("[Prism Sandbox] Capture export failed:", error);
  }
}

// --- [5. Message bridge and bootstrap] ---

window.addEventListener("message", (event) => {
  const data = event.data || {};
  const iframeWindow = root.querySelector("iframe")?.contentWindow;

  // Forward capture payload from iframe srcdoc to parent window.
  if (data.type === "PRISM_EXPORT_FOR_CAPTURE" && event.source === iframeWindow) {
    window.parent.postMessage(data, "*");
    return;
  }

  if (data.type === "PRISM_DEVLOG" && event.source === iframeWindow) {
    window.parent.postMessage(data, "*");
    return;
  }

  if (data.type === "PRISM_PICKER_SELECT" && event.source === iframeWindow) {
    window.parent.postMessage(data, "*");
    return;
  }

  if (data.type === "PRISM_INSTRUCTION_NAVIGATE_MISS" && event.source === iframeWindow) {
    window.parent.postMessage(data, "*");
    return;
  }

  if (
    (data.type === "PRISM_RUNTIME_CAPABILITIES" ||
      data.type === "PRISM_CAPTURE_UNSUPPORTED" ||
      data.type === "PRISM_PICKER_UNSUPPORTED") &&
    event.source === iframeWindow
  ) {
    window.parent.postMessage(data, "*");
    return;
  }

  // Forward "return" requests coming from iframe srcdoc to parent.
  if (data.type === "PRISM_RETURN_REQUEST" && event.source === iframeWindow) {
    window.parent.postMessage({ type: "PRISM_RETURN_REQUEST" }, "*");
    return;
  }

  if (data.type === "PRISM_UI_STATE") {
    const previewLine = Number(data.previewLine);
    const editingLine = Number(data.editingLine);
    uiState = {
      pickerActive: Boolean(data.pickerActive),
      frozen: Boolean(data.frozen),
      instructions: data.instructions || {},
      previewLine:
        Number.isFinite(previewLine) && previewLine > 0
          ? previewLine
          : null,
      editingLine:
        Number.isFinite(editingLine) && editingLine > 0
          ? editingLine
          : null,
      settings: normalizeUiSettings(data.settings)
    };
    if (iframeWindow) {
      iframeWindow.postMessage({ type: "PRISM_UI_STATE", ...uiState }, "*");
    }
    window.parent.postMessage({
      type: "PRISM_DEVLOG",
      stage: "ui-state-forwarded",
      payload: {
        pickerActive: uiState.pickerActive,
        frozen: uiState.frozen,
        hasIframe: Boolean(iframeWindow),
        instructionsCount: Object.keys(uiState.instructions).length,
        previewLine: uiState.previewLine,
        editingLine: uiState.editingLine
      }
    }, "*");
    return;
  }

  if (event.source !== window.parent) return;

  if (data.type === "PRISM_INSTRUCTION_NAVIGATE") {
    if (iframeWindow) {
      iframeWindow.postMessage(data, "*");
    } else {
      window.parent.postMessage(
        {
          type: "PRISM_INSTRUCTION_NAVIGATE_MISS",
          line: Number(data.line) || null,
          reason: "Renderer is not ready yet."
        },
        "*"
      );
    }
    return;
  }

  if (data.type === "RENDER") {
    const kind = resolveRenderKind(data.language, data.code);
    if (kind === "react") renderReact(data.code, data.theme);
    else if (kind === "vue") renderVue(data.code, data.theme);
    else if (kind === "angular" || kind === "svelte") renderUnsupportedFramework(kind);
    else if (kind === "html") renderHtml(data.code, data.theme);
    else {
      cleanupReactRunner();
      root.className = "mode-text";
      root.innerHTML = `<pre>${escapeHtml(data.code)}</pre>`;
    }
  }

  if (data.type === "PRISM_SNAPSHOT") {
    captureSnapshot();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.altKey && event.key === "ArrowLeft") {
    window.parent.postMessage({ type: "PRISM_RETURN_REQUEST" }, "*");
  }
});

function sendDebugLog(stage, payload) {
  window.parent.postMessage(
    {
      type: "PRISM_DEVLOG",
      stage,
      payload
    },
    "*"
  );
}

window.addEventListener("pointerdown", (event) => {
  sendDebugLog("pointerdown", {
    button: event.button,
    buttons: event.buttons,
    pointerType: event.pointerType
  });
});

window.addEventListener("mouseup", (event) => {
  sendDebugLog("mouseup", {
    button: event.button,
    buttons: event.buttons
  });
});

