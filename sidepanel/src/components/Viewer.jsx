import React, { useEffect, forwardRef } from 'react';

const Viewer = forwardRef(({ payload }, ref) => {
  useEffect(() => {
    if (payload && ref.current) {
      const viewer = ref.current;
      const handleLoad = () => {
        viewer.contentWindow.postMessage({ type: "RENDER", ...payload }, "*");
      };

      if (viewer.contentWindow.document.readyState === 'complete') {
        handleLoad();
      } else {
        viewer.addEventListener('load', handleLoad, { once: true });
      }

      return () => {
        if (viewer) {
          viewer.removeEventListener('load', handleLoad);
        }
      };
    }
  }, [payload, ref]);

  return (
    <div className="panel-shell__content">
      <iframe
        ref={ref}
        id="viewer"
        src="sandbox.html"
        sandbox="allow-scripts"
        className="w-full h-full border-0"
      ></iframe>
    </div>
  );
});

export default Viewer;
