import { PRISM_DEFAULT_IMPORTS } from "../../core/constants.js";
import {
  buildAutoImportMap,
  buildHtmlSrcdoc,
  rewriteKnownCdnScriptUrls,
  stringifyImportMap
} from "../../core/helpers.js";
import { buildHtmlBridgeAssets } from "./htmlBridgeAssets.js";

export function createHtmlRenderer(context) {
  const {
    root,
    cleanupReactRunner,
    getUiState
  } = context;

async function renderHtml(code, theme) {
  cleanupReactRunner();
  root.innerHTML = "";
  root.className = "mode-html";

  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-modals");
  frame.style.width = "100%";
  frame.style.height = "100%";
  frame.style.border = "0";

  // Capture with the currently visible iframe viewport width.
  const { snapshotBridge, viewportPolicyStyle } = buildHtmlBridgeAssets();

  const rewrittenCode = rewriteKnownCdnScriptUrls(code || "");
  const hasFullDocument =
    /^\s*<!DOCTYPE\s+html/i.test(rewrittenCode) || /<html[\s>]/i.test(rewrittenCode);
  const autoImportMap = buildAutoImportMap(rewrittenCode);
  const importMapPayload = {
    imports: {
      ...PRISM_DEFAULT_IMPORTS,
      ...autoImportMap
    }
  };
  const iframeImportMap = `
        <script type="importmap">${stringifyImportMap(importMapPayload)}</` + "script>";
  const headExtras = `
        ${iframeImportMap}
        <script src="vendor/react.production.min.js"></` + "script>" + `
        <script src="vendor/react-dom.production.min.js"></` + "script>" + `
        <script src="vendor/vue.global.prod.js"></` + "script>" + `
        <script src="vendor/dayjs.min.js"></` + "script>" + `
        ${hasFullDocument ? "" : '<link rel="stylesheet" href="tailwind.css" data-prism-tailwind="1" />'}
        ${viewportPolicyStyle}
  `;
  frame.srcdoc = buildHtmlSrcdoc(rewrittenCode, theme, headExtras, snapshotBridge);
  root.appendChild(frame);
  frame.addEventListener("load", () => {
    if (frame.contentWindow) {
      const currentUiState = getUiState();
      frame.contentWindow.postMessage({ type: "PRISM_UI_STATE", ...currentUiState }, "*");
    }
  });
}


  return {
    renderHtml
  };
}


