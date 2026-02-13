export const SNAPSHOT_RUNTIME_MARKERS_SOURCE = String.raw`
      function ensureInstructionStyles() {
        if (prismInstructionStyle) return;
        const style = document.createElement("style");
        style.id = "prism-instruction-markers";
        style.textContent = [
          ".prism-has-instruction {",
          "  cursor: pointer !important;",
          "}",
          ".prism-has-instruction:not(.prism-has-instruction--background) {",
          "  outline: none !important;",
          "  box-shadow: 0 0 0 var(--prism-marker-outline-width) var(--prism-marker-color-rgba) !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--svg {",
          "  outline: none !important;",
          "  box-shadow: 0 0 0 var(--prism-marker-outline-width) var(--prism-marker-color-rgba) !important;",
          "  filter: none !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--proxy {",
          "  outline: none !important;",
          "  box-shadow: none !important;",
          "  filter: none !important;",
          "}",
          ".prism-has-instruction:not(.prism-has-instruction--background).prism-has-instruction--picker-focus,",
          ".prism-has-instruction:not(.prism-has-instruction--background).prism-has-instruction--notes-preview {",
          "  box-shadow: 0 0 0 2px var(--prism-marker-focus-ring-1), 0 0 0 4px var(--prism-marker-focus-ring-2), 0 0 0 6px var(--prism-marker-focus-ring-3), 0 0 0 8px var(--prism-marker-focus-ring-4), 0 0 0 10px var(--prism-marker-focus-ring-5) !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--editing:not(.prism-has-instruction--background),",
          ".prism-editing-target {",
          "  outline: none !important;",
          "  outline-offset: 0 !important;",
          "  box-shadow: inset 0 0 0 9999px " + PRISM_PICKER_FILL + " !important;",
          "  filter: none !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--background.prism-has-instruction--editing {",
          "  outline: none !important;",
          "  box-shadow: inset 0 0 0 9999px " + PRISM_PICKER_FILL + " !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--editing:not(.prism-has-instruction--background)::before,",
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
          "  outline: none !important;",
          "  outline-offset: 0 !important;",
          "  box-shadow: inset 0 0 0 9999px " + PRISM_PICKER_FILL + " !important;",
          "}",
          ".prism-svg-instruction-proxy[data-prism-has-instruction='true']::after {",
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
          ".prism-has-instruction.prism-has-instruction--proxy::after {",
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
          proxy.dataset.prismHasInstruction = "false";
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
        let markerTarget = null;
        if (target && target.classList) {
          markerTarget = target;
        } else if (target && target.closest) {
          markerTarget = target.closest(".prism-has-instruction, .prism-svg-instruction-proxy, .prism-editing-target");
        }
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

      function shouldUseSvgInstructionProxy(target) {
        if (!target || !target.tagName) return false;
        if (isSvgTargetElement(target)) return true;
        const tag = String(target.tagName || "").toLowerCase();
        return (
          tag === "canvas" ||
          tag === "img" ||
          tag === "video" ||
          tag === "iframe" ||
          tag === "object" ||
          tag === "embed"
        );
      }

      function shouldUsePickerHoverProxy(target) {
        return shouldUseSvgInstructionProxy(target);
      }

      function applyMarkers() {
        clearPickerFocusedInstruction();
        clearPreviewFocusedInstruction();
        clearEditingFocusedInstruction();
        prunePickedVisualTargetCache();
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
          el.classList.remove("prism-has-instruction--proxy");
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
            const useProxy = shouldUseSvgInstructionProxy(el);
            const isSvgTarget = isSvgTargetElement(el);
            if (isSvgTarget) {
              el.classList.add("prism-has-instruction--svg");
            }
            if (useProxy) {
              el.classList.add("prism-has-instruction--proxy");
              const proxy = ensureSvgInstructionProxy(line, el);
              if (proxy) {
                proxy.dataset.prismHasInstruction = "true";
              }
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
              !useProxy &&
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
        if (shouldUseSvgInstructionProxy(lineTarget)) {
          const proxyEntry = prismSvgInstructionProxies.get(String(line));
          if (proxyEntry && proxyEntry.proxy) return proxyEntry.proxy;
          return lineTarget;
        }
        if (isSvgTargetElement(lineTarget)) {
          return lineTarget;
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

        const rememberedTarget = getRememberedPickedVisualTarget(prismEditingLine);
        if (rememberedTarget) {
          if (shouldUseSvgInstructionProxy(rememberedTarget)) {
            const rememberedLineTarget = getLineTarget(rememberedTarget) || rememberedTarget;
            const rememberedLine = getTargetLine(rememberedLineTarget);
            if (rememberedLine) {
              const rememberedProxy = ensureSvgInstructionProxy(rememberedLine, rememberedTarget);
              if (rememberedProxy) {
                if (!hasInstructionForLine(rememberedLine)) {
                  rememberedProxy.dataset.prismHasInstruction = "false";
                }
                setEditingFocusedInstruction(rememberedProxy);
                return;
              }
            }
          } else if (!isSvgTargetElement(rememberedTarget)) {
            const style = window.getComputedStyle(rememberedTarget);
            if (
              style.position === "static" &&
              rememberedTarget !== document.body &&
              rememberedTarget !== document.documentElement
            ) {
              rememberedTarget.style.position = "relative";
              rememberedTarget.dataset.prismEditingSetPosition = "true";
            }
          }
          setEditingFocusedInstruction(rememberedTarget);
          return;
        }

        const marker = getInstructionMarkerForLine(prismEditingLine);
        if (marker) {
          setEditingFocusedInstruction(marker);
          return;
        }

        const lineTarget = document.querySelector('[data-prism-line="' + prismEditingLine + '"]');
        if (!lineTarget) {
          clearEditingFocusedInstruction();
          return;
        }
        if (shouldUseSvgInstructionProxy(lineTarget)) {
          const proxy = ensureSvgInstructionProxy(prismEditingLine, lineTarget);
          if (proxy) {
            if (!hasInstructionForLine(prismEditingLine)) {
              proxy.dataset.prismHasInstruction = "false";
            }
            setEditingFocusedInstruction(proxy);
            return;
          }
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


`;
