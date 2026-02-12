(() => {
  function create(options = {}) {
    const orbId = options.orbId || "prism-orb";
    const orbActiveClass = options.orbActiveClass || "prism-orb--active";
    const detectTheme = typeof options.detectTheme === "function" ? options.detectTheme : () => "light";
    const onOpen = typeof options.onOpen === "function" ? options.onOpen : () => {};
    const title = options.title || "Open Prism";
    const ariaLabel = options.ariaLabel || "Open Prism side panel";
    const autoHideMs = Number.isFinite(Number(options.autoHideMs)) ? Number(options.autoHideMs) : 6000;
    const feedbackHideMs = Number.isFinite(Number(options.feedbackHideMs)) ? Number(options.feedbackHideMs) : 500;

    let hideTimer = null;
    let cleanupTimer = null;

    function clearTimers() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (cleanupTimer) {
        window.clearTimeout(cleanupTimer);
        cleanupTimer = null;
      }
    }

    function ensureOrb() {
      let orb = document.getElementById(orbId);
      if (orb) return orb;

      orb = document.createElement("button");
      orb.id = orbId;
      orb.type = "button";
      orb.setAttribute("aria-label", ariaLabel);
      orb.setAttribute("title", title);
      orb.addEventListener("click", (event) => {
        event.stopPropagation();
        onOpen(event);
      });

      document.body.appendChild(orb);
      return orb;
    }

    function showOrb() {
      const orb = ensureOrb();
      orb.dataset.theme = detectTheme();
      requestAnimationFrame(() => {
        orb.classList.add(orbActiveClass);
      });
    }

    function hideOrb() {
      const orb = document.getElementById(orbId);
      if (orb) {
        orb.classList.remove(orbActiveClass);
      }
    }

    function destroyOrb() {
      clearTimers();
      const orb = document.getElementById(orbId);
      if (orb) {
        orb.remove();
      }
    }

    function showFeedback() {
      const orb = ensureOrb();
      clearTimers();

      orb.classList.add("prism-orb--feedback");
      orb.dataset.theme = detectTheme();
      void orb.offsetWidth;

      requestAnimationFrame(() => {
        orb.classList.add(orbActiveClass);
      });

      hideTimer = setTimeout(() => {
        orb.classList.remove(orbActiveClass);
        cleanupTimer = setTimeout(() => {
          destroyOrb();
        }, feedbackHideMs);
      }, feedbackHideMs);
    }

    function scheduleHide() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }
      hideTimer = window.setTimeout(() => {
        hideOrb();
        hideTimer = null;
      }, autoHideMs);
    }

    return {
      ensureOrb,
      showOrb,
      hideOrb,
      destroyOrb,
      showFeedback,
      scheduleHide,
    };
  }

  window.PrismOrbUI = { create };
})();
