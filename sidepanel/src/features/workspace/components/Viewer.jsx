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
    return () => {
      viewer.removeEventListener("load", handleLoad);
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
      ></iframe>
    </div>
  );
});

export default Viewer;
