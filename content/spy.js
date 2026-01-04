(() => {
  if (!navigator?.clipboard?.writeText && !navigator?.clipboard?.write) return;

  const originalWriteText = navigator?.clipboard?.writeText
    ? navigator.clipboard.writeText.bind(navigator.clipboard)
    : null;
  const originalWrite = navigator?.clipboard?.write
    ? navigator.clipboard.write.bind(navigator.clipboard)
    : null;
  const originalExecCommand = document.execCommand ? document.execCommand.bind(document) : null;

  if (originalWriteText && originalWriteText.__prismWrapped) return;
  const GESTURE_WINDOW_MS = 4000;
  let allowUntil = 0;

  function notify(text) {
    document.dispatchEvent(new CustomEvent("prism-clipboard-write", { detail: text }));
  }

  function markGesture() {
    allowUntil = Date.now() + GESTURE_WINDOW_MS;
  }

  function isLikelyCode(text) {
    // Prism Orb(content script)에서 정밀하게 검사하므로,
    // 여기서는 최소한의 텍스트 유효성만 확인하고 통과시킵니다.
    // 이렇게 해야 짧은 코드나 복사 버튼을 통한 입력도 놓치지 않습니다.
    return typeof text === "string" && text.trim().length > 0;
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
    if (originalWriteText) {
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
    }

    if (originalWrite) {
      navigator.clipboard.write = function (items) {
        const now = Date.now();
        const result = originalWrite(items);
        if (now > allowUntil) return result;

        try {
          const itemList = Array.isArray(items) ? items : [];
          Promise.all(
            itemList.map(async (item) => {
              if (!item || typeof item.getType !== "function") return "";
              try {
                const blob = await item.getType("text/plain");
                return blob ? await blob.text() : "";
              } catch (err) {
                return "";
              }
            })
          ).then((parts) => {
            const text = parts.join("\n").trim();
            if (text && isLikelyCode(text)) {
              notify(text);
            }
          });
        } catch (err) {
          // Ignore clipboard serialization errors.
        }
        return result;
      };
    }

    if (originalExecCommand) {
      document.execCommand = function (command, showUI, value) {
        const now = Date.now();
        if (command && typeof command === "string" && command.toLowerCase() === "copy" && now <= allowUntil) {
          try {
            const selection = window.getSelection();
            const text = selection ? selection.toString() : "";
            if (text && isLikelyCode(text)) {
              notify(text);
            }
          } catch (err) {
            // Ignore selection errors.
          }
        }
        return originalExecCommand(command, showUI, value);
      };
    }
  } catch (err) {
    // If clipboard APIs are not writable, fail silently.
  }
})();
