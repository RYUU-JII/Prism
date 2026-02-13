import React, { useEffect, forwardRef } from 'react';

const Viewer = forwardRef(({ onReady, containerClassName = "panel-shell__content" }, ref) => {
  useEffect(() => {
    const viewer = ref.current;
    if (!viewer) return undefined;

    const handleLoad = () => {
      if (typeof onReady === "function") {
        onReady();
      }
    };

    viewer.addEventListener("load", handleLoad);

    const shouldKeepCurrentFocus = (activeEl) => {
      if (!activeEl || !(activeEl instanceof Element)) return false;
      if (activeEl === viewer) return true;
      if (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") return true;
      if (activeEl.isContentEditable) return true;
      return false;
    };

    const focusViewer = () => {
      if (shouldKeepCurrentFocus(document.activeElement)) return;
      try {
        viewer.focus({ preventScroll: true });
      } catch (err) {
        try {
          viewer.focus();
        } catch (focusErr) {}
      }
    };

    const handlePointerEnter = () => {
      focusViewer();
    };
    const handlePointerMove = () => {
      focusViewer();
    };

    focusViewer();
    viewer.addEventListener("pointerenter", handlePointerEnter);
    viewer.addEventListener("pointermove", handlePointerMove);
    return () => {
      viewer.removeEventListener("load", handleLoad);
      viewer.removeEventListener("pointerenter", handlePointerEnter);
      viewer.removeEventListener("pointermove", handlePointerMove);
    };
  }, [onReady, ref]);

  return (
    <div className={containerClassName}>
      <iframe
        ref={ref}
        id="viewer"
        src={chrome?.runtime?.getURL
          ? chrome.runtime.getURL("sidepanel/sandbox.html")
          : "sandbox.html"}
        sandbox="allow-scripts allow-same-origin allow-modals"
        className="w-full h-full border-0"
        tabIndex={0}
      ></iframe>
    </div>
  );
});

export default Viewer;
