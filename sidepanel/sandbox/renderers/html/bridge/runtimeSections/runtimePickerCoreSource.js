export const SNAPSHOT_RUNTIME_PICKER_CORE_SOURCE = `
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

      function getRectArea(rect) {
        if (!rect) return 0;
        const width = Number(rect.width) || 0;
        const height = Number(rect.height) || 0;
        if (width <= 0 || height <= 0) return 0;
        return width * height;
      }

      function getNodeDepth(node) {
        let depth = 0;
        let current = node;
        while (current && current.parentElement) {
          depth += 1;
          current = current.parentElement;
        }
        return depth;
      }

      function isSvgRootElement(node) {
        if (!isSvgTargetElement(node)) return false;
        const tag = String(node.tagName || "").toLowerCase();
        return tag === "svg";
      }

      function findSvgDescendantTargetAtPoint(svgRoot, x, y) {
        if (!svgRoot || !svgRoot.querySelectorAll) return null;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const descendants = Array.from(svgRoot.querySelectorAll("[data-prism-line]"));
        if (descendants.length === 0) return null;

        let best = null;
        for (const node of descendants) {
          if (!isSvgTargetElement(node)) continue;
          const tag = String(node.tagName || "").toLowerCase();
          if (tag === "svg") continue;
          const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
          const area = getRectArea(rect);
          if (!rect || area <= 0) continue;
          if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
          const depth = getNodeDepth(node);
          if (
            !best ||
            area < best.area ||
            (area === best.area && depth > best.depth)
          ) {
            best = { node, area, depth };
          }
        }
        return best ? best.node : null;
      }

      function shouldSkipPickerElement(target) {
        if (!target || !target.getAttribute) return true;
        if (target.getAttribute("data-prism-picker-hover-proxy") === "true") return true;
        if (target.getAttribute("data-prism-svg-instruction-proxy") === "true") return true;
        if (isDebugOverlayEventTarget(target)) return true;
        return false;
      }

      function resolveLineCandidateTarget(sourceEl, x, y) {
        const lineTarget = getLineTarget(sourceEl);
        if (!lineTarget) return null;
        if (isSvgRootElement(lineTarget)) {
          const svgDescendant = findSvgDescendantTargetAtPoint(lineTarget, x, y);
          if (svgDescendant) return svgDescendant;
        }
        return sourceEl;
      }

      function pickPrimaryLineCandidate(elements, x, y) {
        if (!elements || elements.length === 0) return null;
        for (let i = 0; i < elements.length; i += 1) {
          const sourceEl = elements[i];
          if (!sourceEl || shouldSkipPickerElement(sourceEl)) continue;
          if (!getLineTarget(sourceEl)) continue;
          const resolved = resolveLineCandidateTarget(sourceEl, x, y);
          if (resolved) return resolved;
        }
        return null;
      }

      function pickSmallerInnerLineCandidate(elements, baseLineTarget, baseArea, x, y) {
        if (!elements || elements.length === 0) return null;
        if (!baseLineTarget) return null;
        if (!Number.isFinite(baseArea) || baseArea <= 0) return null;

        let best = null;
        for (let i = 0; i < elements.length; i += 1) {
          const sourceEl = elements[i];
          if (!sourceEl || shouldSkipPickerElement(sourceEl)) continue;
          const lineTarget = getLineTarget(sourceEl);
          if (!lineTarget || lineTarget === baseLineTarget) continue;
          if (isBackgroundLikeTarget(lineTarget)) continue;
          const resolved = resolveLineCandidateTarget(sourceEl, x, y);
          if (!resolved || !resolved.getBoundingClientRect) continue;
          const area = getRectArea(resolved.getBoundingClientRect());
          if (area <= 0) continue;
          if (area >= baseArea * 0.82) continue;
          if (!best || area < best.area) {
            best = {
              target: resolved,
              area
            };
          }
        }
        return best ? best.target : null;
      }

      function chooseVisualHoverTarget(target, lineTarget) {
        if (target && target !== document.documentElement && target !== document.body) {
          return target;
        }
        return lineTarget || target || null;
      }

      function rememberPickedVisualTarget(line, target) {
        const numericLine = Number(line);
        if (!Number.isFinite(numericLine) || numericLine <= 0 || !target) return;
        prismPickedVisualTargetsByLine.set(String(numericLine), target);
      }

      function getRememberedPickedVisualTarget(line) {
        const key = String(Number(line) || "");
        if (!key) return null;
        const target = prismPickedVisualTargetsByLine.get(key);
        if (!target || !target.isConnected) {
          prismPickedVisualTargetsByLine.delete(key);
          return null;
        }
        const lineTarget = getLineTarget(target);
        const targetLine = lineTarget ? getTargetLine(lineTarget) : null;
        if (targetLine !== Number(line)) {
          prismPickedVisualTargetsByLine.delete(key);
          return null;
        }
        return target;
      }

      function prunePickedVisualTargetCache() {
        prismPickedVisualTargetsByLine.forEach(function(target, key) {
          if (!target || !target.isConnected) {
            prismPickedVisualTargetsByLine.delete(key);
            return;
          }
          const lineTarget = getLineTarget(target);
          const targetLine = lineTarget ? getTargetLine(lineTarget) : null;
          if (!targetLine || !hasInstructionForLine(targetLine)) {
            // Keep only active lines or currently editing line.
            if (Number(key) !== Number(prismEditingLine)) {
              prismPickedVisualTargetsByLine.delete(key);
            }
          }
        });
      }

      function normalizePickerTarget(target) {
        const lineTarget = getLineTarget(target);
        return chooseVisualHoverTarget(target, lineTarget);
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

      function resolvePickerVisualState(target) {
        if (!prismPickerActive) return createIdlePickerVisualState();
        const hoverState = resolvePickerHoverState(target);
        if (!hoverState || !hoverState.visualTarget) {
          return createIdlePickerVisualState();
        }
        if (
          Number.isFinite(prismEditingLine) &&
          prismEditingLine > 0 &&
          Number(hoverState.line) === Number(prismEditingLine)
        ) {
          return {
            mode: PICKER_VISUAL_MODE.SUPPRESSED,
            line: hoverState.line || null,
            hoverTarget: null,
            focusTarget: null
          };
        }
        if (hoverState.instructionMarker) {
          return {
            mode: PICKER_VISUAL_MODE.FOCUS_MEMO,
            line: hoverState.line || null,
            hoverTarget: null,
            focusTarget: hoverState.instructionMarker
          };
        }
        const isBackgroundTarget = isBackgroundLikeTarget(hoverState.visualTarget);
        const useHoverProxy = shouldUsePickerHoverProxy(hoverState.visualTarget);
        if (isBackgroundTarget && !hasInstructionForLine(hoverState.line) && !useHoverProxy) {
          return {
            mode: PICKER_VISUAL_MODE.SUPPRESSED,
            line: hoverState.line || null,
            hoverTarget: null,
            focusTarget: null
          };
        }
        return {
          mode: PICKER_VISUAL_MODE.HOVER,
          line: hoverState.line || null,
          hoverTarget: hoverState.visualTarget,
          focusTarget: null
        };
      }

      function isSamePickerVisualState(a, b) {
        if (!a || !b) return false;
        return (
          a.mode === b.mode &&
          a.line === b.line &&
          a.hoverTarget === b.hoverTarget &&
          a.focusTarget === b.focusTarget
        );
      }

      function applyPickerVisualState(nextState) {
        const next = nextState || createIdlePickerVisualState();
        if (isSamePickerVisualState(prismPickerVisualState, next)) {
          if (next.mode === PICKER_VISUAL_MODE.HOVER && next.hoverTarget) {
            reconcilePickerHoverTarget(next.hoverTarget);
          } else if (next.mode === PICKER_VISUAL_MODE.FOCUS_MEMO && next.focusTarget) {
            if (
              next.focusTarget.classList &&
              !next.focusTarget.classList.contains("prism-has-instruction--picker-focus")
            ) {
              setPickerFocusedInstruction(next.focusTarget);
            }
          }
          refreshPickerDebugOverlay(
            "visual-state-reconciled",
            next.hoverTarget || next.focusTarget || prismPickerTarget
          );
          return;
        }

        if (next.mode === PICKER_VISUAL_MODE.FOCUS_MEMO && next.focusTarget) {
          clearPickerHoverTarget();
          setPickerFocusedInstruction(next.focusTarget);
        } else if (next.mode === PICKER_VISUAL_MODE.HOVER && next.hoverTarget) {
          clearPickerFocusedInstruction();
          setPickerHoverTarget(next.hoverTarget);
        } else {
          clearPickerHoverTarget();
          clearPickerFocusedInstruction();
        }

        prismPickerVisualState = next;
        refreshPickerDebugOverlay(
          "visual-state-updated",
          next.hoverTarget || next.focusTarget || prismPickerTarget
        );
      }

      function clearPickerVisualState() {
        clearPickerHoverTarget();
        clearPickerFocusedInstruction();
        prismPickerVisualState = createIdlePickerVisualState();
      }

      function refreshPickerVisualState(target) {
        applyPickerVisualState(resolvePickerVisualState(target));
      }

      function resolvePickerClickTarget(clientX, clientY) {
        if (
          prismPickerVisualState &&
          prismPickerVisualState.mode === PICKER_VISUAL_MODE.HOVER &&
          prismPickerVisualState.hoverTarget &&
          prismPickerVisualState.hoverTarget.isConnected
        ) {
          return prismPickerVisualState.hoverTarget;
        }
        if (prismPickerTarget && prismPickerTarget.isConnected) {
          return prismPickerTarget;
        }
        return findTargetAt(clientX, clientY);
      }

      function resolvePickerClickLine(target) {
        if (
          prismPickerVisualState &&
          prismPickerVisualState.mode === PICKER_VISUAL_MODE.HOVER &&
          prismPickerVisualState.hoverTarget === target
        ) {
          const hoverLine = Number(prismPickerVisualState.line);
          if (Number.isFinite(hoverLine) && hoverLine > 0) {
            return hoverLine;
          }
        }
        const lineTarget = getLineTarget(target);
        return getTargetLine(lineTarget || target) || 1;
      }

      function clearPickerHoverFeedback() {
        clearPickerVisualState();
      }

      function ensurePickerHoverProxy() {
        if (prismPickerHoverProxy && prismPickerHoverProxy.isConnected) {
          return prismPickerHoverProxy;
        }
        const proxy = document.createElement("div");
        proxy.className = "prism-picker-hover-proxy";
        proxy.dataset.prismPickerHoverProxy = "true";
        document.documentElement.appendChild(proxy);
        prismPickerHoverProxy = proxy;
        return proxy;
      }

      function clearPickerHoverProxy() {
        prismPickerHoverProxySource = null;
        if (!prismPickerHoverProxy) return;
        prismPickerHoverProxy.remove();
        prismPickerHoverProxy = null;
      }

      function resolveProxyGeometryTarget(target) {
        let current = target;
        while (current && current.getBoundingClientRect) {
          const rect = current.getBoundingClientRect();
          if (rect && (rect.width || rect.height)) {
            return {
              target: current,
              rect
            };
          }
          const next = current.parentElement;
          if (!next || next === document.body || next === document.documentElement) {
            break;
          }
          current = next;
        }
        return {
          target,
          rect: null
        };
      }

      function syncPickerHoverProxy(target) {
        if (!target || !target.isConnected || !target.getBoundingClientRect) {
          clearPickerHoverProxy();
          return null;
        }
        const geometry = resolveProxyGeometryTarget(target);
        const rect = geometry ? geometry.rect : null;
        const geometryTarget = geometry && geometry.target ? geometry.target : target;
        const proxy = ensurePickerHoverProxy();
        if (!rect || (!rect.width && !rect.height)) {
          proxy.style.display = "none";
          prismPickerHoverProxySource = target;
          return proxy;
        }
        proxy.style.display = "";
        proxy.style.left = rect.left + "px";
        proxy.style.top = rect.top + "px";
        proxy.style.width = rect.width + "px";
        proxy.style.height = rect.height + "px";
        proxy.style.borderRadius = resolveOverlayBorderRadius(geometryTarget);
        prismPickerHoverProxySource = target;
        return proxy;
      }

      function clearPickerHoverTarget() {
        if (prismPickerHoverTarget && prismPickerHoverTarget.classList) {
          prismPickerHoverTarget.classList.remove("prism-picker-hover");
          prismPickerHoverTarget.classList.remove("prism-picker-hover--background");
        }
        prismPickerHoverTarget = null;
        clearPickerHoverProxy();
      }

      function setPickerHoverTarget(target) {
        if (!target || !target.classList) {
          clearPickerHoverTarget();
          return;
        }

        const useProxy = shouldUsePickerHoverProxy(target);
        const keepCurrentDirectTarget =
          !useProxy &&
          prismPickerHoverTarget === target &&
          prismPickerHoverTarget.isConnected;
        const keepCurrentProxyTarget =
          useProxy &&
          prismPickerHoverProxy &&
          prismPickerHoverProxy.isConnected &&
          prismPickerHoverTarget === prismPickerHoverProxy &&
          prismPickerHoverProxySource === target;
        const canReuseCurrentTarget = keepCurrentDirectTarget || keepCurrentProxyTarget;

        // Important: clear previous hover target before creating/syncing proxy.
        // If we clear after proxy creation, non-proxy -> proxy transition can
        // remove the just-created proxy and leave visual state without overlay.
        if (!canReuseCurrentTarget && prismPickerHoverTarget) {
          clearPickerHoverTarget();
        }

        const markerTarget = useProxy ? syncPickerHoverProxy(target) : target;
        if (!markerTarget) {
          clearPickerHoverTarget();
          return;
        }
        prismPickerHoverTarget = markerTarget;
        prismPickerHoverTarget.classList.add("prism-picker-hover");
        prismPickerHoverTarget.classList.toggle(
          "prism-picker-hover--background",
          isBackgroundLikeTarget(target)
        );
      }

      function reconcilePickerHoverTarget(target) {
        if (!target || !target.classList) return;
        const useProxy = shouldUsePickerHoverProxy(target);
        if (useProxy) {
          const proxyMissing = !prismPickerHoverProxy || !prismPickerHoverProxy.isConnected;
          const wrongSource = prismPickerHoverProxySource !== target;
          const wrongHoverTarget = prismPickerHoverTarget !== prismPickerHoverProxy;
          const missingHoverClass =
            !prismPickerHoverProxy ||
            !prismPickerHoverProxy.classList ||
            !prismPickerHoverProxy.classList.contains("prism-picker-hover");
          if (proxyMissing || wrongSource || wrongHoverTarget || missingHoverClass) {
            setPickerHoverTarget(target);
            return;
          }
          syncPickerHoverProxy(target);
          prismPickerHoverProxy.classList.add("prism-picker-hover");
          prismPickerHoverProxy.classList.toggle(
            "prism-picker-hover--background",
            isBackgroundLikeTarget(target)
          );
          return;
        }

        const missingHoverClass =
          !target.classList || !target.classList.contains("prism-picker-hover");
        const wrongHoverTarget = prismPickerHoverTarget !== target;
        if (missingHoverClass || wrongHoverTarget) {
          setPickerHoverTarget(target);
          return;
        }
        prismPickerHoverTarget.classList.toggle(
          "prism-picker-hover--background",
          isBackgroundLikeTarget(target)
        );
      }

      function invalidatePickerPointerState() {
        prismPointerInside = false;
        prismPointerClientX = null;
        prismPointerClientY = null;
        prismPickerTarget = null;
        clearPickerHoverFeedback();
        refreshPickerDebugOverlay("pointer-invalidated", null);
      }

      function refreshPickerTargetFromPointer(forceUpdate) {
        if (!prismPickerActive) {
          refreshPickerDebugOverlay("pointer-refresh-while-inactive", null);
          return;
        }
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
        if (prismPickerTarget === nextTarget && !forceUpdate) {
          // Even when the pointer stays on the same element, visual state can be
          // cleared by external state transitions (edit/preview/freeze updates).
          // Re-run visual resolution so hover/proxy feedback can recover.
          refreshPickerVisualState(nextTarget);
          refreshPickerDebugOverlay("pointer-stable-refresh", nextTarget);
          return;
        }
        prismPickerTarget = nextTarget;
        refreshPickerVisualState(nextTarget);
        refreshPickerDebugOverlay("pointer-target-updated", nextTarget);
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
          ".prism-picker-hover-proxy {",
          "  position: fixed;",
          "  z-index: 2147483647;",
          "  pointer-events: none;",
          "  box-sizing: border-box;",
          "  border-radius: var(--prism-marker-focus-radius);",
          "}",
          ".prism-picker-hover:not(.prism-picker-hover--background) {",
          "  outline: var(--prism-marker-outline-width) dashed var(--prism-marker-color-rgba) !important;",
          "  outline-offset: var(--prism-marker-outline-offset) !important;",
          "  box-shadow: inset 0 0 0 9999px " + PRISM_PICKER_FILL + " !important;",
          "}",
          ".prism-picker-hover.prism-picker-hover--background {",
          "  outline: none !important;",
          "  box-shadow: none !important;",
          "}",
          ".prism-picker-hover.prism-editing-target,",
          ".prism-picker-hover.prism-has-instruction--editing {",
          "  outline: none !important;",
          "  box-shadow: none !important;",
          "  filter: none !important;",
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
          "svg, svg * {",
          "  pointer-events: all !important;",
          "}",
          "svg[data-prism-line], [data-prism-line] svg {",
          "  pointer-events: all !important;",
          "}",
          "[data-prism-picker-hover-proxy='true'] {",
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
            refreshPickerDebugOverlay("picker-unsupported", null);
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
        refreshPickerDebugOverlay("picker-active-changed", prismPickerTarget);
      }

      function applyUiState(nextState) {
        const safeState = nextState || {};
        const previewLine = Number(safeState.previewLine);
        const editingLine = Number(safeState.editingLine);
        prismSettings = normalizeSettings(safeState.settings);
        setPickerDebugOverlayEnabled(prismSettings.debugPickerOverlay);
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
        refreshPickerDebugOverlay("ui-state-applied", prismPickerTarget);
      }

      function findTargetAt(x, y) {
        const elements = document.elementsFromPoint(x, y);
        if (!elements || elements.length === 0) {
          setPickerTargetResolutionDebug({
            x: roundDebugNumber(x, 1),
            y: roundDebugNumber(y, 1),
            branch: "empty-elements-from-point",
            selected: null
          });
          return null;
        }
        const pickableElements = elements.filter(el => Boolean(el));
        if (pickableElements.length === 0) {
          setPickerTargetResolutionDebug({
            x: roundDebugNumber(x, 1),
            y: roundDebugNumber(y, 1),
            branch: "empty-pickable-elements",
            selected: null
          });
          return null;
        }

        const primaryTarget = pickPrimaryLineCandidate(pickableElements, x, y);
        if (primaryTarget) {
          const primaryLineTarget = getLineTarget(primaryTarget) || primaryTarget;
          const primaryArea = primaryTarget.getBoundingClientRect
            ? getRectArea(primaryTarget.getBoundingClientRect())
            : 0;
          const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
          const shouldRefineForInnerTarget =
            isBackgroundLikeTarget(primaryLineTarget) ||
            primaryArea >= viewportArea * 0.18;

          if (shouldRefineForInnerTarget) {
            const refinedTarget = pickSmallerInnerLineCandidate(
              pickableElements,
              primaryLineTarget,
              primaryArea,
              x,
              y
            );
            if (refinedTarget) {
              setPickerTargetResolutionDebug({
                x: roundDebugNumber(x, 1),
                y: roundDebugNumber(y, 1),
                branch: "refined-smaller-inner",
                selected: describeDebugElement(refinedTarget, true),
                primary: describeDebugElement(primaryTarget, true),
                topCandidates: pickableElements
                  .slice(0, 8)
                  .map(function(el) { return describeDebugElement(el, true); })
                  .filter(Boolean)
              });
              return refinedTarget;
            }
          }

          setPickerTargetResolutionDebug({
            x: roundDebugNumber(x, 1),
            y: roundDebugNumber(y, 1),
            branch: "primary-line-candidate",
            selected: describeDebugElement(primaryTarget, true),
            topCandidates: pickableElements
              .slice(0, 8)
              .map(function(el) { return describeDebugElement(el, true); })
              .filter(Boolean)
          });
          return primaryTarget;
        }

        // Fallback to the first visible non-root element.
        for (const el of pickableElements) {
          if (el === document.documentElement || el === document.body) continue;
          if (shouldSkipPickerElement(el)) continue;
          setPickerTargetResolutionDebug({
            x: roundDebugNumber(x, 1),
            y: roundDebugNumber(y, 1),
            branch: "fallback-first-visible",
            selected: describeDebugElement(el, true),
            topCandidates: pickableElements
              .slice(0, 8)
              .map(function(node) { return describeDebugElement(node, true); })
              .filter(Boolean)
          });
          return el;
        }

        setPickerTargetResolutionDebug({
          x: roundDebugNumber(x, 1),
          y: roundDebugNumber(y, 1),
          branch: "fallback-first-raw",
          selected: describeDebugElement(pickableElements[0] || null, true),
          topCandidates: pickableElements
            .slice(0, 8)
            .map(function(node) { return describeDebugElement(node, true); })
            .filter(Boolean)
        });
        return pickableElements[0] || null;
      }


`;
