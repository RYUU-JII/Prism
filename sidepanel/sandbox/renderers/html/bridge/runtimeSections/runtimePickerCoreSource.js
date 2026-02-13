export const SNAPSHOT_RUNTIME_PICKER_CORE_SOURCE = `
      function normalizeNavigateToken(token) {
        if (typeof normalizeInstructionTokenValue === "function") {
          return normalizeInstructionTokenValue(token);
        }
        const raw = String(token || "").trim();
        if (!raw) return "";
        if (!/^[A-Za-z0-9:_-]{1,64}$/.test(raw)) return "";
        return raw;
      }

      function resolveInstructionTokenForSelection(line, target, preferredToken) {
        const lineTarget = getLineTarget(target) || target;
        if (typeof getTargetToken === "function") {
          const targetToken = getTargetToken(lineTarget);
          if (targetToken) return targetToken;
        }
        const normalizedPreferred = normalizeNavigateToken(preferredToken);
        if (normalizedPreferred) return normalizedPreferred;
        if (typeof getInstructionTokenForLine === "function") {
          const tokenFromLine = normalizeNavigateToken(getInstructionTokenForLine(line));
          if (tokenFromLine) return tokenFromLine;
        }
        return "";
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

      function emitNavigateSelection(line, target, preferredToken) {
        if (!target || !target.getBoundingClientRect) {
          postNavigateMiss(line, "吏?뺥븳 硫붾え ????붿냼瑜?李얠? 紐삵뻽?듬땲??");
          return;
        }
        const rect = target.getBoundingClientRect();
        const token = resolveInstructionTokenForSelection(line, target, preferredToken);
        try {
          parent.postMessage(
            {
              type: "PRISM_PICKER_SELECT",
              line: Number(line) || 1,
              token,
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

      function navigateToInstruction(line, behavior, token) {
        const numericLine = Number(line);
        if (!Number.isFinite(numericLine) || numericLine <= 0) {
          postNavigateMiss(line, "?섎せ??硫붾え ?쇱씤?낅땲??");
          return;
        }

        const preferredToken = normalizeNavigateToken(token);
        const target =
          typeof getBestElementForLine === "function"
            ? getBestElementForLine(numericLine, preferredToken)
            : document.querySelector('[data-prism-line="' + numericLine + '"]');
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

        const resolveCurrentTarget = function() {
          if (typeof getBestElementForLine === "function") {
            const next = getBestElementForLine(numericLine, preferredToken);
            if (next) return next;
          }
          return target;
        };

        if (scrollBehavior === "smooth") {
          window.setTimeout(function() {
            emitNavigateSelection(numericLine, resolveCurrentTarget(), preferredToken);
          }, 240);
          return;
        }
        const raf = nativeRequestAnimationFrame || window.requestAnimationFrame;
        if (raf) {
          raf(function() {
            emitNavigateSelection(numericLine, resolveCurrentTarget(), preferredToken);
          });
          return;
        }
        emitNavigateSelection(numericLine, resolveCurrentTarget(), preferredToken);
      }

      function getRectArea(rect) {
        if (!rect) return 0;
        const width = Number(rect.width) || 0;
        const height = Number(rect.height) || 0;
        if (width <= 0 || height <= 0) return 0;
        return width * height;
      }

      function shouldSkipPickerElement(target) {
        if (!target || !target.getAttribute) return true;
        if (target.getAttribute("data-prism-picker-hover-proxy") === "true") return true;
        if (target.getAttribute("data-prism-svg-instruction-proxy") === "true") return true;
        if (isDebugOverlayEventTarget(target)) return true;
        return false;
      }

      function resolveDirectLineCandidate(sourceEl) {
        if (!sourceEl) return null;
        if (sourceEl === document.documentElement || sourceEl === document.body) return null;
        if (shouldSkipPickerElement(sourceEl)) return null;
        return sourceEl;
      }

      function collectDirectPickSampleOffsets() {
        return [
          { dx: 0, dy: 0 },
          { dx: 2, dy: 0 },
          { dx: -2, dy: 0 },
          { dx: 0, dy: 2 },
          { dx: 0, dy: -2 },
          { dx: 2, dy: 2 },
          { dx: -2, dy: -2 },
          { dx: 2, dy: -2 },
          { dx: -2, dy: 2 },
          { dx: 4, dy: 0 },
          { dx: -4, dy: 0 },
          { dx: 0, dy: 4 },
          { dx: 0, dy: -4 },
          { dx: 4, dy: 4 },
          { dx: -4, dy: -4 },
          { dx: 4, dy: -4 },
          { dx: -4, dy: 4 }
        ];
      }

      function getDistanceSq(x1, y1, x2, y2) {
        const dx = (Number(x1) || 0) - (Number(x2) || 0);
        const dy = (Number(y1) || 0) - (Number(y2) || 0);
        return dx * dx + dy * dy;
      }

      function resolveDirectPickTarget(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return { target: null, branch: "direct-hit-invalid-point", samples: [] };
        }

        const samples = [];
        const seen = new Set();

        function addSample(sourceEl, sx, sy, sourceKind) {
          const candidate = resolveDirectLineCandidate(sourceEl);
          if (!candidate || seen.has(candidate)) return;
          seen.add(candidate);
          const rect = getOverlayRectForTarget(candidate);
          const area = getRectArea(rect);
          const lineTarget = getLineTarget(candidate);
          samples.push({
            candidate,
            area,
            x: sx,
            y: sy,
            sourceKind,
            hasLineTarget: Boolean(lineTarget)
          });
        }

        if (document.elementFromPoint) {
          const direct = document.elementFromPoint(x, y);
          addSample(direct, x, y, "elementFromPoint");
        }

        const offsets = collectDirectPickSampleOffsets();
        for (let i = 0; i < offsets.length; i += 1) {
          if (!document.elementFromPoint) break;
          const sx = x + offsets[i].dx;
          const sy = y + offsets[i].dy;
          const sample = document.elementFromPoint(sx, sy);
          addSample(sample, sx, sy, i === 0 ? "center-sample" : "micro-sample");
        }

        if (samples.length === 0 && document.elementsFromPoint) {
          const stack = document.elementsFromPoint(x, y) || [];
          for (let i = 0; i < stack.length; i += 1) {
            addSample(stack[i], x, y, "elementsFromPoint");
          }
        }

        if (samples.length === 0) {
          return { target: null, branch: "direct-hit-no-candidate", samples };
        }

        function pickBestSample(requireLineTarget) {
          let bestNonZero = null;
          for (let i = 0; i < samples.length; i += 1) {
            const item = samples[i];
            if (requireLineTarget && !item.hasLineTarget) continue;
            if (!(item.area > 0)) continue;
            if (!bestNonZero) {
              bestNonZero = item;
              continue;
            }
            if (item.area < bestNonZero.area) {
              bestNonZero = item;
              continue;
            }
            if (
              item.area === bestNonZero.area &&
              getDistanceSq(item.x, item.y, x, y) < getDistanceSq(bestNonZero.x, bestNonZero.y, x, y)
            ) {
              bestNonZero = item;
            }
          }
          if (bestNonZero) return bestNonZero;

          for (let i = 0; i < samples.length; i += 1) {
            const item = samples[i];
            if (requireLineTarget && !item.hasLineTarget) continue;
            return item;
          }
          return null;
        }

        const bestLineSample = pickBestSample(true);
        if (bestLineSample) {
          return {
            target: bestLineSample.candidate,
            branch: "direct-hit-line-target",
            samples
          };
        }

        const bestAnySample = pickBestSample(false);
        if (!bestAnySample) {
          return { target: null, branch: "direct-hit-no-candidate-after-filter", samples };
        }

        return {
          target: bestAnySample.candidate,
          branch: "direct-hit-fallback-unmapped",
          samples
        };
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

      function resolveHoverStateToken(hoverState) {
        if (!hoverState) return "";
        const tokenTarget = hoverState.lineTarget || hoverState.visualTarget || null;
        if (!tokenTarget || typeof getTargetToken !== "function") return "";
        return normalizeNavigateToken(getTargetToken(tokenTarget));
      }

      function getActiveEditingToken() {
        const fromUiState = normalizeNavigateToken(prismEditingToken);
        if (fromUiState) return fromUiState;
        if (
          Number.isFinite(prismEditingLine) &&
          prismEditingLine > 0 &&
          typeof getInstructionTokenForLine === "function"
        ) {
          return normalizeNavigateToken(getInstructionTokenForLine(prismEditingLine));
        }
        return "";
      }

      function resolveOverlayBorderRadius(target) {
        return "0px";
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
          const editingToken = getActiveEditingToken();
          const hoverToken = resolveHoverStateToken(hoverState);
          const shouldSuppress = editingToken ? hoverToken === editingToken : true;
          if (shouldSuppress) {
            return {
              mode: PICKER_VISUAL_MODE.SUPPRESSED,
              line: hoverState.line || null,
              hoverTarget: null,
              focusTarget: null
            };
          }
        }
        if (hoverState.instructionMarker) {
          return {
            mode: PICKER_VISUAL_MODE.FOCUS_MEMO,
            line: hoverState.line || null,
            hoverTarget: null,
            focusTarget: hoverState.instructionMarker
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
        return getTargetLine(lineTarget || target) || null;
      }

      function resolvePickerClickToken(target, line) {
        const lineTarget = getLineTarget(target) || target;
        if (typeof getTargetToken === "function") {
          const directToken = getTargetToken(lineTarget);
          if (directToken) return directToken;
        }
        const numericLine = Number(line);
        if (Number.isFinite(numericLine) && numericLine > 0) {
          return normalizeNavigateToken(
            typeof getInstructionTokenForLine === "function"
              ? getInstructionTokenForLine(numericLine)
              : ""
          );
        }
        return "";
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
        prismPickerHoverTarget.classList.remove("prism-picker-hover--background");
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
          prismPickerHoverProxy.classList.remove("prism-picker-hover--background");
          return;
        }

        const missingHoverClass =
          !target.classList || !target.classList.contains("prism-picker-hover");
        const wrongHoverTarget = prismPickerHoverTarget !== target;
        if (missingHoverClass || wrongHoverTarget) {
          setPickerHoverTarget(target);
          return;
        }
        prismPickerHoverTarget.classList.remove("prism-picker-hover--background");
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
        prismPickerRefreshForce = false;
      }

      function requestPickerPointerRefresh(forceUpdate) {
        if (!prismPickerActive) return;
        if (forceUpdate) {
          prismPickerRefreshForce = true;
        }
        if (prismPickerTrackingRaf !== null) return;
        const raf = nativeRequestAnimationFrame || window.requestAnimationFrame;
        if (!raf) {
          const forced = Boolean(prismPickerRefreshForce);
          prismPickerRefreshForce = false;
          refreshPickerTargetFromPointer(forced);
          return;
        }
        prismPickerTrackingRaf = raf(function() {
          prismPickerTrackingRaf = null;
          const forced = Boolean(prismPickerRefreshForce);
          prismPickerRefreshForce = false;
          refreshPickerTargetFromPointer(forced);
        });
      }

      function startPickerTracking() {
        requestPickerPointerRefresh(true);
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

        if (prismPickerActive === nextActive) {
          if (prismPickerActive) {
            requestPickerPointerRefresh(true);
          }
          syncPreviewFocus();
          updateInteractionLock();
          refreshPickerDebugOverlay("picker-active-unchanged", prismPickerTarget);
          return;
        }

        prismPickerActive = nextActive;
        document.body.style.cursor = prismPickerActive ? "crosshair" : "";
        if (prismPickerActive) {
          ensurePickerPointerStyles();
          ensurePickerHoverStyles();
          startPickerTracking();
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

      function normalizeInstructionMapValue(value) {
        if (value && typeof value === "object") {
          return {
            memoText: String(value.memoText ?? value.text ?? ""),
            token: normalizeNavigateToken(value.token)
          };
        }
        return {
          memoText: String(value || ""),
          token: ""
        };
      }

      function areInstructionMapsEqual(a, b) {
        const left = a && typeof a === "object" ? a : {};
        const right = b && typeof b === "object" ? b : {};
        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        if (leftKeys.length !== rightKeys.length) return false;
        for (let i = 0; i < leftKeys.length; i += 1) {
          const key = leftKeys[i];
          if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
          const leftValue = normalizeInstructionMapValue(left[key]);
          const rightValue = normalizeInstructionMapValue(right[key]);
          if (leftValue.memoText !== rightValue.memoText) return false;
          if (leftValue.token !== rightValue.token) return false;
        }
        return true;
      }

      function areSettingsEqual(a, b) {
        const left = a && typeof a === "object" ? a : {};
        const right = b && typeof b === "object" ? b : {};
        return JSON.stringify(left) === JSON.stringify(right);
      }

      function applyUiState(nextState) {
        const safeState = nextState || {};
        const previewLine = Number(safeState.previewLine);
        const editingLine = Number(safeState.editingLine);
        const editingToken = normalizeNavigateToken(safeState.editingToken);
        const nextSettings = normalizeSettings(safeState.settings);
        const nextViewMode = Boolean(safeState.isViewMode);
        const nextInstructions =
          safeState.instructions && typeof safeState.instructions === "object"
            ? safeState.instructions
            : {};
        const nextPreviewLine =
          Number.isFinite(previewLine) && previewLine > 0
            ? previewLine
            : null;
        const nextEditingLine =
          Number.isFinite(editingLine) && editingLine > 0
            ? editingLine
            : null;
        const resolvedPreviewLine = nextViewMode ? null : nextPreviewLine;
        const resolvedEditingLine = nextViewMode ? null : nextEditingLine;
        const resolvedEditingToken =
          nextViewMode || !resolvedEditingLine
            ? null
            : editingToken || null;
        const nextPickerActive = Boolean(safeState.pickerActive);
        const nextFrozen = Boolean(safeState.frozen);

        const settingsChanged = !areSettingsEqual(prismSettings, nextSettings);
        const viewModeChanged = prismViewMode !== nextViewMode;
        const instructionsChanged = !areInstructionMapsEqual(prismInstructions, nextInstructions);
        const previewChanged = prismPreviewLine !== resolvedPreviewLine;
        const editingChanged = prismEditingLine !== resolvedEditingLine;
        const editingTokenChanged = prismEditingToken !== resolvedEditingToken;
        const pickerChanged = prismPickerActive !== (nextPickerActive && !nextViewMode);
        const frozenChanged = prismFrozen !== nextFrozen;

        prismSettings = nextSettings;
        setPickerDebugOverlayEnabled(prismSettings.debugPickerOverlay);
        if (settingsChanged) {
          applyVisualSettings();
        }

        prismViewMode = nextViewMode;
        prismInstructions = nextInstructions;
        prismPreviewLine = resolvedPreviewLine;
        prismEditingLine = resolvedEditingLine;
        prismEditingToken = resolvedEditingToken;

        setPickerActive(nextPickerActive);

        if (frozenChanged) {
          setFrozen(nextFrozen);
          refreshPickerDebugOverlay("ui-state-applied", prismPickerTarget);
          return;
        }

        if (
          settingsChanged ||
          viewModeChanged ||
          instructionsChanged ||
          previewChanged ||
          editingChanged ||
          editingTokenChanged ||
          pickerChanged
        ) {
          applyMarkers();
          updateInteractionLock();
          queueRuntimeCapabilities();
        }

        refreshPickerDebugOverlay("ui-state-applied", prismPickerTarget);
      }

      function findTargetAt(x, y) {
        const resolution = resolveDirectPickTarget(x, y);
        const samples = resolution && Array.isArray(resolution.samples) ? resolution.samples : [];
        const debugSamples = samples
          .slice(0, 8)
          .map(function(entry) {
            if (!entry || !entry.candidate) return null;
          const base = describeDebugElement(entry.candidate, true);
          if (!base) return null;
          base.sample = {
            x: roundDebugNumber(entry.x, 1),
            y: roundDebugNumber(entry.y, 1),
            source: entry.sourceKind || ""
          };
          base.sampleArea = roundDebugNumber(entry.area, 1);
          base.sampleHasLine = Boolean(entry.hasLineTarget);
          return base;
        })
          .filter(Boolean);

        if (!resolution || !resolution.target) {
          setPickerTargetResolutionDebug({
            x: roundDebugNumber(x, 1),
            y: roundDebugNumber(y, 1),
            branch: resolution && resolution.branch ? resolution.branch : "direct-hit-none",
            selected: null,
            topCandidates: debugSamples
          });
          return null;
        }

        setPickerTargetResolutionDebug({
          x: roundDebugNumber(x, 1),
          y: roundDebugNumber(y, 1),
          branch: resolution.branch || "direct-hit-selected",
          selected: describeDebugElement(resolution.target, true),
          topCandidates: debugSamples
        });
        return resolution.target;
      }


`;
