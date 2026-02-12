export function buildHtmlBridgeAssets() {
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

          const captureBlockedStyleIds = new Set([
            "prism-instruction-markers",
            "prism-picker-pointer-style",
            "prism-interaction-lock-style",
            "prism-picker-freeze"
          ]);
          const inlineStyles = Array.from(document.querySelectorAll("style"))
            .filter((node) => !captureBlockedStyleIds.has((node && node.id) || ""))
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
          const viewportHeight = Math.max(
            1,
            Math.ceil(
              document.documentElement.clientHeight ||
              window.innerHeight ||
              document.body.clientHeight ||
              0
            )
          );
          const contentHeight = Math.max(
            document.documentElement.scrollHeight || 0,
            document.documentElement.offsetHeight || 0,
            document.body.scrollHeight || 0,
            document.body.offsetHeight || 0,
            viewportHeight
          );
          const contentWidth = Math.max(
            document.documentElement.scrollWidth || 0,
            document.documentElement.offsetWidth || 0,
            document.body.scrollWidth || 0,
            document.body.offsetWidth || 0,
            viewportWidth
          );
          const captureRange = prismSettings.captureRange === "full" ? "full" : "visible";
          const captureWidth = captureRange === "full" ? contentWidth : viewportWidth;
          const captureHeight = captureRange === "full" ? contentHeight : viewportHeight;

          parent.postMessage({
            type: "PRISM_EXPORT_FOR_CAPTURE",
            html: document.body.innerHTML,
            width: Math.max(captureWidth, 1),
            height: Math.max(captureHeight, 1),
            captureRange,
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
      let prismPickerHoverTarget = null;
      let prismPickerFocusedInstruction = null;
      let prismPreviewFocusedInstruction = null;
      let prismEditingFocusedInstruction = null;
      let prismPreviewLine = null;
      let prismEditingLine = null;
      let prismPointerClientX = null;
      let prismPointerClientY = null;
      let prismPointerInside = false;
      let prismPickerTrackingRaf = null;
      const prismPickerTargetKindCache = new WeakMap();
      const PRISM_PICKER_FILL = "rgba(79, 210, 195, 0.12)";
      const PRISM_BADGE_ICON_URL = 'url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2012%2012%22%3E%3Cpath%20fill=%22%23fff%22%20d=%22M6%200.9%207.2%204.8%2011.1%206%207.2%207.2%206%2011.1%204.8%207.2%200.9%206%204.8%204.8Z%22/%3E%3C/svg%3E")';
      let prismMotionStyle = null;
      let prismPickerPointerStyle = null;
      let prismPickerHoverStyle = null;
      let prismInteractionLockStyle = null;
      let prismInstructions = {};
      let prismFrozen = false;
      let prismViewMode = false;
      let prismSettings = {
        lockInteractionsWhenPaused: true,
        keepPickerActiveAfterSelect: true,
        captureRange: "visible",
        highlightStrength: "medium",
        highlightColor: "#14b8a6"
      };

      let prismInstructionStyle = null;
      const prismSvgInstructionProxies = new Map();
      let prismSvgInstructionProxyRaf = null;
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
        const captureRange =
          safe.captureRange === "full" || safe.captureRange === "visible"
            ? safe.captureRange
            : "visible";
        return {
          lockInteractionsWhenPaused:
            typeof safe.lockInteractionsWhenPaused === "boolean"
              ? safe.lockInteractionsWhenPaused
              : true,
          keepPickerActiveAfterSelect:
            typeof safe.keepPickerActiveAfterSelect === "boolean"
              ? safe.keepPickerActiveAfterSelect
              : true,
          captureRange,
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
        rootStyle.setProperty(
          "--prism-marker-badge-icon",
          PRISM_BADGE_ICON_URL
        );
        rootStyle.setProperty(
          "--prism-marker-focus-ring-1",
          hexToRgba(prismSettings.highlightColor, strength.alpha * 0.58)
        );
        rootStyle.setProperty(
          "--prism-marker-focus-ring-2",
          hexToRgba(prismSettings.highlightColor, strength.alpha * 0.42)
        );
        rootStyle.setProperty(
          "--prism-marker-focus-ring-3",
          hexToRgba(prismSettings.highlightColor, strength.alpha * 0.3)
        );
        rootStyle.setProperty(
          "--prism-marker-focus-ring-4",
          hexToRgba(prismSettings.highlightColor, strength.alpha * 0.2)
        );
        rootStyle.setProperty(
          "--prism-marker-focus-ring-5",
          hexToRgba(prismSettings.highlightColor, strength.alpha * 0.12)
        );
        rootStyle.setProperty(
          "--prism-marker-focus-radius",
          "8px"
        );
      }

      function ensureInstructionStyles() {
        if (prismInstructionStyle) return;
        const style = document.createElement("style");
        style.id = "prism-instruction-markers";
        style.textContent = [
          ".prism-has-instruction {",
          "  cursor: pointer !important;",
          "}",
          ".prism-has-instruction:not(.prism-has-instruction--background):not(.prism-has-instruction--svg) {",
          "  outline: none !important;",
          "  box-shadow: 0 0 0 var(--prism-marker-outline-width) var(--prism-marker-color-rgba) !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--svg {",
          "  outline: none !important;",
          "  filter: none !important;",
          "}",
          ".prism-has-instruction:not(.prism-has-instruction--svg).prism-has-instruction--picker-focus,",
          ".prism-has-instruction:not(.prism-has-instruction--svg).prism-has-instruction--notes-preview {",
          "  box-shadow: 0 0 0 2px var(--prism-marker-focus-ring-1), 0 0 0 4px var(--prism-marker-focus-ring-2), 0 0 0 6px var(--prism-marker-focus-ring-3), 0 0 0 8px var(--prism-marker-focus-ring-4), 0 0 0 10px var(--prism-marker-focus-ring-5) !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--editing:not(.prism-has-instruction--background):not(.prism-has-instruction--svg),",
          ".prism-editing-target {",
          "  outline: none !important;",
          "  box-shadow: inset 0 0 0 9999px " + PRISM_PICKER_FILL + " !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--background.prism-has-instruction--editing {",
          "  outline: none !important;",
          "  box-shadow: inset 0 0 0 9999px " + PRISM_PICKER_FILL + " !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--editing::before,",
          ".prism-editing-target::before,",
          ".prism-svg-instruction-proxy.prism-has-instruction--editing::before {",
          "  content: '';",
          "  position: absolute;",
          "  inset: calc(-1 * var(--prism-marker-outline-offset));",
          "  border-radius: calc(var(--prism-marker-focus-radius) + var(--prism-marker-outline-offset));",
          "  pointer-events: none;",
          "  z-index: 999;",
          "  background: linear-gradient(90deg, var(--prism-marker-color-rgba) 50%, transparent 0) 0 0 / 12px var(--prism-marker-outline-width) repeat-x, linear-gradient(90deg, var(--prism-marker-color-rgba) 50%, transparent 0) 0 100% / 12px var(--prism-marker-outline-width) repeat-x, linear-gradient(0deg, var(--prism-marker-color-rgba) 50%, transparent 0) 0 0 / var(--prism-marker-outline-width) 12px repeat-y, linear-gradient(0deg, var(--prism-marker-color-rgba) 50%, transparent 0) 100% 0 / var(--prism-marker-outline-width) 12px repeat-y;",
          "  animation: prism-edit-dash-rotate 1.8s linear infinite;",
          "}",
          "@keyframes prism-edit-dash-rotate {",
          "  to {",
          "    background-position: 24px 0, -24px 100%, 0 -24px, 100% 24px;",
          "  }",
          "}",
          ".prism-has-instruction.prism-has-instruction--svg.prism-has-instruction--picker-focus {",
          "  filter: none !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--svg.prism-has-instruction--notes-preview {",
          "  filter: none !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--svg.prism-has-instruction--editing {",
          "  filter: none !important;",
          "}",
          ".prism-svg-instruction-proxy {",
          "  position: fixed;",
          "  z-index: 2147483646;",
          "  pointer-events: none;",
          "  box-sizing: border-box;",
          "  border-radius: var(--prism-marker-focus-radius);",
          "  border: 0;",
          "  transform-origin: center center;",
          "  box-shadow: 0 0 0 var(--prism-marker-outline-width) var(--prism-marker-color-rgba);",
          "}",
          ".prism-svg-instruction-proxy.prism-has-instruction--picker-focus {",
          "  box-shadow: 0 0 0 var(--prism-marker-outline-width) var(--prism-marker-color-rgba), 0 0 0 2px var(--prism-marker-focus-ring-1), 0 0 0 4px var(--prism-marker-focus-ring-2), 0 0 0 6px var(--prism-marker-focus-ring-3), 0 0 0 8px var(--prism-marker-focus-ring-4), 0 0 0 10px var(--prism-marker-focus-ring-5) !important;",
          "}",
          ".prism-svg-instruction-proxy.prism-has-instruction--notes-preview {",
          "  box-shadow: 0 0 0 var(--prism-marker-outline-width) var(--prism-marker-color-rgba), 0 0 0 2px var(--prism-marker-focus-ring-1), 0 0 0 4px var(--prism-marker-focus-ring-2), 0 0 0 6px var(--prism-marker-focus-ring-3), 0 0 0 8px var(--prism-marker-focus-ring-4), 0 0 0 10px var(--prism-marker-focus-ring-5) !important;",
          "}",
          ".prism-svg-instruction-proxy.prism-has-instruction--editing {",
          "  box-shadow: none !important;",
          "}",
          ".prism-svg-instruction-proxy::after {",
          "  content: '';",
          "  position: absolute;",
          "  top: -6px;",
          "  right: -6px;",
          "  background: var(--prism-marker-badge-bg);",
          "  background-image: var(--prism-marker-badge-icon);",
          "  background-repeat: no-repeat;",
          "  background-position: center;",
          "  background-size: 7px 7px;",
          "  width: 12px;",
          "  height: 12px;",
          "  display: block;",
          "  border-radius: 50%;",
          "  box-shadow: 0 2px 4px rgba(0,0,0,0.2);",
          "  z-index: 1000;",
          "  pointer-events: none;",
          "}",
          ".prism-has-instruction::after {",
          "  content: '';",
          "  position: absolute;",
          "  top: -6px;",
          "  right: -6px;",
          "  background: var(--prism-marker-badge-bg);",
          "  background-image: var(--prism-marker-badge-icon);",
          "  background-repeat: no-repeat;",
          "  background-position: center;",
          "  background-size: 7px 7px;",
          "  width: 12px;",
          "  height: 12px;",
          "  display: block;",
          "  border-radius: 50%;",
          "  box-shadow: 0 2px 4px rgba(0,0,0,0.2);",
          "  z-index: 1000;",
          "  pointer-events: none;",
          "}",
          ".prism-has-instruction.prism-has-instruction--svg::after {",
          "  content: none;",
          "}",
          ".prism-has-instruction.prism-has-instruction--background::after {",
          "  content: none;",
          "}",
          ".prism-has-instruction.prism-has-instruction--background {",
          "  outline: none !important;",
          "  outline-offset: 0 !important;",
          "  box-shadow: inset 0 0 0 var(--prism-marker-outline-width) var(--prism-marker-color-rgba) !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--background.prism-has-instruction--picker-focus,",
          ".prism-has-instruction.prism-has-instruction--background.prism-has-instruction--notes-preview {",
          "  box-shadow: inset 0 0 0 var(--prism-marker-outline-width) var(--prism-marker-color-rgba), 0 0 0 2px var(--prism-marker-focus-ring-1), 0 0 0 4px var(--prism-marker-focus-ring-2), 0 0 0 6px var(--prism-marker-focus-ring-3), 0 0 0 8px var(--prism-marker-focus-ring-4), 0 0 0 10px var(--prism-marker-focus-ring-5) !important;",
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

      function cancelSvgInstructionProxyLoop() {
        if (prismSvgInstructionProxyRaf === null) return;
        const cancel = nativeCancelAnimationFrame || window.cancelAnimationFrame;
        if (cancel) cancel(prismSvgInstructionProxyRaf);
        prismSvgInstructionProxyRaf = null;
      }

      function clearSvgInstructionProxies() {
        cancelSvgInstructionProxyLoop();
        prismSvgInstructionProxies.forEach(function(entry) {
          if (entry && entry.proxy && entry.proxy.remove) entry.proxy.remove();
        });
        prismSvgInstructionProxies.clear();
      }

      function updateSvgInstructionProxies() {
        if (prismSvgInstructionProxies.size === 0) return;
        prismSvgInstructionProxies.forEach(function(entry, key) {
          const target = entry && entry.target;
          const proxy = entry && entry.proxy;
          if (!target || !proxy || !target.isConnected || !proxy.isConnected || !target.getBoundingClientRect) {
            if (proxy && proxy.remove) proxy.remove();
            prismSvgInstructionProxies.delete(key);
            return;
          }
          const rect = target.getBoundingClientRect();
          if (!rect || (!rect.width && !rect.height)) {
            proxy.style.display = "none";
            return;
          }
          proxy.style.display = "";
          proxy.style.left = rect.left + "px";
          proxy.style.top = rect.top + "px";
          proxy.style.width = rect.width + "px";
          proxy.style.height = rect.height + "px";
          proxy.style.borderRadius = resolveOverlayBorderRadius(target);
        });
      }

      function scheduleSvgInstructionProxySync() {
        if (prismSvgInstructionProxies.size === 0) {
          cancelSvgInstructionProxyLoop();
          return;
        }
        updateSvgInstructionProxies();
        if (prismFrozen || prismSvgInstructionProxyRaf !== null) return;
        const raf = nativeRequestAnimationFrame || window.requestAnimationFrame;
        if (!raf) return;
        const tick = function() {
          prismSvgInstructionProxyRaf = null;
          if (prismSvgInstructionProxies.size === 0 || prismFrozen) return;
          updateSvgInstructionProxies();
          prismSvgInstructionProxyRaf = raf(tick);
        };
        prismSvgInstructionProxyRaf = raf(tick);
      }

      function ensureSvgInstructionProxy(line, target) {
        const key = String(line);
        let entry = prismSvgInstructionProxies.get(key);
        if (!entry || !entry.proxy || !entry.proxy.isConnected) {
          const proxy = document.createElement("div");
          proxy.className = "prism-svg-instruction-proxy";
          proxy.dataset.prismSvgInstructionProxy = "true";
          proxy.dataset.prismLine = key;
          document.documentElement.appendChild(proxy);
          entry = { target, proxy };
          prismSvgInstructionProxies.set(key, entry);
        } else {
          entry.target = target;
        }
        scheduleSvgInstructionProxySync();
        return entry.proxy;
      }

      function clearPickerFocusedInstruction() {
        if (!prismPickerFocusedInstruction) return;
        prismPickerFocusedInstruction.classList.remove("prism-has-instruction--picker-focus");
        prismPickerFocusedInstruction = null;
      }

      function clearPreviewFocusedInstruction() {
        if (!prismPreviewFocusedInstruction) return;
        prismPreviewFocusedInstruction.classList.remove("prism-has-instruction--notes-preview");
        prismPreviewFocusedInstruction = null;
      }

      function clearEditingFocusedInstruction() {
        if (!prismEditingFocusedInstruction) return;
        prismEditingFocusedInstruction.classList.remove("prism-has-instruction--editing");
        prismEditingFocusedInstruction.classList.remove("prism-editing-target");
        if (prismEditingFocusedInstruction.dataset.prismEditingSetPosition) {
          prismEditingFocusedInstruction.style.position = "";
          delete prismEditingFocusedInstruction.dataset.prismEditingSetPosition;
        }
        prismEditingFocusedInstruction = null;
      }

      function setPickerFocusedInstruction(target) {
        const markerTarget =
          target &&
          target.classList &&
          (
            target.classList.contains("prism-has-instruction") ||
            target.classList.contains("prism-svg-instruction-proxy")
          )
            ? target
            : target && target.closest
              ? target.closest(".prism-has-instruction, .prism-svg-instruction-proxy")
              : null;
        if (prismPickerFocusedInstruction === markerTarget) return;
        clearPickerFocusedInstruction();
        if (!markerTarget) return;
        markerTarget.classList.add("prism-has-instruction--picker-focus");
        prismPickerFocusedInstruction = markerTarget;
      }

      function setPreviewFocusedInstruction(target) {
        const markerTarget =
          target &&
          target.classList &&
          (
            target.classList.contains("prism-has-instruction") ||
            target.classList.contains("prism-svg-instruction-proxy")
          )
            ? target
            : target && target.closest
              ? target.closest(".prism-has-instruction, .prism-svg-instruction-proxy")
              : null;
        if (prismPreviewFocusedInstruction === markerTarget) return;
        clearPreviewFocusedInstruction();
        if (!markerTarget) return;
        markerTarget.classList.add("prism-has-instruction--notes-preview");
        prismPreviewFocusedInstruction = markerTarget;
      }

      function setEditingFocusedInstruction(target) {
        const markerTarget =
          target &&
          target.classList &&
          (
            target.classList.contains("prism-has-instruction") ||
            target.classList.contains("prism-svg-instruction-proxy") ||
            target.classList.contains("prism-editing-target")
          )
            ? target
            : target && target.closest
              ? target.closest(".prism-has-instruction, .prism-svg-instruction-proxy, .prism-editing-target")
              : null;
        if (prismEditingFocusedInstruction === markerTarget) return;
        clearEditingFocusedInstruction();
        if (!markerTarget) return;
        if (
          markerTarget.classList.contains("prism-has-instruction") ||
          markerTarget.classList.contains("prism-svg-instruction-proxy")
        ) {
          markerTarget.classList.add("prism-has-instruction--editing");
        } else {
          markerTarget.classList.add("prism-editing-target");
        }
        prismEditingFocusedInstruction = markerTarget;
      }

      function isSvgTargetElement(el) {
        return Boolean(el && el.namespaceURI === "http://www.w3.org/2000/svg");
      }

      function applyMarkers() {
        clearPickerFocusedInstruction();
        clearPreviewFocusedInstruction();
        clearEditingFocusedInstruction();
        clearSvgInstructionProxies();
        document.querySelectorAll(".prism-editing-target").forEach(function(el) {
          el.classList.remove("prism-editing-target");
          if (el.dataset.prismEditingSetPosition) {
            el.style.position = "";
            delete el.dataset.prismEditingSetPosition;
          }
        });
        // Remove old markers and reset inline positions
        document.querySelectorAll(".prism-has-instruction").forEach(el => {
          el.classList.remove("prism-has-instruction");
          el.classList.remove("prism-has-instruction--background");
          el.classList.remove("prism-has-instruction--svg");
          el.classList.remove("prism-has-instruction--picker-focus");
          el.classList.remove("prism-has-instruction--notes-preview");
          el.classList.remove("prism-has-instruction--editing");
          if (el.dataset.prismDidSetPosition) {
            el.style.position = "";
            delete el.dataset.prismDidSetPosition;
          }
        });

        const keys = Object.keys(prismInstructions);
        const hasEditingLine = Number.isFinite(prismEditingLine) && prismEditingLine > 0;
        if (prismViewMode) {
          removeInstructionStyles();
          clearPickerHoverFeedback();
          return;
        }
        if (keys.length === 0 && !hasEditingLine) {
          removeInstructionStyles();
          return;
        }

        ensureInstructionStyles();

        keys.forEach(line => {
          const el = document.querySelector('[data-prism-line="' + line + '"]');
          if (el) {
            el.classList.add("prism-has-instruction");
            const isSvgTarget = isSvgTargetElement(el);
            if (isSvgTarget) {
              el.classList.add("prism-has-instruction--svg");
              ensureSvgInstructionProxy(line, el);
            }
            const isBackgroundTarget = isBackgroundLikeTarget(el);
            if (isBackgroundTarget) {
              el.classList.add("prism-has-instruction--background");
            }
            const style = window.getComputedStyle(el);
            // Do not change positioning for background/root targets.
            // For large containers this can re-anchor absolute children.
            if (
              style.position === "static" &&
              !isSvgTarget &&
              !isBackgroundTarget &&
              el !== document.body &&
              el !== document.documentElement
            ) {
              el.style.position = "relative";
              el.dataset.prismDidSetPosition = "true";
            }
          }
        });
        scheduleSvgInstructionProxySync();
        if (prismPickerActive) {
          refreshPickerTargetFromPointer(true);
        }
        syncPreviewFocus();
        syncEditingFocus();
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
        overlay.style.border = "var(--prism-marker-outline-width, 2px) dashed var(--prism-marker-color-rgba, rgba(79, 210, 195, 0.55))";
        overlay.style.background = PRISM_PICKER_FILL;
        overlay.style.boxShadow = "none";
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

      function getLineTarget(target) {
        if (!target) return null;
        if (target.hasAttribute && target.hasAttribute("data-prism-line")) {
          return target;
        }
        if (!target.closest) return null;
        return target.closest("[data-prism-line]");
      }

      function hasInstructionForLine(line) {
        if (!line) return false;
        return Object.prototype.hasOwnProperty.call(prismInstructions, String(line));
      }

      function getInstructionMarkerForLineTarget(target) {
        const lineTarget = getLineTarget(target);
        if (!lineTarget) return null;
        const line = getTargetLine(lineTarget);
        if (!line || !hasInstructionForLine(line)) return null;
        if (isSvgTargetElement(lineTarget)) {
          const svgProxyEntry = prismSvgInstructionProxies.get(String(line));
          if (svgProxyEntry && svgProxyEntry.proxy) return svgProxyEntry.proxy;
          return null;
        }
        if (
          lineTarget.classList &&
          lineTarget.classList.contains("prism-has-instruction")
        ) {
          return lineTarget;
        }
        return document.querySelector(
          '.prism-has-instruction[data-prism-line="' + line + '"]'
        );
      }

      function getInstructionMarkerForLine(line) {
        const numericLine = Number(line);
        if (!Number.isFinite(numericLine) || numericLine <= 0 || !hasInstructionForLine(numericLine)) {
          return null;
        }
        const lineTarget = document.querySelector('[data-prism-line="' + numericLine + '"]');
        if (!lineTarget) return null;
        return getInstructionMarkerForLineTarget(lineTarget);
      }

      function syncPreviewFocus() {
        if (!prismPreviewLine || !hasInstructionForLine(prismPreviewLine)) {
          clearPreviewFocusedInstruction();
          return;
        }
        setPreviewFocusedInstruction(getInstructionMarkerForLine(prismPreviewLine));
      }

      function syncEditingFocus() {
        if (!prismEditingLine || prismEditingLine <= 0) {
          clearEditingFocusedInstruction();
          return;
        }

        const marker = getInstructionMarkerForLine(prismEditingLine);
        if (marker) {
          setEditingFocusedInstruction(marker);
          return;
        }

        const lineTarget = document.querySelector('[data-prism-line="' + prismEditingLine + '"]');
        if (!lineTarget || isSvgTargetElement(lineTarget)) {
          clearEditingFocusedInstruction();
          return;
        }

        const style = window.getComputedStyle(lineTarget);
        if (
          style.position === "static" &&
          lineTarget !== document.body &&
          lineTarget !== document.documentElement
        ) {
          lineTarget.style.position = "relative";
          lineTarget.dataset.prismEditingSetPosition = "true";
        }
        setEditingFocusedInstruction(lineTarget);
      }

      function postNavigateMiss(line, reason) {
        try {
          parent.postMessage(
            {
              type: "PRISM_INSTRUCTION_NAVIGATE_MISS",
              line: Number(line) || null,
              reason: reason || "吏?뺥븳 硫붾え ????붿냼瑜?李얠? 紐삵뻽?듬땲??"
            },
            "*"
          );
        } catch (err) {}
      }

      function emitNavigateSelection(line, target) {
        if (!target || !target.getBoundingClientRect) {
          postNavigateMiss(line, "吏?뺥븳 硫붾え ????붿냼瑜?李얠? 紐삵뻽?듬땲??");
          return;
        }
        const rect = target.getBoundingClientRect();
        try {
          parent.postMessage(
            {
              type: "PRISM_PICKER_SELECT",
              line: Number(line) || 1,
              rect: {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height
              }
            },
            "*"
          );
        } catch (err) {}
      }

      function navigateToInstruction(line, behavior) {
        const numericLine = Number(line);
        if (!Number.isFinite(numericLine) || numericLine <= 0) {
          postNavigateMiss(line, "?섎せ??硫붾え ?쇱씤?낅땲??");
          return;
        }

        const target = document.querySelector('[data-prism-line="' + numericLine + '"]');
        if (!target) {
          postNavigateMiss(numericLine, "?대떦 ?쇱씤???붿냼媛 ?꾩옱 肄붾뱶???놁뒿?덈떎.");
          return;
        }

        const scrollBehavior =
          behavior === "smooth" || behavior === "auto" ? behavior : "smooth";
        try {
          target.scrollIntoView({
            behavior: scrollBehavior,
            block: "center",
            inline: "nearest"
          });
        } catch (err) {
          try {
            target.scrollIntoView();
          } catch (_) {}
        }

        if (scrollBehavior === "smooth") {
          window.setTimeout(function() {
            emitNavigateSelection(numericLine, target);
          }, 240);
          return;
        }
        const raf = nativeRequestAnimationFrame || window.requestAnimationFrame;
        if (raf) {
          raf(function() {
            emitNavigateSelection(numericLine, target);
          });
          return;
        }
        emitNavigateSelection(numericLine, target);
      }

      function normalizePickerTarget(target) {
        return getLineTarget(target) || target || null;
      }

      function resolvePickerHoverState(target) {
        const visualTarget = normalizePickerTarget(target);
        if (!visualTarget) return null;
        const lineTarget = getLineTarget(visualTarget);
        const resolvedLine = lineTarget ? getTargetLine(lineTarget) : null;
        const instructionMarker = getInstructionMarkerForLineTarget(lineTarget);
        return {
          visualTarget,
          lineTarget,
          line: resolvedLine,
          instructionMarker
        };
      }

      function resolveOverlayBorderRadius(target) {
        if (!target || !window.getComputedStyle) return "6px";
        const radius = window.getComputedStyle(target).borderRadius;
        if (!radius || radius === "0px") return "6px";
        return radius;
      }

      function updatePickerOverlay(target) {
        const hoverState = resolvePickerHoverState(target);
        if (!hoverState || !hoverState.visualTarget || !hoverState.visualTarget.getBoundingClientRect) return;
        const rect = hoverState.visualTarget.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        if (hoverState.instructionMarker) {
          setPickerFocusedInstruction(hoverState.instructionMarker);
          clearPickerHoverTarget();
          clearPickerOverlay();
          return;
        }
        const isBackgroundTarget = isBackgroundLikeTarget(hoverState.visualTarget);
        // Background targets should not flicker highlight during hover
        // unless they already have a saved memo.
        if (isBackgroundTarget && !hasInstructionForLine(hoverState.line)) {
          setPickerFocusedInstruction(null);
          clearPickerHoverTarget();
          clearPickerOverlay();
          return;
        }
        setPickerFocusedInstruction(null);
        clearPickerOverlay();
        setPickerHoverTarget(hoverState.visualTarget);
      }

      function clearPickerOverlay() {
        if (!prismPickerOverlay) return;
        prismPickerOverlay.remove();
        prismPickerOverlay = null;
      }

      function clearPickerHoverFeedback() {
        clearPickerHoverTarget();
        clearPickerFocusedInstruction();
        clearPickerOverlay();
      }

      function clearPickerHoverTarget() {
        if (!prismPickerHoverTarget) return;
        prismPickerHoverTarget.classList.remove("prism-picker-hover");
        prismPickerHoverTarget.classList.remove("prism-picker-hover--svg");
        prismPickerHoverTarget.classList.remove("prism-picker-hover--background");
        prismPickerHoverTarget = null;
      }

      function setPickerHoverTarget(target) {
        if (!target || !target.classList) {
          clearPickerHoverTarget();
          return;
        }
        if (prismPickerHoverTarget === target) return;
        clearPickerHoverTarget();
        prismPickerHoverTarget = target;
        prismPickerHoverTarget.classList.add("prism-picker-hover");
        if (isSvgTargetElement(target)) {
          prismPickerHoverTarget.classList.add("prism-picker-hover--svg");
        }
        if (isBackgroundLikeTarget(target)) {
          prismPickerHoverTarget.classList.add("prism-picker-hover--background");
        }
      }

      function invalidatePickerPointerState() {
        prismPointerInside = false;
        prismPointerClientX = null;
        prismPointerClientY = null;
        prismPickerTarget = null;
        clearPickerHoverFeedback();
      }

      function refreshPickerTargetFromPointer(forceUpdate) {
        if (!prismPickerActive) return;
        if (!prismPointerInside) {
          invalidatePickerPointerState();
          return;
        }
        if (!Number.isFinite(prismPointerClientX) || !Number.isFinite(prismPointerClientY)) {
          invalidatePickerPointerState();
          return;
        }
        const nextTarget = findTargetAt(prismPointerClientX, prismPointerClientY);
        if (!nextTarget) {
          invalidatePickerPointerState();
          return;
        }
        if (prismPickerTarget === nextTarget && !forceUpdate) return;
        prismPickerTarget = nextTarget;
        updatePickerOverlay(nextTarget);
      }

      function stopPickerTracking() {
        if (prismPickerTrackingRaf === null) return;
        const cancel = nativeCancelAnimationFrame || window.cancelAnimationFrame;
        if (cancel) cancel(prismPickerTrackingRaf);
        prismPickerTrackingRaf = null;
      }

      function startPickerTracking() {
        if (prismPickerTrackingRaf !== null) return;
        const raf = nativeRequestAnimationFrame || window.requestAnimationFrame;
        if (!raf) return;
        const tick = function() {
          prismPickerTrackingRaf = null;
          if (!prismPickerActive) return;
          refreshPickerTargetFromPointer();
          prismPickerTrackingRaf = raf(tick);
        };
        prismPickerTrackingRaf = raf(tick);
      }

      function ensurePickerHoverStyles() {
        if (prismPickerHoverStyle) return;
        const style = document.createElement("style");
        style.id = "prism-picker-hover-style";
        style.textContent = [
          ".prism-picker-hover:not(.prism-picker-hover--background):not(.prism-picker-hover--svg) {",
          "  outline: var(--prism-marker-outline-width) dashed var(--prism-marker-color-rgba) !important;",
          "  outline-offset: var(--prism-marker-outline-offset) !important;",
          "  box-shadow: inset 0 0 0 9999px " + PRISM_PICKER_FILL + " !important;",
          "}",
          ".prism-picker-hover.prism-picker-hover--svg {",
          "  outline: var(--prism-marker-outline-width) dashed var(--prism-marker-color-rgba) !important;",
          "  outline-offset: var(--prism-marker-outline-offset) !important;",
          "}",
          ".prism-picker-hover.prism-picker-hover--background {",
          "  outline: none !important;",
          "  box-shadow: none !important;",
          "}"
        ].join("\\n");
        document.head.appendChild(style);
        prismPickerHoverStyle = style;
      }

      function removePickerHoverStyles() {
        if (!prismPickerHoverStyle) return;
        prismPickerHoverStyle.remove();
        prismPickerHoverStyle = null;
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
          "}",
          "[data-prism-svg-instruction-proxy='true'] {",
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
          !prismPickerActive &&
          !prismViewMode;
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
        const nextActive = Boolean(active) && !prismViewMode;
        if (nextActive) {
          const caps = evaluateRuntimeCapabilities();
          if (caps.picker === false) {
            prismPickerActive = false;
            stopPickerTracking();
            invalidatePickerPointerState();
            removePickerPointerStyles();
            removePickerHoverStyles();
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

        prismPickerActive = nextActive;
        document.body.style.cursor = prismPickerActive ? "crosshair" : "";
        if (prismPickerActive) {
          ensurePickerPointerStyles();
          ensurePickerHoverStyles();
          startPickerTracking();
          refreshPickerTargetFromPointer(true);
        } else {
          stopPickerTracking();
          invalidatePickerPointerState();
          removePickerPointerStyles();
          removePickerHoverStyles();
        }
        syncPreviewFocus();
        updateInteractionLock();
        queueRuntimeCapabilities();
      }

      function applyUiState(nextState) {
        const safeState = nextState || {};
        const previewLine = Number(safeState.previewLine);
        const editingLine = Number(safeState.editingLine);
        prismSettings = normalizeSettings(safeState.settings);
        applyVisualSettings();
        prismViewMode = Boolean(safeState.isViewMode);
        prismInstructions = safeState.instructions || {};
        prismPreviewLine =
          Number.isFinite(previewLine) && previewLine > 0
            ? previewLine
            : null;
        prismEditingLine =
          Number.isFinite(editingLine) && editingLine > 0
            ? editingLine
            : null;
        if (prismViewMode) {
          prismPreviewLine = null;
          prismEditingLine = null;
        }
        setPickerActive(Boolean(safeState.pickerActive));
        setFrozen(Boolean(safeState.frozen));
        queueRuntimeCapabilities();
      }

      function findTargetAt(x, y) {
        const elements = document.elementsFromPoint(x, y);
        if (!elements || elements.length === 0) return null;
        const pickableElements = elements.filter(el => el && el !== prismPickerOverlay);
        if (pickableElements.length === 0) return null;

        // 1) Picking target is always the topmost line-carrying element.
        // This keeps nested elements selectable even when ancestors already have memos.
        for (const el of pickableElements) {
          const lineTarget = getLineTarget(el);
          if (lineTarget) return lineTarget;
        }

        // 2) Fallback to the first visible non-root element.
        for (const el of pickableElements) {
          if (el === document.documentElement || el === document.body) continue;
          return el;
        }

        return pickableElements[0] || null;
      }

      document.addEventListener("mousemove", function(event) {
        if (!prismPickerActive) return;
        event.stopPropagation();
        event.stopImmediatePropagation();
        prismPointerInside = true;
        prismPointerClientX = event.clientX;
        prismPointerClientY = event.clientY;
        refreshPickerTargetFromPointer();
      }, true);

      document.addEventListener("mouseout", function(event) {
        if (!prismPickerActive) return;
        if (event.relatedTarget) return;
        invalidatePickerPointerState();
      }, true);

      window.addEventListener("blur", function() {
        if (!prismPickerActive) return;
        invalidatePickerPointerState();
      });

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

        const resolvedTarget = normalizePickerTarget(target) || target;
        const line = getTargetLine(resolvedTarget) || 1;
        const rect = resolvedTarget.getBoundingClientRect();
        parent.postMessage({
          type: "PRISM_PICKER_SELECT",
          line,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        }, "*");
      }, true);

      document.addEventListener("scroll", function() {
        scheduleSvgInstructionProxySync();
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
          return;
        }

        if (event.data.type === "PRISM_INSTRUCTION_NAVIGATE") {
          navigateToInstruction(event.data.line, event.data.behavior);
        }
      });

      const capabilityObserver = new MutationObserver(function() {
        scheduleSvgInstructionProxySync();
        queueRuntimeCapabilities();
      });

      capabilityObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "width", "height"]
      });

      window.addEventListener("resize", function() {
        scheduleSvgInstructionProxySync();
        queueRuntimeCapabilities();
      });
      window.addEventListener("load", function() {
        scheduleSvgInstructionProxySync();
        queueRuntimeCapabilities();
      });
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


  return {
    snapshotBridge,
    viewportPolicyStyle
  };
}
