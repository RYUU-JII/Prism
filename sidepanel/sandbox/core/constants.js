export const DEFAULT_UI_SETTINGS = Object.freeze({
  lockInteractionsWhenPaused: true,
  keepPickerActiveAfterSelect: true,
  captureRange: "visible",
  memoResetPolicy: "on_code_change",
  pickerHighlight: {
    strength: "medium",
    color: "#14b8a6"
  }
});

export function normalizeUiSettings(settings) {
  const safe = settings || {};
  const pickerHighlightRaw =
    safe.pickerHighlight && typeof safe.pickerHighlight === "object"
      ? safe.pickerHighlight
      : {};
  return {
    lockInteractionsWhenPaused:
      typeof safe.lockInteractionsWhenPaused === "boolean"
        ? safe.lockInteractionsWhenPaused
        : DEFAULT_UI_SETTINGS.lockInteractionsWhenPaused,
    keepPickerActiveAfterSelect:
      typeof safe.keepPickerActiveAfterSelect === "boolean"
        ? safe.keepPickerActiveAfterSelect
        : DEFAULT_UI_SETTINGS.keepPickerActiveAfterSelect,
    captureRange:
      safe.captureRange === "full" || safe.captureRange === "visible"
        ? safe.captureRange
        : DEFAULT_UI_SETTINGS.captureRange,
    memoResetPolicy:
      safe.memoResetPolicy === "on_code_change" ||
      safe.memoResetPolicy === "on_copy" ||
      safe.memoResetPolicy === "manual"
        ? safe.memoResetPolicy
        : DEFAULT_UI_SETTINGS.memoResetPolicy,
    pickerHighlight: {
      strength:
        pickerHighlightRaw.strength === "subtle" ||
        pickerHighlightRaw.strength === "medium" ||
        pickerHighlightRaw.strength === "strong"
          ? pickerHighlightRaw.strength
          : DEFAULT_UI_SETTINGS.pickerHighlight.strength,
      color:
        typeof pickerHighlightRaw.color === "string" && pickerHighlightRaw.color.trim()
          ? pickerHighlightRaw.color
          : DEFAULT_UI_SETTINGS.pickerHighlight.color
    }
  };
}

export const BABEL_CACHE_MAX = 12;
export const MAX_BABEL_CHARS = 120000;

export const sources = Object.freeze({
  babel: "vendor/babel.min.js",
  dayjs: "vendor/dayjs.min.js",
  react: "vendor/react.production.min.js",
  reactDom: "vendor/react-dom.production.min.js",
  vue: "vendor/vue.global.prod.js",
  framerMotion: "vendor/framer-motion.js",
  html2canvas: "vendor/html2canvas.min.js"
});

export const PRISM_DEFAULT_IMPORTS = Object.freeze({
  dayjs: "./vendor/dayjs-shim.mjs",
  react: "./vendor/react-shim.mjs",
  "react-dom": "./vendor/react-dom-shim.mjs",
  "react-dom/client": "./vendor/react-dom-client-shim.mjs",
  three: "./vendor/three.module.js",
  "three/addons/": "./vendor/three-addons/",
  "three/examples/jsm/": "./vendor/three-addons/",
  "react/jsx-runtime": "./vendor/react-jsx-runtime-shim.mjs",
  "react/jsx-dev-runtime": "./vendor/react-jsx-dev-runtime-shim.mjs",
  vue: "./vendor/vue-shim.mjs"
});
