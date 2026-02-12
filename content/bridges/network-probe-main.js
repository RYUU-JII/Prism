(() => {
  if (window.__prismNetworkProbePatched) return;
  window.__prismNetworkProbePatched = true;

  const notify = (delta) => {
    try {
      document.dispatchEvent(
        new CustomEvent("prism-net-activity", {
          detail: { delta, ts: Date.now() },
        })
      );
    } catch (err) {
      // Ignore dispatch failures.
    }
  };

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function prismPatchedFetch(...args) {
      notify(1);
      try {
        return Promise.resolve(originalFetch.apply(this, args)).finally(() => notify(-1));
      } catch (err) {
        notify(-1);
        throw err;
      }
    };
  }

  const xhrProto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (!xhrProto) return;
  const originalOpen = xhrProto.open;
  const originalSend = xhrProto.send;
  if (typeof originalOpen !== "function" || typeof originalSend !== "function") return;

  xhrProto.open = function prismPatchedOpen(...args) {
    this.__prismTracked = true;
    return originalOpen.apply(this, args);
  };

  xhrProto.send = function prismPatchedSend(...args) {
    if (!this.__prismTracked) return originalSend.apply(this, args);
    notify(1);
    this.addEventListener(
      "loadend",
      () => {
        notify(-1);
      },
      { once: true }
    );
    return originalSend.apply(this, args);
  };
})();
