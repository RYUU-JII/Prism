// Utility functions for capturing screenshots.

const scriptLoadCache = new Map();

async function toDataURL(url, baseUrl) {
  if (!url || url.startsWith("data:")) return url;

  let absoluteUrl = url;
  if (url.startsWith("/") && baseUrl) {
    const origin = baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`;
    absoluteUrl = new URL(url, new URL(origin).origin).href;
  }

  try {
    const response = await fetch(absoluteUrl);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "PRISM_PROXY_FETCH",
        url: absoluteUrl
      }, (response) => {
        if (response?.dataUrl) resolve(response.dataUrl);
        else resolve(url);
      });
    });
  }
}

async function inlineAllResources(element, baseUrl) {
  const imgs = Array.from(element.querySelectorAll("img"));
  await Promise.all(imgs.map(async (img) => {
    img.src = await toDataURL(img.src, baseUrl);
  }));

  const allElements = Array.from(element.querySelectorAll("*"));
  await Promise.all(allElements.map(async (el) => {
    const style = window.getComputedStyle(el);
    const bgImg = style.backgroundImage;
    if (bgImg && bgImg.includes("url(")) {
      const match = bgImg.match(/url\\(["']?(.*?)["']?\\)/);
      if (match && match[1]) {
        const base64 = await toDataURL(match[1], baseUrl);
        el.style.backgroundImage = `url("${base64}")`;
      }
    }
  }));
}

function loadScriptOnce(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if (scriptLoadCache.has(src)) return scriptLoadCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(src);
    script.async = true;
    script.onload = () => resolve(globalName ? window[globalName] : true);
    script.onerror = () => {
      scriptLoadCache.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
  scriptLoadCache.set(src, promise);
  return promise;
}

function cleanupLegacyCaptureStyles() {
  document
    .querySelectorAll("link[data-prism-style^='sidepanel/']")
    .forEach((node) => node.remove());
}

function loadStyleIntoRoot(root, href) {
  return new Promise((resolve, reject) => {
    if (!root) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL(href);
    link.dataset.prismCaptureStyle = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load ${href}`));
    root.appendChild(link);
  });
}

function applyInlineStyles(element, styles) {
  if (!element || !styles) return;
  Object.keys(styles).forEach((key) => {
    element.style[key] = styles[key];
  });
}

function appendInlineStyleBlocks(root, inlineStyles) {
  if (!root || !Array.isArray(inlineStyles) || inlineStyles.length === 0) return;
  inlineStyles.forEach((cssText, index) => {
    const text = typeof cssText === "string" ? cssText.trim() : "";
    if (!text) return;
    const style = document.createElement("style");
    style.dataset.prismCaptureInlineStyle = String(index);
    style.textContent = text;
    root.appendChild(style);
  });
}

function restoreCanvasSnapshots(root, canvasSnapshots) {
  if (!root || !Array.isArray(canvasSnapshots) || canvasSnapshots.length === 0) return;

  const canvasById = new Map();
  root.querySelectorAll("canvas[data-prism-capture-id]").forEach((canvas) => {
    const id = canvas.getAttribute("data-prism-capture-id");
    if (id) canvasById.set(id, canvas);
  });

  let taintedCount = 0;
  canvasSnapshots.forEach((snapshot) => {
    if (!snapshot || !snapshot.id || !snapshot.dataUrl) {
      if (snapshot?.tainted) taintedCount += 1;
      return;
    }
    const canvas = canvasById.get(String(snapshot.id));
    if (!canvas) return;

    const img = document.createElement("img");
    img.src = snapshot.dataUrl;
    img.alt = canvas.getAttribute("aria-label") || "";
    img.decoding = "sync";
    img.loading = "eager";
    img.className = canvas.className || "";
    if (canvas.id) img.id = canvas.id;

    const inlineStyle = canvas.getAttribute("style");
    if (inlineStyle) {
      img.setAttribute("style", inlineStyle);
    }

    const width = Number(snapshot.width);
    const height = Number(snapshot.height);
    if (Number.isFinite(width) && width > 0) {
      img.width = width;
    }
    if (Number.isFinite(height) && height > 0) {
      img.height = height;
    }

    if (!img.style.width && snapshot.cssWidth) img.style.width = snapshot.cssWidth;
    if (!img.style.height && snapshot.cssHeight) img.style.height = snapshot.cssHeight;
    if (!img.style.display && snapshot.display) img.style.display = snapshot.display;

    img.dataset.prismCaptureCanvas = "true";
    canvas.replaceWith(img);
  });

  if (taintedCount > 0) {
    console.warn(
      `[Prism] ${taintedCount} canvas element(s) could not be serialized due to canvas tainting.`
    );
  }
}

