(() => {
  function isElementVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (!style) return true;
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function create(options = {}) {
    const intelligentExtractor = options.intelligentExtractor || null;

    function isLikelySidebarControl(el) {
      if (!el || !(el instanceof Element)) return false;
      const hint = [
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
        el.getAttribute("data-testid"),
        el.className,
        el.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return /(sidebar|drawer|history|menu|panel|nav|toggle|collapse|expand|사이드바|메뉴|탐색)/i.test(hint);
    }

    function resolveGeminiComposerRoot() {
      const input =
        document.querySelector(".ql-editor") ||
        document.querySelector('div[contenteditable="true"][role="textbox"]') ||
        document.querySelector('div[contenteditable="true"]');
      return input?.closest("form, [role='form'], [class*='input'], [class*='composer'], [class*='prompt']") || input?.parentElement || null;
    }

    function pickFirstVisibleCandidate(candidates, options = {}) {
      const { excludeSidebar = false } = options;
      for (let i = candidates.length - 1; i >= 0; i -= 1) {
        const candidate = candidates[i];
        if (!isElementVisible(candidate)) continue;
        if (excludeSidebar && isLikelySidebarControl(candidate)) continue;
        return candidate;
      }
      return null;
    }

    function findBestInputCandidate() {
      const learned = intelligentExtractor?.findBestInput?.();
      if (learned) return learned;

      const host = window.location.host;
      if (host.includes("chatgpt.com")) {
        return document.querySelector("#prompt-textarea");
      }
      if (host.includes("claude.ai")) {
        return (
          document.querySelector(".ProseMirror") ||
          document.querySelector('[contenteditable="true"]')
        );
      }
      if (host.includes("gemini.google.com")) {
        return (
          document.querySelector(".ql-editor") ||
          document.querySelector('div[contenteditable="true"][role="textbox"]') ||
          document.querySelector('div[contenteditable="true"]')
        );
      }
      if (host.includes("v0.dev")) {
        return document.querySelector('textarea[placeholder*="Ask"]');
      }
      return (
        document.querySelector('textarea[name*="prompt"]') ||
        document.querySelector('textarea[placeholder*="prompt"]') ||
        document.querySelector('textarea[aria-label*="prompt"]') ||
        document.querySelector("textarea") ||
        document.querySelector('div[contenteditable="true"]')
      );
    }

    function findBestSendButtonCandidate() {
      const learned = intelligentExtractor?.findBestSendButton?.() || null;

      const host = window.location.host;
      if (host.includes("gemini.google.com")) {
        if (learned && isElementVisible(learned) && !isLikelySidebarControl(learned)) {
          return learned;
        }

        const composerRoot = resolveGeminiComposerRoot();
        const geminiCandidates = [
          ...(composerRoot ? Array.from(composerRoot.querySelectorAll("button")) : []),
          ...Array.from(document.querySelectorAll("button[aria-label*='send' i], button[aria-label*='전송'], button[aria-label*='보내기'], button.send-button")),
        ];
        return pickFirstVisibleCandidate(geminiCandidates, { excludeSidebar: true });
      }

      if (learned) return learned;
      if (host.includes("claude.ai")) {
        return document.querySelector('button[aria-label*="Send"], button[aria-label*="전송"]');
      }
      if (host.includes("chatgpt.com")) {
        return document.querySelector('button[data-testid*="send-button"]');
      }
      return (
        document.querySelector(".send-button") ||
        document.querySelector('button[aria-label*="전송"]') ||
        document.querySelector('button[aria-label*="보내기"]') ||
        document.querySelector('button[data-testid*="send"]') ||
        document.querySelector('button[class*="submit"]')
      );
    }

    function findBestCopyButtonCandidate() {
      const learned = intelligentExtractor?.findBestCopyButton?.();
      if (learned) return learned;

      const copyButtons = document.querySelectorAll(".copy-button, [aria-label*='복사'], [aria-label*='copy']");
      for (let i = copyButtons.length - 1; i >= 0; i -= 1) {
        const candidate = copyButtons[i];
        if (!isElementVisible(candidate)) continue;
        return candidate;
      }
      return null;
    }

    function hasStopGenerationControl() {
      if (intelligentExtractor?.hasStopControl?.()) return true;
      const stopNode = document.querySelector(
        "button[aria-label*='stop' i], button[aria-label*='중지'], [data-testid*='stop' i], button[class*='stop' i]"
      );
      return Boolean(stopNode && isElementVisible(stopNode));
    }

    return {
      findBestInputCandidate,
      findBestSendButtonCandidate,
      findBestCopyButtonCandidate,
      hasStopGenerationControl,
      isElementVisible,
    };
  }

  window.PrismChatInjector = { create };
})();
