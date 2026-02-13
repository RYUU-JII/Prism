export const SNAPSHOT_RUNTIME_PRELUDE_SOURCE = `

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
        debugPickerOverlay: false,
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
      let prismDebugOverlayEnabled = false;
      let prismDebugOverlayEl = null;
      let prismDebugOverlayHeaderEl = null;
      let prismDebugOverlayBodyEl = null;
      let prismLastTargetResolutionDebug = null;
      let prismDebugSnapshotPinned = false;
      let prismDebugPinnedSnapshot = null;

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

      function roundDebugNumber(value, precision) {
        const num = Number(value);
        if (!Number.isFinite(num)) return null;
        const scale = Math.pow(10, Number(precision) || 2);
        return Math.round(num * scale) / scale;
      }

      function getDebugLineFromTarget(target) {
        if (!target) return null;
        let lineTarget = null;
        if (typeof getLineTarget === "function") {
          try {
            lineTarget = getLineTarget(target);
          } catch (err) {
            lineTarget = null;
          }
        }
        if (!lineTarget && target.hasAttribute && target.hasAttribute("data-prism-line")) {
          lineTarget = target;
        }
        if (!lineTarget && target.closest) {
          lineTarget = target.closest("[data-prism-line]");
        }
        const candidate = lineTarget || target;
        if (typeof getTargetLine === "function") {
          try {
            return getTargetLine(candidate);
          } catch (err) {
            return null;
          }
        }
        if (!candidate || !candidate.getAttribute) return null;
        const line = Number(candidate.getAttribute("data-prism-line"));
        return Number.isFinite(line) && line > 0 ? line : null;
      }

      function buildDebugElementLabel(target, line) {
        if (!target || target === window || target === document) return "(none)";
        const tag = String(target.tagName || target.nodeName || "node").toLowerCase();
        let label = tag;
        if (target.id) label += "#" + target.id;
        if (target.classList && target.classList.length > 0) {
          const parts = Array.from(target.classList).slice(0, 3);
          if (parts.length > 0) label += "." + parts.join(".");
        }
        if (line) label += "[line=" + line + "]";
        return label;
      }

      function describeDebugElement(target, compact) {
        if (!target || target === window || target === document) return null;
        const line = getDebugLineFromTarget(target);
        const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
        const hasRect = Boolean(rect && (rect.width || rect.height));
        let style = null;
        if (!compact && target.nodeType === 1 && window.getComputedStyle) {
          try {
            style = window.getComputedStyle(target);
          } catch (err) {
            style = null;
          }
        }
        const classNameRaw = target.className;
        const className =
          typeof classNameRaw === "string"
            ? classNameRaw
            : classNameRaw && typeof classNameRaw.baseVal === "string"
              ? classNameRaw.baseVal
              : "";
        const info = {
          label: buildDebugElementLabel(target, line),
          tag: String(target.tagName || "").toLowerCase(),
          line,
          namespace: target.namespaceURI || "",
          isSvg: Boolean(target.namespaceURI === "http://www.w3.org/2000/svg"),
          classList: className ? className.split(/\\s+/).filter(Boolean).slice(0, 12) : [],
          rect: hasRect
            ? {
                left: roundDebugNumber(rect.left, 1),
                top: roundDebugNumber(rect.top, 1),
                width: roundDebugNumber(rect.width, 1),
                height: roundDebugNumber(rect.height, 1)
              }
            : null,
          area: hasRect ? roundDebugNumber(rect.width * rect.height, 1) : 0
        };
        if (!compact && style) {
          info.pointerEvents = style.pointerEvents || "";
          info.display = style.display || "";
          info.visibility = style.visibility || "";
          info.opacity = style.opacity || "";
          info.position = style.position || "";
          info.transform = style.transform || "";
          info.borderRadius = style.borderRadius || "";
        }
        return info;
      }

      function listElementsAtPointerForDebug(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !document.elementsFromPoint) return [];
        let elements = [];
        try {
          elements = document.elementsFromPoint(x, y) || [];
        } catch (err) {
          elements = [];
        }
        return elements
          .slice(0, 10)
          .map(function(el) {
            return describeDebugElement(el, true);
          })
          .filter(Boolean);
      }

      function ensureDebugOverlayElement() {
        if (prismDebugOverlayEl && prismDebugOverlayEl.isConnected) return prismDebugOverlayEl;
        const container = document.createElement("div");
        container.dataset.prismPickerDebugOverlay = "true";
        container.style.position = "fixed";
        container.style.left = "12px";
        container.style.top = "12px";
        container.style.width = "min(460px, calc(100vw - 24px))";
        container.style.maxHeight = "min(66vh, calc(100vh - 24px))";
        container.style.pointerEvents = "auto";
        container.style.zIndex = "2147483647";
        container.style.background = "rgba(7, 11, 17, 0.92)";
        container.style.border = "1px solid rgba(120, 210, 195, 0.5)";
        container.style.borderRadius = "10px";
        container.style.boxShadow = "0 12px 28px rgba(0, 0, 0, 0.4)";
        container.style.backdropFilter = "blur(3px)";
        container.style.color = "#d9fff8";
        container.style.fontFamily = "'Consolas','Menlo','Monaco','Courier New',monospace";
        container.style.fontSize = "11px";
        container.style.lineHeight = "1.35";
        container.style.overflow = "hidden";

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.justifyContent = "space-between";
        header.style.gap = "8px";
        header.style.padding = "7px 10px";
        header.style.borderBottom = "1px solid rgba(120, 210, 195, 0.35)";
        header.style.background = "rgba(20, 184, 166, 0.14)";
        header.style.fontWeight = "700";
        header.style.letterSpacing = "0.08em";
        header.style.fontSize = "10px";
        header.style.pointerEvents = "auto";

        const title = document.createElement("span");
        title.textContent = "PRISM PICKER DEBUG";
        title.style.flex = "1 1 auto";
        title.style.minWidth = "0";

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.textContent = "Copy";
        copyButton.setAttribute("aria-label", "Copy debug snapshot");
        copyButton.style.border = "1px solid rgba(120, 210, 195, 0.55)";
        copyButton.style.borderRadius = "6px";
        copyButton.style.background = "rgba(7, 28, 35, 0.75)";
        copyButton.style.color = "#d9fff8";
        copyButton.style.padding = "2px 7px";
        copyButton.style.fontSize = "10px";
        copyButton.style.lineHeight = "1.2";
        copyButton.style.cursor = "pointer";
        copyButton.style.pointerEvents = "auto";
        copyButton.addEventListener("click", function(event) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          copyPickerDebugSnapshot("button-copy", prismPickerTarget);
        });

        header.appendChild(title);
        header.appendChild(copyButton);

        const body = document.createElement("pre");
        body.style.margin = "0";
        body.style.padding = "8px 10px 10px";
        body.style.whiteSpace = "pre-wrap";
        body.style.wordBreak = "break-word";
        body.style.overflow = "auto";
        body.style.maxHeight = "min(60vh, calc(100vh - 72px))";
        body.style.color = "#c6f6ef";
        body.style.background = "transparent";

        container.appendChild(header);
        container.appendChild(body);
        document.documentElement.appendChild(container);
        prismDebugOverlayEl = container;
        prismDebugOverlayHeaderEl = header;
        prismDebugOverlayBodyEl = body;
        return container;
      }

      function removeDebugOverlayElement() {
        if (prismDebugOverlayEl && prismDebugOverlayEl.remove) {
          prismDebugOverlayEl.remove();
        }
        prismDebugOverlayEl = null;
        prismDebugOverlayHeaderEl = null;
        prismDebugOverlayBodyEl = null;
      }

      function setPickerDebugOverlayEnabled(enabled) {
        const next = Boolean(enabled);
        prismDebugOverlayEnabled = next;
        if (!next) {
          prismDebugSnapshotPinned = false;
          prismDebugPinnedSnapshot = null;
        }
        if (!next) {
          removeDebugOverlayElement();
          return;
        }
        ensureDebugOverlayElement();
      }

      function setPickerTargetResolutionDebug(payload) {
        prismLastTargetResolutionDebug = payload || null;
      }

      function pickDebugTarget(targetOverride) {
        if (targetOverride && targetOverride.isConnected) return targetOverride;
        if (prismPickerTarget && prismPickerTarget.isConnected) return prismPickerTarget;
        if (
          prismPickerVisualState &&
          prismPickerVisualState.hoverTarget &&
          prismPickerVisualState.hoverTarget.isConnected
        ) {
          return prismPickerVisualState.hoverTarget;
        }
        return null;
      }

      function buildPickerDebugSnapshot(reason, targetOverride) {
        const target = pickDebugTarget(targetOverride);
        const lineTarget =
          typeof getLineTarget === "function" && target
            ? getLineTarget(target)
            : target && target.closest
              ? target.closest("[data-prism-line]")
              : target;
        const line = lineTarget ? getDebugLineFromTarget(lineTarget) : null;
        const marker =
          typeof getInstructionMarkerForLineTarget === "function"
            ? getInstructionMarkerForLineTarget(lineTarget)
            : null;
        const hasInstruction =
          typeof hasInstructionForLine === "function" ? hasInstructionForLine(line) : false;
        const useHoverProxy =
          typeof shouldUsePickerHoverProxy === "function" && target
            ? shouldUsePickerHoverProxy(target)
            : false;
        const useInstructionProxy =
          typeof shouldUseSvgInstructionProxy === "function" && lineTarget
            ? shouldUseSvgInstructionProxy(lineTarget)
            : false;
        const backgroundLike =
          typeof isBackgroundLikeTarget === "function" && (lineTarget || target)
            ? isBackgroundLikeTarget(lineTarget || target)
            : false;
        const hoverVisualTarget =
          prismPickerVisualState && prismPickerVisualState.hoverTarget
            ? prismPickerVisualState.hoverTarget
            : null;
        const focusVisualTarget =
          prismPickerVisualState && prismPickerVisualState.focusTarget
            ? prismPickerVisualState.focusTarget
            : null;
        const instructionLines = Object.keys(prismInstructions || {})
          .map(function(key) {
            const num = Number(key);
            return Number.isFinite(num) && num > 0 ? num : null;
          })
          .filter(function(num) {
            return num !== null;
          })
          .sort(function(a, b) {
            return a - b;
          });
        return {
          at: new Date().toISOString(),
          reason: reason || "unknown",
          pointer: {
            inside: Boolean(prismPointerInside),
            x: Number.isFinite(prismPointerClientX) ? roundDebugNumber(prismPointerClientX, 1) : null,
            y: Number.isFinite(prismPointerClientY) ? roundDebugNumber(prismPointerClientY, 1) : null
          },
          runtime: {
            pickerActive: Boolean(prismPickerActive),
            frozen: Boolean(prismFrozen),
            viewMode: Boolean(prismViewMode),
            debugOverlay: Boolean(prismDebugOverlayEnabled),
            debugPinned: Boolean(prismDebugSnapshotPinned),
            previewLine: prismPreviewLine || null,
            editingLine: prismEditingLine || null
          },
          visualState: {
            mode:
              prismPickerVisualState && prismPickerVisualState.mode
                ? prismPickerVisualState.mode
                : "idle",
            line:
              prismPickerVisualState &&
              Number.isFinite(Number(prismPickerVisualState.line)) &&
              Number(prismPickerVisualState.line) > 0
                ? Number(prismPickerVisualState.line)
                : null,
            hoverTarget: describeDebugElement(hoverVisualTarget, true),
            focusTarget: describeDebugElement(focusVisualTarget, true)
          },
          target: {
            resolved: describeDebugElement(target, false),
            lineTarget: describeDebugElement(lineTarget, false),
            marker: describeDebugElement(marker, false)
          },
          flags: {
            hasInstruction: Boolean(hasInstruction),
            isBackgroundLike: Boolean(backgroundLike),
            useHoverProxy: Boolean(useHoverProxy),
            useInstructionProxy: Boolean(useInstructionProxy),
            isSvg:
              target && target.namespaceURI === "http://www.w3.org/2000/svg"
          },
          overlays: {
            hoverProxyMounted: Boolean(prismPickerHoverProxy && prismPickerHoverProxy.isConnected),
            hoverProxySource: describeDebugElement(prismPickerHoverProxySource, true),
            svgProxyCount: prismSvgInstructionProxies.size
          },
          instructions: {
            count: instructionLines.length,
            lines: instructionLines.slice(0, 40)
          },
          resolution: prismLastTargetResolutionDebug || null,
          elementsFromPoint: listElementsAtPointerForDebug(prismPointerClientX, prismPointerClientY)
        };
      }

      function renderPickerDebugSnapshot(snapshot) {
        if (!prismDebugOverlayEnabled) return;
        const panel = ensureDebugOverlayElement();
        if (!panel || !prismDebugOverlayBodyEl) return;
        if (prismDebugOverlayHeaderEl) {
          const titleEl = prismDebugOverlayHeaderEl.querySelector("span");
          if (titleEl) {
            titleEl.textContent = prismDebugSnapshotPinned
              ? "PRISM PICKER DEBUG [PINNED]"
              : "PRISM PICKER DEBUG";
          }
        }
        prismDebugOverlayBodyEl.textContent = JSON.stringify(snapshot, null, 2);
        if (!Number.isFinite(prismPointerClientX) || !Number.isFinite(prismPointerClientY)) return;
        const panelRect = panel.getBoundingClientRect();
        const margin = 12;
        let left = prismPointerClientX + 16;
        let top = prismPointerClientY + 16;
        if (left + panelRect.width + margin > window.innerWidth) {
          left = prismPointerClientX - panelRect.width - 16;
        }
        if (top + panelRect.height + margin > window.innerHeight) {
          top = window.innerHeight - panelRect.height - margin;
        }
        left = Math.max(margin, left);
        top = Math.max(margin, top);
        panel.style.left = Math.round(left) + "px";
        panel.style.top = Math.round(top) + "px";
      }

      function pinPickerDebugSnapshot(reason, targetOverride, point) {
        if (!prismDebugOverlayEnabled) return;
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
          prismPointerInside = true;
          prismPointerClientX = point.x;
          prismPointerClientY = point.y;
        }
        const snapshot = buildPickerDebugSnapshot(reason || "click-pin", targetOverride);
        prismDebugSnapshotPinned = true;
        prismDebugPinnedSnapshot = snapshot;
        renderPickerDebugSnapshot(snapshot);
      }

      function refreshPickerDebugOverlay(reason, targetOverride) {
        if (!prismDebugOverlayEnabled) return;
        if (prismDebugSnapshotPinned && prismDebugPinnedSnapshot) {
          renderPickerDebugSnapshot(prismDebugPinnedSnapshot);
          return;
        }
        const snapshot = buildPickerDebugSnapshot(reason, targetOverride);
        renderPickerDebugSnapshot(snapshot);
      }

      function isEditableDebugTarget(target) {
        if (!target) return false;
        const node = target.nodeType === 1 ? target : target.parentElement;
        if (!node || !node.closest) return false;
        return Boolean(
          node.closest(
            "input, textarea, select, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']"
          )
        );
      }

      function isDebugOverlayEventTarget(target) {
        if (!target) return false;
        const node = target.nodeType === 1 ? target : target.parentElement;
        if (!node || !node.closest) return false;
        return Boolean(node.closest("[data-prism-picker-debug-overlay='true']"));
      }

      function legacyCopyText(text) {
        let textarea = null;
        try {
          textarea = document.createElement("textarea");
          textarea.value = String(text || "");
          textarea.setAttribute("readonly", "true");
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          textarea.style.top = "0";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const ok = document.execCommand ? document.execCommand("copy") : false;
          return Boolean(ok);
        } catch (err) {
          return false;
        } finally {
          if (textarea && textarea.remove) textarea.remove();
        }
      }

      async function copyPickerDebugSnapshot(reason, targetOverride) {
        if (!prismDebugOverlayEnabled) return false;
        const snapshot = buildPickerDebugSnapshot(reason || "copy", targetOverride);
        renderPickerDebugSnapshot(snapshot);
        const text = JSON.stringify(snapshot, null, 2);

        let copied = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            copied = true;
          }
        } catch (err) {
          copied = false;
        }

        if (!copied) {
          copied = legacyCopyText(text);
        }

        if (!copied) {
          try {
            parent.postMessage(
              {
                type: "PRISM_PICKER_DEBUG_COPY",
                text,
                reason: reason || "copy"
              },
              "*"
            );
          } catch (err) {}
        }

        try {
          parent.postMessage(
            {
              type: "PRISM_DEVLOG",
              stage: "picker-debug-copy",
              payload: {
                copiedInFrame: copied,
                fallbackToHost: !copied,
                length: text.length
              }
            },
            "*"
          );
        } catch (err) {}

        return copied;
      }


`;
