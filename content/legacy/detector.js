const BUTTON_CLASS = "prism-copy-btn";

function inferLanguage(el) {
  const classList = Array.from(el.classList || []);
  const langClass = classList.find((c) => c.startsWith("language-"));
  if (langClass) return langClass.replace("language-", "");
  const dataLang = el.getAttribute?.("data-language");
  if (dataLang) return dataLang;
  return "text";
}

function extractCodeText(codeEl) {
  return codeEl?.innerText || codeEl?.textContent || "";
}

function addButton(container, codeEl) {
  if (!container || container.querySelector(`.${BUTTON_CLASS}`)) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = BUTTON_CLASS;
  btn.textContent = "Prism";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const code = extractCodeText(codeEl);
    const language = inferLanguage(codeEl);
    chrome.runtime.sendMessage({ type: "prism-code", code, language });
  });

  container.style.position = container.style.position || "relative";
  container.appendChild(btn);
}

function detectBlocks(root = document) {
  const codeBlocks = root.querySelectorAll("pre > code, code.block, pre code");
  codeBlocks.forEach((codeEl) => {
    const pre = codeEl.closest("pre");
    const container = pre || codeEl.parentElement;
    addButton(container, codeEl);
  });
}

detectBlocks();

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.addedNodes && m.addedNodes.length > 0) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) detectBlocks(node);
      });
    }
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});
