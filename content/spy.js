(() => {
  if (!navigator?.clipboard?.writeText) return;

  const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
  if (originalWriteText.__prismWrapped) return;
  const GESTURE_WINDOW_MS = 1500;
  let allowUntil = 0;

  function notify(text) {
    window.postMessage({ source: "prism-clipboard", text }, "*");
  }

  function markGesture() {
    allowUntil = Date.now() + GESTURE_WINDOW_MS;
  }

  function isLikelyCode(text) {
    if (!text || typeof text !== "string") return false;
    if (text.length < 20) return false;
    const hints = [
      /<!doctype html/i,
      /<html[\s>]/i,
      /<body[\s>]/i,
      /<head[\s>]/i,
      /<div[\s>]/i,
      /<section[\s>]/i,
      /<template[\s>]/i,
      /className=/,
      /import\s+[^;]+from\s+['"][^'"]+['"]/i,
      /export\s+default/i,
      /ReactDOM/i,
      /createRoot\s*\(/i
    ];
    return hints.some((re) => re.test(text));
  }

  ["pointerdown", "keydown", "touchstart", "click"].forEach((eventName) => {
    window.addEventListener(
      eventName,
      (event) => {
        if (event && event.isTrusted === false) return;
        markGesture();
      },
      true
    );
  });

  try {
    navigator.clipboard.writeText = function (text) {
      const now = Date.now();
      if (now > allowUntil) {
        return originalWriteText(text);
      }
      try {
        const value = typeof text === "string" ? text : String(text ?? "");
        if (value && isLikelyCode(value)) {
          notify(value);
        }
      } catch (err) {
        // Ignore clipboard serialization errors.
      }
      return originalWriteText(text);
    };

    navigator.clipboard.writeText.__prismWrapped = true;
  } catch (err) {
    // If writeText is not writable, fail silently.
  }
})();
