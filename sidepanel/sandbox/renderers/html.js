import { PRISM_DEFAULT_IMPORTS } from "../constants.js";
import {
  buildAutoImportMap,
  buildHtmlSrcdoc,
  rewriteKnownCdnScriptUrls,
  stringifyImportMap
} from "../helpers.js";

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
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.style.width = "100%";
  frame.style.height = "100%";
  frame.style.border = "0";

  // Capture with the currently visible iframe viewport width.
  const snapshotBridge = `<script>
      (function() {
        if (window.__PRISM_BABEL_WARN_FILTER__) return;
        window.__PRISM_BABEL_WARN_FILTER__ = true;
        const originalWarn = console.warn ? console.warn.bind(console) : null;
        if (!originalWarn) return;
        console.warn = function(...args) {
          try {
            const first = args && args[0];
            if (
              typeof first === "string" &&
              first.includes("You are using the in-browser Babel transformer")
            ) {
              return;
            }
          } catch (_) {}
          return originalWarn(...args);
        };
      })();

      window.addEventListener("message", function(event) {
        if (event.source !== parent || !event.data || event.data.type !== "PRISM_SNAPSHOT") return;
        const caps = evaluateRuntimeCapabilities();
        if (caps.snapshot === false) {
          try {
            parent.postMessage({
              type: "PRISM_CAPTURE_UNSUPPORTED",
              reason: caps.reasons && caps.reasons.snapshot ? caps.reasons.snapshot : ""
            }, "*");
          } catch (err) {}
          queueRuntimeCapabilities();
          return;
        }
        try {
          const bodyStyle = window.getComputedStyle(document.body);
          const htmlStyle = window.getComputedStyle(document.documentElement);
          const keys = [
            "display","flexDirection","flexWrap","alignItems","justifyContent","alignContent",
            "gap","rowGap","columnGap","background","backgroundColor","color","padding","margin",
            "boxSizing","fontFamily","fontSize","lineHeight","letterSpacing"
          ];
          const pick = (style) => {
            const out = {};
            keys.forEach((k) => { if (style[k]) out[k] = style[k]; });
            return out;
          };

          const canvasSnapshots = Array.from(document.querySelectorAll("canvas")).map((canvas, index) => {
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

          const inlineStyles = Array.from(document.querySelectorAll("style"))
            .map((node) => (node && typeof node.textContent === "string" ? node.textContent : ""))
            .map((css) => css.trim())
            .filter(Boolean);

          const viewportWidth = Math.max(
            1,
            Math.ceil(
              document.documentElement.clientWidth ||
              window.innerWidth ||
              document.body.clientWidth ||
              0
            )
          );

          parent.postMessage({
            type: "PRISM_EXPORT_FOR_CAPTURE",
            html: document.body.innerHTML,
            width: viewportWidth,
            height: Math.max(document.body.scrollHeight, document.body.offsetHeight, 1),
            classes: document.documentElement.className + " " + document.body.className,
            bodyClass: document.body.className || "",
            bodyStyles: pick(bodyStyle),
            rootStyles: pick(bodyStyle),
            background: bodyStyle.backgroundColor || htmlStyle.backgroundColor || "#ffffff",
            color: bodyStyle.color || htmlStyle.color || "#111111",
            fontFamily: bodyStyle.fontFamily || htmlStyle.fontFamily || "",
            canvasSnapshots,
            inlineStyles,
            prismTailwindInjected: Boolean(
              document.querySelector('link[data-prism-tailwind="1"]')
            )
          }, "*");
        } catch (e) { console.error(e); }
      });

      // The host sandbox cannot always catch keydown once focus moves into iframe.
      // Listen inside the iframe and forward the request to parent.
      window.addEventListener("keydown", function(event) {
        if (event.altKey && event.key === "ArrowLeft") {
          try {
            event.preventDefault();
            event.stopPropagation();
          } catch (e) {}
          parent.postMessage({ type: "PRISM_RETURN_REQUEST" }, "*");
        }
      });

      let prismPickerActive = false;
      let prismPickerOverlay = null;
      let prismPickerTarget = null;
      const prismPickerTargetKindCache = new WeakMap();
      const PRISM_PICKER_FILL = "rgba(79, 210, 195, 0.12)";
      let prismMotionStyle = null;
      let prismPickerPointerStyle = null;
      let prismInteractionLockStyle = null;
      let prismInstructions = {};
      let prismFrozen = false;
      let prismSettings = {
        lockInteractionsWhenPaused: true,
        keepPickerActiveAfterSelect: true,
        highlightStrength: "medium",
        highlightColor: "#14b8a6"
      };

      let prismInstructionStyle = null;
      const nativeRequestAnimationFrame = window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : null;
      const nativeCancelAnimationFrame = window.cancelAnimationFrame
        ? window.cancelAnimationFrame.bind(window)
        : null;
      let prismRafSequence = 1;
      const prismRafEntries = new Map();
      const prismPausedRafIds = new Set();
      let prismCapabilitiesCacheKey = "";
      let prismCapabilityTimer = null;

      function schedulePrismRaf(entry) {
        if (!nativeRequestAnimationFrame) return;
        entry.nativeId = nativeRequestAnimationFrame(function(time) {
          if (!prismRafEntries.has(entry.id) || entry.cancelled) return;
          entry.nativeId = null;
          if (prismFrozen) {
            prismPausedRafIds.add(entry.id);
            return;
          }
          prismRafEntries.delete(entry.id);
          try {
            entry.callback(time);
          } catch (err) {
            setTimeout(function() {
              throw err;
            }, 0);
          }
        });
      }

      function flushPausedRaf() {
        if (!nativeRequestAnimationFrame) return;
        const pausedIds = Array.from(prismPausedRafIds);
        prismPausedRafIds.clear();
        pausedIds.forEach(function(id) {
          const entry = prismRafEntries.get(id);
          if (!entry || entry.cancelled) return;
          schedulePrismRaf(entry);
        });
      }

      if (nativeRequestAnimationFrame && nativeCancelAnimationFrame) {
        window.requestAnimationFrame = function(callback) {
          if (typeof callback !== "function") {
            return nativeRequestAnimationFrame(callback);
          }
          const id = prismRafSequence++;
          const entry = {
            id,
            callback,
            cancelled: false,
            nativeId: null
          };
          prismRafEntries.set(id, entry);
          if (prismFrozen) {
            prismPausedRafIds.add(id);
          } else {
            schedulePrismRaf(entry);
          }
          return id;
        };

        window.cancelAnimationFrame = function(id) {
          const entry = prismRafEntries.get(id);
          if (!entry) {
            nativeCancelAnimationFrame(id);
            return;
          }
          entry.cancelled = true;
          if (entry.nativeId !== null) {
            nativeCancelAnimationFrame(entry.nativeId);
          }
          prismPausedRafIds.delete(id);
          prismRafEntries.delete(id);
        };
      }

      function scriptMentionsThree(text) {
        if (!text) return false;
        const lowered = String(text).toLowerCase();
        return (
          lowered.includes("from 'three") ||
          lowered.includes('from "three') ||
          lowered.includes("from 'three/addons/") ||
          lowered.includes('from "three/addons/') ||
          lowered.includes("from 'three/examples/jsm/") ||
          lowered.includes('from "three/examples/jsm/') ||
          lowered.includes("window.three") ||
          lowered.includes("new three.")
        );
      }

      function detectThreeLikeRuntime() {
        const scripts = Array.from(document.querySelectorAll("script"));
        const hasThreeScript = scripts.some(function(script) {
          if (!script) return false;
          const src = String(script.getAttribute("src") || "").toLowerCase();
          if (src.includes("three")) return true;
          const type = String(script.getAttribute("type") || "").toLowerCase();
          if (type && type !== "module" && type !== "text/javascript") return false;
          const text = String(script.textContent || "");
          return scriptMentionsThree(text) || text.includes("THREE");
        });
        return hasThreeScript || typeof window.THREE === "object";
      }

      function evaluateRuntimeCapabilities() {
        const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
        const canvases = Array.from(document.querySelectorAll("canvas"));
        const hasDominantCanvas = canvases.some(function(canvas) {
          if (!canvas || !canvas.getBoundingClientRect) return;
          const rect = canvas.getBoundingClientRect();
          const area = Math.max(0, rect.width) * Math.max(0, rect.height);
          if (area <= 0) return false;
          const ratio = area / viewportArea;
          return ratio >= 0.7;
        });
        const likelyThreeScene = hasDominantCanvas && detectThreeLikeRuntime();

        const reasons = {};
        if (likelyThreeScene) {
          reasons.picker = "WebGL scene: picker can only target the canvas element.";
        }
        if (likelyThreeScene) {
          reasons.snapshot = "WebGL scene snapshot can be unreliable in this mode.";
        }
        if (!nativeRequestAnimationFrame) {
          reasons.freeze = "requestAnimationFrame is unavailable in this context.";
        }

        return {
          picker: !likelyThreeScene,
          snapshot: !likelyThreeScene,
          freeze: Boolean(nativeRequestAnimationFrame),
          reasons
        };
      }

      function postRuntimeCapabilities(force) {
        const caps = evaluateRuntimeCapabilities();
        const key = JSON.stringify(caps);
        if (!force && key === prismCapabilitiesCacheKey) return;
        prismCapabilitiesCacheKey = key;
        try {
          parent.postMessage({
            type: "PRISM_RUNTIME_CAPABILITIES",
            capabilities: caps
          }, "*");
        } catch (err) {}
      }

      function queueRuntimeCapabilities() {
        if (prismCapabilityTimer) return;
        prismCapabilityTimer = setTimeout(function() {
          prismCapabilityTimer = null;
          postRuntimeCapabilities(false);
        }, 80);
      }

      function normalizeSettings(settings) {
        const safe = settings || {};
        const pickerHighlight =
          safe.pickerHighlight && typeof safe.pickerHighlight === "object"
            ? safe.pickerHighlight
            : {};
        const highlightStrength =
          ["subtle", "medium", "strong"].includes(pickerHighlight.strength)
            ? pickerHighlight.strength
            : ["subtle", "medium", "strong"].includes(safe.highlightStrength)
              ? safe.highlightStrength
            : "medium";
        const highlightColor =
          typeof pickerHighlight.color === "string" && pickerHighlight.color.trim()
            ? pickerHighlight.color
            : typeof safe.highlightColor === "string" && safe.highlightColor.trim()
              ? safe.highlightColor
            : "#14b8a6";
        return {
          lockInteractionsWhenPaused:
            typeof safe.lockInteractionsWhenPaused === "boolean"
              ? safe.lockInteractionsWhenPaused
              : true,
          keepPickerActiveAfterSelect:
            typeof safe.keepPickerActiveAfterSelect === "boolean"
              ? safe.keepPickerActiveAfterSelect
              : true,
          highlightStrength,
          highlightColor
        };
      }

      function parseHexColor(hex) {
        if (!hex) return null;
        const raw = String(hex).replace("#", "").trim();
        if (raw.length === 3) {
          const r = parseInt(raw[0] + raw[0], 16);
          const g = parseInt(raw[1] + raw[1], 16);
          const b = parseInt(raw[2] + raw[2], 16);
          if ([r, g, b].some((val) => Number.isNaN(val))) return null;
          return { r, g, b };
        }
        if (raw.length === 6) {
          const r = parseInt(raw.slice(0, 2), 16);
          const g = parseInt(raw.slice(2, 4), 16);
          const b = parseInt(raw.slice(4, 6), 16);
          if ([r, g, b].some((val) => Number.isNaN(val))) return null;
          return { r, g, b };
        }
        return null;
      }

      function hexToRgba(hex, alpha) {
        const fallback = { r: 20, g: 184, b: 166 };
        const rgb = parseHexColor(hex) || fallback;
        return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + alpha + ")";
      }

      function applyVisualSettings() {
        const strengthMap = {
          subtle: {
            outlineWidth: 1,
            alpha: 0.35,
            badgeAlpha: 0.7
          },
          medium: {
            outlineWidth: 2,
            alpha: 0.55,
            badgeAlpha: 0.85
          },
          strong: {
            outlineWidth: 3,
            alpha: 0.8,
            badgeAlpha: 1
          }
        };
        const strength = strengthMap[prismSettings.highlightStrength] || strengthMap.medium;
        const outlineWidth = strength.outlineWidth;
        const offset = Math.max(1, outlineWidth);
        const rootStyle = document.documentElement.style;
        rootStyle.setProperty("--prism-marker-outline-style", "solid");
        rootStyle.setProperty("--prism-marker-outline-width", String(outlineWidth) + "px");
        rootStyle.setProperty("--prism-marker-outline-offset", String(offset) + "px");
        rootStyle.setProperty(
          "--prism-marker-color-rgba",
          hexToRgba(prismSettings.highlightColor, strength.alpha)
        );
        rootStyle.setProperty(
          "--prism-marker-badge-bg",
          hexToRgba(prismSettings.highlightColor, strength.badgeAlpha)
        );
      }

      function ensureInstructionStyles() {
        if (prismInstructionStyle) return;
        const style = document.createElement("style");
        style.id = "prism-instruction-markers";
        style.textContent = [
          ".prism-has-instruction {",
          "  outline: var(--prism-marker-outline-width) var(--prism-marker-outline-style) var(--prism-marker-color-rgba) !important;",
          "  outline-offset: var(--prism-marker-outline-offset) !important;",
          "  cursor: pointer !important;",
          "}",
          ".prism-has-instruction::after {",
          "  content: '\u2726';",
          "  position: absolute;",
          "  top: -6px;",
          "  right: -6px;",
          "  background: var(--prism-marker-badge-bg);",
          "  color: white;",
          "  font-size: 7px;",
          "  width: 12px;",
          "  height: 12px;",
          "  display: flex;",
          "  align-items: center;",
          "  justify-content: center;",
          "  border-radius: 50%;",
          "  box-shadow: 0 2px 4px rgba(0,0,0,0.2);",
          "  z-index: 1000;",
          "  pointer-events: none;",
          "}",
          ".prism-has-instruction.prism-has-instruction--background::after {",
          "  content: none;",
          "}",
          ".prism-has-instruction.prism-has-instruction--background {",
          "  outline: none !important;",
          "  outline-offset: 0 !important;",
          "  box-shadow: inset 0 0 0 var(--prism-marker-outline-width) var(--prism-marker-color-rgba) !important;",
          "}"
        ].join("\\n");
        document.head.appendChild(style);
        prismInstructionStyle = style;
      }

      function removeInstructionStyles() {
        if (!prismInstructionStyle) return;
        prismInstructionStyle.remove();
        prismInstructionStyle = null;
      }

      function applyMarkers() {
        // Remove old markers and reset inline positions
        document.querySelectorAll(".prism-has-instruction").forEach(el => {
          el.classList.remove("prism-has-instruction");
          el.classList.remove("prism-has-instruction--background");
          if (el.dataset.prismDidSetPosition) {
            el.style.position = "";
            delete el.dataset.prismDidSetPosition;
          }
        });

        const keys = Object.keys(prismInstructions);
        if (keys.length === 0) {
          removeInstructionStyles();
          return;
        }

        ensureInstructionStyles();

        keys.forEach(line => {
          const el = document.querySelector('[data-prism-line="' + line + '"]');
          if (el) {
            el.classList.add("prism-has-instruction");
            const isBackgroundTarget = isBackgroundLikeTarget(el);
            if (isBackgroundTarget) {
              el.classList.add("prism-has-instruction--background");
            }
            const style = window.getComputedStyle(el);
            // Do not change positioning for background/root targets.
            // For large containers this can re-anchor absolute children.
            if (
              style.position === "static" &&
              !isBackgroundTarget &&
              el !== document.body &&
              el !== document.documentElement
            ) {
              el.style.position = "relative";
              el.dataset.prismDidSetPosition = "true";
            }
          }
        });
      }

      function setMotionFreeze(active) {
        if (active) {
          if (prismMotionStyle) return;
          const style = document.createElement("style");
          style.id = "prism-picker-freeze";
          style.textContent = [
            "html, body { scroll-behavior: auto !important; }",
            "*, *::before, *::after {",
            "  animation-play-state: paused !important;",
            "  transition: none !important;",
            "}"
          ].join("\\n");
          document.head.appendChild(style);
          prismMotionStyle = style;
          return;
        }
        if (prismMotionStyle) {
          prismMotionStyle.remove();
          prismMotionStyle = null;
        }
      }

      function setFrozen(frozen) {
        prismFrozen = Boolean(frozen);
        setMotionFreeze(prismFrozen);
        if (!prismFrozen) {
          flushPausedRaf();
        }
        applyMarkers();
        updateInteractionLock();
        queueRuntimeCapabilities();
      }

      function ensurePickerOverlay() {
        if (prismPickerOverlay) return prismPickerOverlay;
        const overlay = document.createElement("div");
        overlay.dataset.prismPickerOverlay = "true";
        overlay.style.position = "fixed";
        overlay.style.zIndex = "2147483647";
        overlay.style.pointerEvents = "none";
        overlay.style.boxSizing = "border-box";
        overlay.style.border = "2px solid rgba(79, 210, 195, 0.9)";
        overlay.style.background = "transparent";
        overlay.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.2)";
        overlay.style.borderRadius = "6px";
        document.documentElement.appendChild(overlay);
        prismPickerOverlay = overlay;
        return overlay;
      }

      function isBackgroundLikeTarget(target) {
        if (!target) return true;
        if (target === document.documentElement || target === document.body) return true;
        if (prismPickerTargetKindCache.has(target)) {
          return prismPickerTargetKindCache.get(target);
        }

        const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
        if (!rect || (!rect.width && !rect.height)) {
          prismPickerTargetKindCache.set(target, true);
          return true;
        }

        // Keep this aligned with FloatingInput's "Background" classification:
        // target rect covers at least 90% of the viewport in both axes.
        const viewportW = Math.max(window.innerWidth, 1);
        const viewportH = Math.max(window.innerHeight, 1);
        const result =
          rect.width > viewportW * 0.9 &&
          rect.height > viewportH * 0.9;
        prismPickerTargetKindCache.set(target, result);
        return result;
      }

      function getTargetLine(target) {
        if (!target || !target.getAttribute) return null;
        const line = Number(target.getAttribute("data-prism-line"));
        return Number.isFinite(line) && line > 0 ? line : null;
      }

      function hasInstructionForTarget(target) {
        const line = getTargetLine(target);
        if (!line) return false;
        return Object.prototype.hasOwnProperty.call(prismInstructions, String(line));
      }

      function resolveOverlayBorderRadius(target) {
        if (!target || !window.getComputedStyle) return "6px";
        const radius = window.getComputedStyle(target).borderRadius;
        if (!radius || radius === "0px") return "6px";
        return radius;
      }

      function updatePickerOverlay(target) {
        if (!target || !target.getBoundingClientRect) return;
        const rect = target.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        const isBackgroundTarget = isBackgroundLikeTarget(target);
        // Background targets should not flicker highlight during hover
        // unless they already have a saved memo.
        if (isBackgroundTarget && !hasInstructionForTarget(target)) {
          clearPickerOverlay();
          return;
        }
        const overlay = ensurePickerOverlay();
        const inset = isBackgroundTarget ? 1 : 0;
        const width = Math.max(0, rect.width - inset * 2);
        const height = Math.max(0, rect.height - inset * 2);
        overlay.style.left = rect.left + inset + "px";
        overlay.style.top = rect.top + inset + "px";
        overlay.style.width = width + "px";
        overlay.style.height = height + "px";
        overlay.style.borderRadius = resolveOverlayBorderRadius(target);
        overlay.style.background = isBackgroundTarget
          ? "transparent"
          : PRISM_PICKER_FILL;
      }

      function clearPickerOverlay() {
        if (!prismPickerOverlay) return;
        prismPickerOverlay.remove();
        prismPickerOverlay = null;
        prismPickerTarget = null;
      }

      function ensurePickerPointerStyles() {
        if (prismPickerPointerStyle) return;
        const style = document.createElement("style");
        style.id = "prism-picker-pointer-style";
        style.textContent = [
          "[data-prism-line], [data-prism-line] * {",
          "  pointer-events: auto !important;",
          "}",
          "[data-prism-picker-overlay='true'] {",
          "  pointer-events: none !important;",
          "}"
        ].join("\\n");
        document.head.appendChild(style);
        prismPickerPointerStyle = style;
      }

      function removePickerPointerStyles() {
        if (!prismPickerPointerStyle) return;
        prismPickerPointerStyle.remove();
        prismPickerPointerStyle = null;
      }

      function ensureInteractionLockStyles() {
        if (prismInteractionLockStyle) return;
        const style = document.createElement("style");
        style.id = "prism-interaction-lock-style";
        style.textContent = [
          "body.prism-interaction-locked *, body.prism-interaction-locked *::before, body.prism-interaction-locked *::after {",
          "  pointer-events: none !important;",
          "  user-select: none !important;",
          "  -webkit-user-select: none !important;",
          "}",
          "body.prism-interaction-locked .prism-has-instruction,",
          "body.prism-interaction-locked .prism-has-instruction * {",
          "  pointer-events: auto !important;",
          "  cursor: pointer !important;",
          "}"
        ].join("\\n");
        document.head.appendChild(style);
        prismInteractionLockStyle = style;
      }

      function removeInteractionLockStyles() {
        if (!prismInteractionLockStyle) return;
        prismInteractionLockStyle.remove();
        prismInteractionLockStyle = null;
      }

      function updateInteractionLock() {
        const shouldLock =
          prismSettings.lockInteractionsWhenPaused &&
          prismFrozen &&
          !prismPickerActive;
        if (shouldLock) {
          ensureInteractionLockStyles();
          document.body.classList.add("prism-interaction-locked");
          if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) {
            document.activeElement.blur();
          }
          return;
        }
        document.body.classList.remove("prism-interaction-locked");
        removeInteractionLockStyles();
      }

      function setPickerActive(active) {
        if (active) {
          const caps = evaluateRuntimeCapabilities();
          if (caps.picker === false) {
            prismPickerActive = false;
            removePickerPointerStyles();
            clearPickerOverlay();
            try {
              parent.postMessage({
                type: "PRISM_PICKER_UNSUPPORTED",
                reason: caps.reasons && caps.reasons.picker ? caps.reasons.picker : ""
              }, "*");
            } catch (err) {}
            queueRuntimeCapabilities();
            return;
          }
        }

        prismPickerActive = Boolean(active);
        document.body.style.cursor = prismPickerActive ? "crosshair" : "";
        if (prismPickerActive) {
          ensurePickerPointerStyles();
        } else {
          removePickerPointerStyles();
          clearPickerOverlay();
        }
        updateInteractionLock();
        queueRuntimeCapabilities();
      }

      function applyUiState(nextState) {
        const safeState = nextState || {};
        prismSettings = normalizeSettings(safeState.settings);
        applyVisualSettings();
        prismInstructions = safeState.instructions || {};
        setPickerActive(Boolean(safeState.pickerActive));
        setFrozen(Boolean(safeState.frozen));
        queueRuntimeCapabilities();
      }

      function findTargetAt(x, y) {
        const elements = document.elementsFromPoint(x, y);
        if (!elements || elements.length === 0) return null;

        // 1) Prefer the most specific element carrying data-prism-line.
        for (const el of elements) {
          if (el === prismPickerOverlay) continue;
          if (el.hasAttribute("data-prism-line")) return el;
          
          // Or find the nearest ancestor carrying data-prism-line.
          const parentWithLine = el.closest("[data-prism-line]");
          if (parentWithLine) return parentWithLine;
        }

        // 2) Fallback to the first valid visible element under the cursor.
        for (const el of elements) {
          if (el === prismPickerOverlay) continue;
          if (el === document.documentElement || el === document.body) continue;
          return el;
        }
        
        return elements[0] === prismPickerOverlay ? elements[1] : elements[0];
      }

      document.addEventListener("mousemove", function(event) {
        if (!prismPickerActive) return;
        event.stopPropagation();
        event.stopImmediatePropagation();
        const target = findTargetAt(event.clientX, event.clientY);
        if (!target) {
          clearPickerOverlay();
          return;
        }
        prismPickerTarget = target;
        updatePickerOverlay(target);
      }, true);

      [
        "pointerdown",
        "pointerup",
        "mousedown",
        "mouseup",
        "dblclick",
        "contextmenu",
        "dragstart",
        "touchstart",
        "touchend"
      ].forEach(function(type) {
        document.addEventListener(type, function(event) {
          if (!prismPickerActive) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }, true);
      });

      document.addEventListener("click", function(event) {
        if (!prismPickerActive) {
          // Existing memo click behavior.
          const memoEl = event.target.closest && event.target.closest(".prism-has-instruction");
          if (memoEl) {
            const line = Number(memoEl.getAttribute("data-prism-line")) || 1;
            const rect = memoEl.getBoundingClientRect();
            parent.postMessage({
              type: "PRISM_PICKER_SELECT",
              line,
              rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
            }, "*");
          }
          return;
        }
        
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const target = findTargetAt(event.clientX, event.clientY);
        if (!target) return;
        
        const line = Number(target.getAttribute("data-prism-line")) || 1;
        const rect = target.getBoundingClientRect();
        parent.postMessage({
          type: "PRISM_PICKER_SELECT",
          line,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        }, "*");
      }, true);

      document.addEventListener("scroll", function() {
        if (!prismPickerActive || !prismPickerTarget) return;
        updatePickerOverlay(prismPickerTarget);
      }, true);

      document.addEventListener("keydown", function(event) {
        if (
          !prismSettings.lockInteractionsWhenPaused ||
          !prismFrozen ||
          prismPickerActive
        ) return;
        if (event.altKey && event.key === "ArrowLeft") return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }, true);

      window.addEventListener("message", function(event) {
        if (!event.data) return;
        
        if (event.data.type === "PRISM_UI_STATE") {
          applyUiState(event.data);
        }
      });

      const capabilityObserver = new MutationObserver(function() {
        queueRuntimeCapabilities();
      });

      capabilityObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "width", "height"]
      });

      window.addEventListener("resize", queueRuntimeCapabilities);
      window.addEventListener("load", queueRuntimeCapabilities);
      queueRuntimeCapabilities();

      try {
        parent.postMessage({
          type: "PRISM_DEVLOG",
          stage: "picker-bridge-loaded",
          payload: { ok: true }
        }, "*");
      } catch (e) {}
    </` + "script>";

  const viewportPolicyStyle = `<style id="prism-viewport-policy">
      html, body {
        max-width: 100%;
        overflow-x: hidden !important;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      html::-webkit-scrollbar,
      body::-webkit-scrollbar {
        width: 0;
        height: 0;
      }
      canvas, img, video, svg {
        max-width: 100%;
      }
    </` + "style>";

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