function waitForPaint(frames = 2) {
  return new Promise((resolve) => {
    let count = 0;
    const tick = () => {
      count += 1;
      if (count >= frames) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function copyImageToClipboard(dataUrl, showToast) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    showToast("Clipboard API not available.");
    return;
  }
  const blob = dataUrlToBlob(dataUrl);
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

export async function performCaptureInParent(data, latestPayload, showToast) {
  const action = data?.action || "download";
  let host = null;
  let container = null;
  let stage = null;

  try {
    if (!data || !data.html) {
      throw new Error("No capture payload provided.");
    }

    cleanupLegacyCaptureStyles();

    const VIRTUAL_WIDTH = Math.max(1, Math.ceil(Number(data.width) || 0) || 1280);
    const VIRTUAL_HEIGHT = Math.max(1, Math.ceil(Number(data.height) || 0));

    host = document.createElement("div");
    host.id = "prism-capture-host";
    host.style.cssText = `
position: fixed;
left: -10000px;
top: 0;
width: 1px;
height: 1px;
pointer-events: none;
z-index: -9999;
`;

    const shadowRoot = host.attachShadow({ mode: "open" });
    container = document.createElement("div");
    container.id = "prism-capture-root";
    container.className = (data.bodyClass || "").trim();
    container.style.cssText = `
position: fixed;
left: -5000px;
top: 0;
width: ${VIRTUAL_WIDTH}px;
height: ${VIRTUAL_HEIGHT}px;
pointer-events: none;
box-sizing: border-box;
contain: layout paint;
overflow: hidden;
`;
    applyInlineStyles(container, data.bodyStyles);
    container.style.background = data.background || container.style.background || "#ffffff";
    container.style.color = data.color || container.style.color || "#111111";
    container.style.fontFamily = data.fontFamily || container.style.fontFamily || "inherit";

    stage = document.createElement("div");
    stage.id = "prism-root";
    stage.className = (data.classes || "").trim();
    stage.style.width = "100%";
    stage.style.height = "100%";
    stage.style.position = "relative";
    stage.style.boxSizing = "border-box";
    applyInlineStyles(stage, data.rootStyles);
    stage.innerHTML = data.html;
    restoreCanvasSnapshots(stage, data.canvasSnapshots);
    stage.querySelectorAll("[data-prism-picker-overlay='true'], [data-prism-svg-instruction-proxy='true']").forEach((el) => {
      el.remove();
    });
    stage.querySelectorAll(".prism-has-instruction, .prism-has-instruction--background, .prism-has-instruction--svg, .prism-has-instruction--picker-focus").forEach((el) => {
      if (!el || !el.classList) return;
      el.classList.remove("prism-has-instruction");
      el.classList.remove("prism-has-instruction--background");
      el.classList.remove("prism-has-instruction--svg");
      el.classList.remove("prism-has-instruction--picker-focus");
    });

    stage.querySelectorAll("script").forEach((el) => el.remove());
    stage.querySelectorAll("link[rel='stylesheet']").forEach((el) => el.remove());
    stage.querySelectorAll("iframe, frame, object, embed").forEach((el) => {
      const placeholder = document.createElement("div");
      const rect = el.getBoundingClientRect();
      placeholder.style.width = rect.width ? `${rect.width}px` : "100%";
      placeholder.style.height = rect.height ? `${rect.height}px` : "150px";
      placeholder.style.background = "#f3f4f6";
      placeholder.style.border = "1px dashed #d1d5db";
      placeholder.style.display = "flex";
      placeholder.style.alignItems = "center";
      placeholder.style.justifyContent = "center";
      placeholder.style.color = "#9ca3af";
      placeholder.style.fontSize = "12px";
      placeholder.textContent = "External Content (Snapshot Unsupported)";
      el.replaceWith(placeholder);
    });

    container.appendChild(stage);
    shadowRoot.appendChild(container);
    document.body.appendChild(host);

    const baseUrl = latestPayload?.url || "";
    await inlineAllResources(stage, baseUrl);
    // Keep capture styles isolated to the capture shadow root.
    // Loading legacy theme.css globally causes panel layout/theme corruption.
    const shouldLoadTailwind =
      data?.prismTailwindInjected === true ||
      (data?.prismTailwindInjected == null && data.html.includes("class="));
    if (shouldLoadTailwind) {
      await loadStyleIntoRoot(shadowRoot, "sidepanel/tailwind.css").catch(() => {});
    }
    appendInlineStyleBlocks(shadowRoot, data.inlineStyles);
    await loadScriptOnce("sidepanel/vendor/modern-screenshot.js");

    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 250))
      ]);
    }

    await waitForPaint(3);
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (!window.modernScreenshot || typeof window.modernScreenshot.domToPng !== "function") {
      throw new Error("modernScreenshot library (domToPng) not found.");
    }

    const { domToPng } = window.modernScreenshot;
    const dataUrl = await domToPng(stage, {
      width: VIRTUAL_WIDTH,
      height: VIRTUAL_HEIGHT,
      scale: 2,
      backgroundColor: data.background || "#ffffff",
      style: {
        transform: "scale(1)",
        transformOrigin: "top left"
      },
      features: {
        copyStyles: true,
      }
    });

    if (action === "clipboard") {
      await copyImageToClipboard(dataUrl, showToast);
      showToast("Image copied to clipboard.");
      return;
    }

    const blob = dataUrlToBlob(dataUrl);
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: "prism-desktop-snapshot.png", saveAs: true }, () => {
      URL.revokeObjectURL(url);
    });
    showToast("Image saved.");
  } catch (err) {
    console.error("[Prism] Parent capture failed:", err);
    showToast("Error generating snapshot.");
  } finally {
    cleanupLegacyCaptureStyles();
    if (host) {
      host.remove();
    } else if (container) {
      container.remove();
    }
  }
}
