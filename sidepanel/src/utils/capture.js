// Utility functions for capturing screenshots.

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

export async function performCaptureInParent(data, latestPayload, showToast) {
  // This function needs html2canvas to be loaded.
  // We will assume it's available on the window object for now.
  if (!window.html2canvas) {
    console.error("html2canvas is not loaded.");
    showToast("Error: Snapshot library not found.");
    return;
  }

  const host = document.createElement("div");
  host.style.cssText = `position: fixed; left: -9999px; top: 0; width: 1px; height: 1px; overflow: hidden;`;
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });

  const container = document.createElement('div');
  shadowRoot.appendChild(container);

  container.innerHTML = `
    <style>
      @import url('${chrome.runtime.getURL('sidepanel/src/index.css')}');
    </style>
    <div id="capture-target" style="width:1280px; padding: 20px;">
      ${data.html}
    </div>
  `;

  const target = container.querySelector('#capture-target');

  await inlineAllResources(target, latestPayload?.url);

  html2canvas(target, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: data.background || '#ffffff',
      width: 1280,
      windowWidth: 1280,
  }).then(canvas => {
      const dataUrl = canvas.toDataURL('image/png');
      const action = data.action || 'download';

      if (action === 'clipboard') {
          const blob = dataUrlToBlob(dataUrl);
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
              .then(() => showToast("Image copied to clipboard."))
              .catch(err => showToast("Error copying image."));
      } else {
          const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
          chrome.downloads.download({
              url,
              filename: 'prism-snapshot.png',
              saveAs: true,
          }, () => URL.revokeObjectURL(url));
          showToast("Image saved.");
      }
      document.body.removeChild(host);
  }).catch(error => {
      console.error("Error during html2canvas capture:", error);
      showToast("Error generating snapshot.");
      document.body.removeChild(host);
  });
}
