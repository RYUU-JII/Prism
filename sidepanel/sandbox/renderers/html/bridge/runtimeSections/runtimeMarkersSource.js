export const SNAPSHOT_RUNTIME_MARKERS_SOURCE = `
      function getNodeDepth(target) {
        let depth = 0;
        let current = target;
        while (current && current.parentElement) {
          depth += 1;
          current = current.parentElement;
        }
        return depth;
      }

      function normalizeInstructionTokenValue(token) {
        const raw = String(token || "").trim();
        if (!raw) return "";
        if (!/^[A-Za-z0-9:_-]{1,64}$/.test(raw)) return "";
        return raw;
      }

      function escapeTokenForSelector(token) {
        const normalized = normalizeInstructionTokenValue(token);
        if (!normalized) return "";
        if (window.CSS && typeof window.CSS.escape === "function") {
          return window.CSS.escape(normalized);
        }
        return normalized.replace(/["\\\\]/g, "\\\\$&");
      }

      function getElementByInstructionToken(token) {
        const escaped = escapeTokenForSelector(token);
        if (!escaped) return null;
        try {
          return document.querySelector('[data-prism-token="' + escaped + '"]');
        } catch (err) {
          return null;
        }
      }

      function getBestElementForLine(line, preferredToken) {
        const numericLine = Number(line);
        if (!Number.isFinite(numericLine) || numericLine <= 0) return null;

        const normalizedToken = normalizeInstructionTokenValue(preferredToken);
        if (normalizedToken) {
          const tokenTarget = getElementByInstructionToken(normalizedToken);
          if (tokenTarget && tokenTarget.isConnected) {
            const tokenLineTarget = getLineTarget(tokenTarget) || tokenTarget;
            const tokenLine = getTargetLine(tokenLineTarget);
            if (tokenLine === numericLine) {
              return tokenTarget;
            }
          }
        }

        if (typeof getRememberedPickedVisualTarget === "function") {
          const remembered = getRememberedPickedVisualTarget(numericLine);
          if (remembered && remembered.isConnected) {
            return remembered;
          }
        }

        const candidates = Array.from(
          document.querySelectorAll('[data-prism-line="' + numericLine + '"]')
        );
        if (candidates.length === 0) return null;

        let bestByArea = null;
        let bestByAreaSize = Infinity;
        let bestByAreaDepth = -1;
        let bestFallback = null;
        let bestFallbackDepth = -1;

        candidates.forEach(function(candidate) {
          if (!candidate || candidate === document.documentElement || candidate === document.body) {
            return;
          }
          const depth = getNodeDepth(candidate);
          if (depth > bestFallbackDepth) {
            bestFallback = candidate;
            bestFallbackDepth = depth;
          }
          const rect = getOverlayRectForTarget(candidate);
          const area = getRectAreaSafe(rect);
          if (!(area > 0)) return;
          if (
            area < bestByAreaSize ||
            (area === bestByAreaSize && depth > bestByAreaDepth)
          ) {
            bestByArea = candidate;
            bestByAreaSize = area;
            bestByAreaDepth = depth;
          }
        });

        return bestByArea || bestFallback || candidates[0] || null;
      }

      function hasComplexClipShape(target) {
        if (!target || !window.getComputedStyle) return false;
        try {
          const style = window.getComputedStyle(target);
          const clipPath = String(style.clipPath || style.webkitClipPath || "");
          if (clipPath && clipPath !== "none") return true;
          const maskImage = String(style.maskImage || style.webkitMaskImage || "");
          if (maskImage && maskImage !== "none") return true;
        } catch (err) {}
        return false;
      }

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
          ".prism-has-instruction:not(.prism-has-instruction--background).prism-has-instruction--notes-preview,",
          ".prism-has-instruction.prism-has-instruction--editing:not(.prism-has-instruction--background),",
          ".prism-editing-target {",
          "  outline: var(--prism-marker-outline-width) dashed var(--prism-marker-color-rgba) !important;",
          "  outline-offset: var(--prism-marker-outline-offset) !important;",
          "  box-shadow: inset 0 0 0 9999px " + PRISM_PICKER_FILL + " !important;",
          "  filter: none !important;",
          "}",
          ".prism-has-instruction.prism-has-instruction--background.prism-has-instruction--editing {",
          "  outline: none !important;",
          "  box-shadow: inset 0 0 0 9999px " + PRISM_PICKER_FILL + " !important;",
          "}",
          ".prism-svg-instruction-proxy {",
            "  position: fixed;",
            "  z-index: 2147483646;",
            "  pointer-events: none;",
            "  box-sizing: border-box;",
          "  border-radius: 0;",
          "  border: 0;",
          "  transform-origin: center center;",
          "  box-shadow: 0 0 0 var(--prism-marker-outline-width) var(--prism-marker-color-rgba);",
          "}",
          ".prism-svg-instruction-proxy.prism-has-instruction--picker-focus,",
          ".prism-svg-instruction-proxy.prism-has-instruction--notes-preview,",
          ".prism-svg-instruction-proxy.prism-has-instruction--editing {",
          "  outline: var(--prism-marker-outline-width) dashed var(--prism-marker-color-rgba) !important;",
          "  outline-offset: var(--prism-marker-outline-offset) !important;",
          "  box-shadow: inset 0 0 0 9999px " + PRISM_PICKER_FILL + " !important;",
          "  filter: none !important;",
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
          const geometry = resolveInstructionProxyGeometryTarget(target);
          const geometryTarget = geometry && geometry.target ? geometry.target : target;
          const rect = geometry ? geometry.rect : null;
          if (!rect || getRectAreaSafe(rect) <= 0) {
            proxy.style.display = "none";
            return;
          }
          proxy.style.display = "";
          proxy.style.left = rect.left + "px";
          proxy.style.top = rect.top + "px";
          proxy.style.width = rect.width + "px";
          proxy.style.height = rect.height + "px";
          proxy.style.borderRadius = resolveOverlayBorderRadius(geometryTarget);
        });
      }

      function resolveInstructionProxyGeometryTarget(target) {
        const lineRoot = getLineTarget(target);
        let current = target;
        while (current && current.getBoundingClientRect) {
          const rect = getOverlayRectForTarget(current);
          if (rect && getRectAreaSafe(rect) > 0) {
            return {
              target: current,
              rect
            };
          }
          if (lineRoot && current === lineRoot) {
            break;
          }
          const next = current.parentElement;
          if (!next || next === document.body || next === document.documentElement) {
            break;
          }
          current = next;
        }
        if (
          lineRoot &&
          lineRoot !== target &&
          lineRoot.getBoundingClientRect
        ) {
          const lineRect = getOverlayRectForTarget(lineRoot);
          if (lineRect && getRectAreaSafe(lineRect) > 0) {
            return {
              target: lineRoot,
              rect: lineRect
            };
          }
        }
        return {
          target: target,
          rect: null
        };
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
        if (target === document.documentElement || target === document.body) return false;
        if (isSvgTargetElement(target)) return true;
        if (isBackgroundLikeTarget(target)) return true;
        return hasComplexClipShape(target);
      }

      function shouldUsePickerHoverProxy(target) {
        if (!target || !target.tagName) return false;
        if (target === document.documentElement || target === document.body) return false;
        if (isSvgTargetElement(target)) return true;
        if (isBackgroundLikeTarget(target)) return true;
        return hasComplexClipShape(target);
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
          const preferredToken = getInstructionTokenForLine(line);
          const el = getBestElementForLine(line, preferredToken);
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
          if (typeof requestPickerPointerRefresh === "function") {
            requestPickerPointerRefresh(true);
          } else {
            refreshPickerTargetFromPointer(true);
          }
        }
        syncPreviewFocus();
        syncEditingFocus();
        refreshPickerDebugOverlay("markers-applied", prismPickerTarget);
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
        refreshPickerDebugOverlay("frozen-state-updated", prismPickerTarget);
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

      function getTargetToken(target) {
        if (!target || !target.getAttribute) return "";
        const token = normalizeInstructionTokenValue(target.getAttribute("data-prism-token"));
        return token || "";
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

      function getInstructionRecordForLine(line) {
        const key = String(Number(line) || "");
        if (!key || !Object.prototype.hasOwnProperty.call(prismInstructions, key)) {
          return null;
        }
        const value = prismInstructions[key];
        if (value && typeof value === "object") {
          return value;
        }
        return {
          memoText: String(value || ""),
          token: "",
        };
      }

      function getInstructionTokenForLine(line) {
        const record = getInstructionRecordForLine(line);
        if (!record) return "";
        return normalizeInstructionTokenValue(record.token);
      }

      function getPreferredEditingTokenForLine(line) {
        const numericLine = Number(line);
        if (!Number.isFinite(numericLine) || numericLine <= 0) return "";
        if (numericLine === Number(prismEditingLine)) {
          const editingToken = normalizeInstructionTokenValue(prismEditingToken);
          if (editingToken) return editingToken;
        }
        return getInstructionTokenForLine(numericLine);
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
        const preferredToken = getInstructionTokenForLine(numericLine);
        const lineTarget = getBestElementForLine(numericLine, preferredToken);
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

      function getEditingVisualTargetForLine(line) {
        const numericLine = Number(line);
        if (!Number.isFinite(numericLine) || numericLine <= 0) return null;

        if (
          Number.isFinite(prismPointerClientX) &&
          Number.isFinite(prismPointerClientY) &&
          typeof resolveDirectPickTarget === "function"
        ) {
          const resolved = resolveDirectPickTarget(prismPointerClientX, prismPointerClientY);
          const pointerTarget = resolved && resolved.target ? resolved.target : null;
          if (pointerTarget) {
            const pointerLineTarget = getLineTarget(pointerTarget) || pointerTarget;
            const pointerLine = getTargetLine(pointerLineTarget);
            if (pointerLine === numericLine) {
              return pointerTarget;
            }
          }
        }

        const hoverTarget =
          prismPickerVisualState &&
          prismPickerVisualState.hoverTarget &&
          prismPickerVisualState.hoverTarget.isConnected
            ? prismPickerVisualState.hoverTarget
            : null;
        if (hoverTarget) {
          const hoverLineTarget = getLineTarget(hoverTarget) || hoverTarget;
          const hoverLine = getTargetLine(hoverLineTarget);
          if (hoverLine === numericLine) {
            return hoverTarget;
          }
        }

        if (prismPickerTarget && prismPickerTarget.isConnected) {
          const pickerVisualTarget =
            typeof normalizePickerTarget === "function"
              ? normalizePickerTarget(prismPickerTarget) || prismPickerTarget
              : prismPickerTarget;
          const pickerLineTarget = getLineTarget(pickerVisualTarget) || pickerVisualTarget;
          const pickerLine = getTargetLine(pickerLineTarget);
          if (pickerLine === numericLine) {
            return pickerVisualTarget;
          }
        }

        return null;
      }

      function applyEditingFocusTarget(target) {
        if (!target) return false;
        if (shouldUseSvgInstructionProxy(target)) {
          const pickedLineTarget = getLineTarget(target) || target;
          const pickedLine = getTargetLine(pickedLineTarget);
          if (pickedLine) {
            const proxy = ensureSvgInstructionProxy(pickedLine, target);
            if (proxy) {
              if (!hasInstructionForLine(pickedLine)) {
                proxy.dataset.prismHasInstruction = "false";
              }
              setEditingFocusedInstruction(proxy);
              return true;
            }
          }
          return false;
        }
        if (!isSvgTargetElement(target)) {
          const style = window.getComputedStyle(target);
          if (
            style.position === "static" &&
            target !== document.body &&
            target !== document.documentElement
          ) {
            target.style.position = "relative";
            target.dataset.prismEditingSetPosition = "true";
          }
        }
        setEditingFocusedInstruction(target);
        return true;
      }

      function syncEditingFocus() {
        if (!prismEditingLine || prismEditingLine <= 0) {
          clearEditingFocusedInstruction();
          return;
        }

        const rememberedTarget = getRememberedPickedVisualTarget(prismEditingLine);
        if (rememberedTarget && applyEditingFocusTarget(rememberedTarget)) {
          return;
        }

        const liveVisualTarget = getEditingVisualTargetForLine(prismEditingLine);
        if (liveVisualTarget) {
          rememberPickedVisualTarget(prismEditingLine, liveVisualTarget);
          if (applyEditingFocusTarget(liveVisualTarget)) {
            return;
          }
        }

        const marker = getInstructionMarkerForLine(prismEditingLine);
        if (marker) {
          setEditingFocusedInstruction(marker);
          return;
        }

        const preferredToken = getPreferredEditingTokenForLine(prismEditingLine);
        const lineTarget = getBestElementForLine(prismEditingLine, preferredToken);
        if (!lineTarget) {
          clearEditingFocusedInstruction();
          return;
        }
        if (!applyEditingFocusTarget(lineTarget)) {
          clearEditingFocusedInstruction();
        }
      }


`;
