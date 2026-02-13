export const SNAPSHOT_RUNTIME_PRELUDE_SOURCE = String.raw`

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

      const PICKER_VISUAL_MODE = Object.freeze({
        IDLE: "idle",
        HOVER: "hover",
        FOCUS_MEMO: "focus-memo",
        SUPPRESSED: "suppressed"
      });

      function createIdlePickerVisualState() {
        return {
          mode: PICKER_VISUAL_MODE.IDLE,
          line: null,
          hoverTarget: null,
          focusTarget: null
        };
      }

      let prismPickerActive = false;
      let prismPickerTarget = null;
      let prismPickerHoverTarget = null;
      let prismPickerHoverProxy = null;
      let prismPickerHoverProxySource = null;
      let prismPickerFocusedInstruction = null;
      let prismPickerVisualState = createIdlePickerVisualState();
      const prismPickedVisualTargetsByLine = new Map();
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


`;
