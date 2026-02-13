export const SNAPSHOT_RUNTIME_EVENT_BINDINGS_SOURCE = String.raw`
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

        const target = resolvePickerClickTarget(event.clientX, event.clientY);
        if (!target) return;

        const resolvedTarget = normalizePickerTarget(target) || target;
        const line = resolvePickerClickLine(resolvedTarget);
        rememberPickedVisualTarget(line, resolvedTarget);
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
        refreshPickerVisualState(prismPickerTarget);
        if (prismPickerHoverProxy && prismPickerHoverProxySource) {
          syncPickerHoverProxy(prismPickerHoverProxySource);
        }
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

      const capabilityObserver = new MutationObserver(function(records) {
        if (!records || records.length === 0) return;
        prunePickedVisualTargetCache();
        scheduleSvgInstructionProxySync();
        queueRuntimeCapabilities();
      });

      capabilityObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
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

`;
