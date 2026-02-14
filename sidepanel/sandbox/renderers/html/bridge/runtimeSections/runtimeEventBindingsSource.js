export const SNAPSHOT_RUNTIME_EVENT_BINDINGS_SOURCE = `
      document.addEventListener("mousemove", function(event) {
        if (isDebugOverlayEventTarget(event.target)) return;
        if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
        if (typeof ensurePrismFrameFocus === "function") {
          ensurePrismFrameFocus();
        }
        prismPointerInside = true;
        prismPointerClientX = event.clientX;
        prismPointerClientY = event.clientY;
        if (typeof refreshPickerStatusHud === "function") {
          refreshPickerStatusHud("mousemove");
        }
        if (!prismPickerActive && !prismShiftKeyDown) return;
        if (prismPickerActive) {
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
        if (typeof requestPickerPointerRefresh === "function") {
          requestPickerPointerRefresh(false);
        } else {
          refreshPickerTargetFromPointer();
        }
      }, true);

      document.addEventListener("mouseover", function(event) {
        if (isDebugOverlayEventTarget(event.target)) return;
        if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
        if (typeof ensurePrismFrameFocus === "function") {
          ensurePrismFrameFocus();
        }
        prismPointerInside = true;
        prismPointerClientX = event.clientX;
        prismPointerClientY = event.clientY;
        if (typeof refreshPickerStatusHud === "function") {
          refreshPickerStatusHud("mouseover");
        }
        if (!prismPickerActive && !prismShiftKeyDown) return;
        if (typeof requestPickerPointerRefresh === "function") {
          requestPickerPointerRefresh(false);
        } else {
          refreshPickerTargetFromPointer();
        }
      }, true);

      document.addEventListener("mouseout", function(event) {
        if (event.relatedTarget) return;
        prismPointerInside = false;
        prismPointerClientX = null;
        prismPointerClientY = null;
        if (typeof refreshPickerStatusHud === "function") {
          refreshPickerStatusHud("mouseout");
        }
        if (!prismPickerActive && !prismShiftKeyDown) return;
        invalidatePickerPointerState();
      }, true);

      window.addEventListener("blur", function() {
        const hadTriggerDown = prismShiftKeyDown;
        prismShiftKeyDown = false;
        if (typeof refreshPickerStatusHud === "function") {
          refreshPickerStatusHud("blur");
        }
        if (!prismPickerActive && typeof invalidatePickerPointerState === "function") {
          invalidatePickerPointerState();
        }
        if (hadTriggerDown) {
          try {
            parent.postMessage({ type: "PRISM_SHIFT_PEEK", active: false }, "*");
          } catch (err) {}
        }
      });

      function keyMatchesTrigger(event) {
        const trigger = (prismSettings && prismSettings.pickerTriggerKey) || "Shift";
        if (trigger === "Grave") return event.key === "\`";
        return event.key === trigger;
      }

      function isTriggerKeyDown(event) {
        const trigger = (prismSettings && prismSettings.pickerTriggerKey) || "Shift";
        if (trigger === "Shift") return event.shiftKey;
        if (trigger === "Alt") return event.altKey;
        if (trigger === "Control") return event.ctrlKey;
        if (trigger === "Grave") return event.key === "\`";
        return false;
      }

      document.addEventListener("keydown", function(event) {
        if (!keyMatchesTrigger(event)) return;
        prismShiftKeyDown = true;
        if (typeof refreshPickerStatusHud === "function") {
          refreshPickerStatusHud("trigger-down");
        }
        if (typeof requestPickerPointerRefresh === "function") {
          requestPickerPointerRefresh(true);
        } else if (typeof refreshPickerTargetFromPointer === "function") {
          refreshPickerTargetFromPointer(true);
        }
        try {
          parent.postMessage({ type: "PRISM_SHIFT_PEEK", active: true }, "*");
        } catch (err) {}
      }, true);

      document.addEventListener("keyup", function(event) {
        if (!keyMatchesTrigger(event)) return;
        prismShiftKeyDown = false;
        if (typeof refreshPickerStatusHud === "function") {
          refreshPickerStatusHud("trigger-up");
        }
        if (!prismPickerActive && typeof invalidatePickerPointerState === "function") {
          invalidatePickerPointerState();
        }
        try {
          parent.postMessage({ type: "PRISM_SHIFT_PEEK", active: false }, "*");
        } catch (err) {}
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
].forEach(function (type) {
  document.addEventListener(type, function (event) {
    if (typeof ensurePrismFrameFocus === "function") {
      ensurePrismFrameFocus();
    }
    if (!prismPickerActive) return;
    if (isDebugOverlayEventTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);
});

document.addEventListener("click", function (event) {
  if (isDebugOverlayEventTarget(event.target)) return;
  const forcePickByShiftClick = isTriggerKeyDown(event) || prismShiftKeyDown;

  if (
    prismDebugOverlayEnabled &&
    !isEditableDebugTarget(event.target) &&
    Number.isFinite(event.clientX) &&
    Number.isFinite(event.clientY)
  ) {
    const clickTarget = findTargetAt(event.clientX, event.clientY) || event.target || null;
    pinPickerDebugSnapshot("click-pin", clickTarget, {
      x: event.clientX,
      y: event.clientY
    });
  }

  if (!prismPickerActive && !forcePickByShiftClick) {
    // If View Mode is active (prismViewMode=true), we skip the memo-click check
    // so clicks can pass through to the underlying page elements unless Shift is held.
    if (prismViewMode) return;

    // Existing memo click behavior.
    const memoEl = event.target.closest && event.target.closest(".prism-has-instruction");
    if (memoEl) {
      const lineTarget = getLineTarget(memoEl) || memoEl;
      const line = getTargetLine(lineTarget) || 1;
      const token =
        typeof resolvePickerClickToken === "function"
          ? resolvePickerClickToken(lineTarget, line)
          : typeof getTargetToken === "function"
            ? getTargetToken(lineTarget)
            : "";
      const rect = memoEl.getBoundingClientRect();
      parent.postMessage({
        type: "PRISM_PICKER_SELECT",
        line,
        token,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      }, "*");
    }
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const target = resolvePickerClickTarget(event.clientX, event.clientY);
  if (!target) return;

  const resolvedTarget = normalizePickerTarget(target) || target;
  const line = resolvePickerClickLine(resolvedTarget);
  if (!Number.isFinite(line) || line <= 0) {
    if (typeof refreshPickerDebugOverlay === "function") {
      refreshPickerDebugOverlay("click-unmapped-target", resolvedTarget);
    }
    return;
  }
  const token =
    typeof resolvePickerClickToken === "function"
      ? resolvePickerClickToken(resolvedTarget, line)
      : "";
  rememberPickedVisualTarget(line, resolvedTarget);
  const geometry =
    typeof resolveProxyGeometryTarget === "function"
      ? resolveProxyGeometryTarget(resolvedTarget)
      : null;
  const rect = geometry && geometry.rect
    ? geometry.rect
    : resolvedTarget.getBoundingClientRect();
  parent.postMessage({
    type: "PRISM_PICKER_SELECT",
    line,
    token,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
  }, "*");
}, true);

document.addEventListener("scroll", function () {
  scheduleSvgInstructionProxySync();
  if (!prismPickerActive || !prismPickerTarget) return;
  refreshPickerVisualState(prismPickerTarget);
  if (prismPickerHoverProxy && prismPickerHoverProxySource) {
    syncPickerHoverProxy(prismPickerHoverProxySource);
  }
  if (typeof requestPickerPointerRefresh === "function") {
    requestPickerPointerRefresh(true);
  }
}, true);

document.addEventListener("keydown", function (event) {
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

window.addEventListener("message", function (event) {
  if (!event.data) return;

  if (event.data.type === "PRISM_UI_STATE") {
    applyUiState(event.data);
    return;
  }

  if (event.data.type === "PRISM_INSTRUCTION_NAVIGATE") {
    navigateToInstruction(event.data.line, event.data.behavior, event.data.token);
  }
});

const capabilityObserver = new MutationObserver(function (records) {
  if (!records || records.length === 0) return;
  scheduleSvgInstructionProxySync();
  if (prismPickerActive) {
    if (typeof requestPickerPointerRefresh === "function") {
      requestPickerPointerRefresh(true);
    } else {
      refreshPickerTargetFromPointer(true);
    }
  }
  queueRuntimeCapabilities();
});

capabilityObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener("resize", function () {
  scheduleSvgInstructionProxySync();
  queueRuntimeCapabilities();
});
window.addEventListener("load", function () {
  scheduleSvgInstructionProxySync();
  queueRuntimeCapabilities();
});
queueRuntimeCapabilities();

try {
  parent.postMessage({ type: "PRISM_UI_STATE_REQUEST" }, "*");
} catch (err) { }

try {
  parent.postMessage({
    type: "PRISM_DEVLOG",
    stage: "picker-bridge-loaded",
    payload: { ok: true }
  }, "*");
} catch (e) { }

`;
