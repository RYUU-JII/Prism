export const SNAPSHOT_RUNTIME_CAPABILITIES_SOURCE = `
      function scriptMentionsThree(text) {
        if (!text) return false;
        const lowered = String(text).toLowerCase();
        return (
          lowered.includes("from 'three") ||
          lowered.includes('from "three') ||
          lowered.includes("from 'three/addons/") ||
          lowered.includes('from "three/addons/') ||
          lowered.includes("from 'three/examples/jsm/") ||
          lowered.includes('from "three/examples/jsm/') ||
          lowered.includes("window.three") ||
          lowered.includes("new three.")
        );
      }

      function detectThreeLikeRuntime() {
        const scripts = Array.from(document.querySelectorAll("script"));
        const hasThreeScript = scripts.some(function(script) {
          if (!script) return false;
          const src = String(script.getAttribute("src") || "").toLowerCase();
          if (src.includes("three")) return true;
          const type = String(script.getAttribute("type") || "").toLowerCase();
          if (type && type !== "module" && type !== "text/javascript") return false;
          const text = String(script.textContent || "");
          return scriptMentionsThree(text) || text.includes("THREE");
        });
        return hasThreeScript || typeof window.THREE === "object";
      }

      function evaluateRuntimeCapabilities() {
        const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
        const canvases = Array.from(document.querySelectorAll("canvas"));
        const hasDominantCanvas = canvases.some(function(canvas) {
          if (!canvas || !canvas.getBoundingClientRect) return;
          const rect = canvas.getBoundingClientRect();
          const area = Math.max(0, rect.width) * Math.max(0, rect.height);
          if (area <= 0) return false;
          const ratio = area / viewportArea;
          return ratio >= 0.7;
        });
        const likelyThreeScene = hasDominantCanvas && detectThreeLikeRuntime();

        const reasons = {};
        if (likelyThreeScene) {
          reasons.picker = "WebGL scene: picker can only target the canvas element.";
        }
        if (likelyThreeScene) {
          reasons.snapshot = "WebGL scene snapshot can be unreliable in this mode.";
        }
        if (!nativeRequestAnimationFrame) {
          reasons.freeze = "requestAnimationFrame is unavailable in this context.";
        }

        return {
          picker: !likelyThreeScene,
          snapshot: !likelyThreeScene,
          freeze: Boolean(nativeRequestAnimationFrame),
          reasons
        };
      }

      function postRuntimeCapabilities(force) {
        const caps = evaluateRuntimeCapabilities();
        const key = JSON.stringify(caps);
        if (!force && key === prismCapabilitiesCacheKey) return;
        prismCapabilitiesCacheKey = key;
        try {
          parent.postMessage({
            type: "PRISM_RUNTIME_CAPABILITIES",
            capabilities: caps
          }, "*");
        } catch (err) {}
      }

      function queueRuntimeCapabilities() {
        if (prismCapabilityTimer) return;
        prismCapabilityTimer = setTimeout(function() {
          prismCapabilityTimer = null;
          postRuntimeCapabilities(false);
        }, 80);
      }

      function normalizeSettings(settings) {
        const safe = settings || {};
        const pickerHighlight =
          safe.pickerHighlight && typeof safe.pickerHighlight === "object"
            ? safe.pickerHighlight
            : {};
        const highlightStrength =
          ["subtle", "medium", "strong"].includes(pickerHighlight.strength)
            ? pickerHighlight.strength
            : ["subtle", "medium", "strong"].includes(safe.highlightStrength)
              ? safe.highlightStrength
            : "medium";
        const highlightColor =
          typeof pickerHighlight.color === "string" && pickerHighlight.color.trim()
            ? pickerHighlight.color
            : typeof safe.highlightColor === "string" && safe.highlightColor.trim()
              ? safe.highlightColor
            : "#14b8a6";
        const captureRange =
          safe.captureRange === "full" || safe.captureRange === "visible"
            ? safe.captureRange
            : "visible";
        return {
          lockInteractionsWhenPaused:
            typeof safe.lockInteractionsWhenPaused === "boolean"
              ? safe.lockInteractionsWhenPaused
              : true,
          keepPickerActiveAfterSelect:
            typeof safe.keepPickerActiveAfterSelect === "boolean"
              ? safe.keepPickerActiveAfterSelect
              : true,
          debugPickerOverlay:
            typeof safe.debugPickerOverlay === "boolean"
              ? safe.debugPickerOverlay
              : false,
          pickerTriggerKey: ["Shift", "Alt", "Control", "Grave"].includes(safe.pickerTriggerKey)
            ? safe.pickerTriggerKey
            : "Shift",
          captureRange,
          highlightStrength,
          highlightColor
        };
      }

      function parseHexColor(hex) {
        if (!hex) return null;
        const raw = String(hex).replace("#", "").trim();
        if (raw.length === 3) {
          const r = parseInt(raw[0] + raw[0], 16);
          const g = parseInt(raw[1] + raw[1], 16);
          const b = parseInt(raw[2] + raw[2], 16);
          if ([r, g, b].some((val) => Number.isNaN(val))) return null;
          return { r, g, b };
        }
        if (raw.length === 6) {
          const r = parseInt(raw.slice(0, 2), 16);
          const g = parseInt(raw.slice(2, 4), 16);
          const b = parseInt(raw.slice(4, 6), 16);
          if ([r, g, b].some((val) => Number.isNaN(val))) return null;
          return { r, g, b };
        }
        return null;
      }

      function hexToRgba(hex, alpha) {
        const fallback = { r: 20, g: 184, b: 166 };
        const rgb = parseHexColor(hex) || fallback;
        return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + alpha + ")";
      }

      function applyVisualSettings() {
        const strengthMap = {
          subtle: {
            outlineWidth: 1,
            alpha: 0.35,
            badgeAlpha: 0.7
          },
          medium: {
            outlineWidth: 2,
            alpha: 0.55,
            badgeAlpha: 0.85
          },
          strong: {
            outlineWidth: 3,
            alpha: 0.8,
            badgeAlpha: 1
          }
        };
        const strength = strengthMap[prismSettings.highlightStrength] || strengthMap.medium;
        const outlineWidth = strength.outlineWidth;
        const offset = Math.max(1, outlineWidth);
        const rootStyle = document.documentElement.style;
        rootStyle.setProperty("--prism-marker-outline-style", "solid");
        rootStyle.setProperty("--prism-marker-outline-width", String(outlineWidth) + "px");
        rootStyle.setProperty("--prism-marker-outline-offset", String(offset) + "px");
        rootStyle.setProperty(
          "--prism-marker-color-rgba",
          hexToRgba(prismSettings.highlightColor, strength.alpha)
        );
        rootStyle.setProperty(
          "--prism-marker-badge-bg",
          hexToRgba(prismSettings.highlightColor, strength.badgeAlpha)
        );
        rootStyle.setProperty(
          "--prism-marker-badge-icon",
          PRISM_BADGE_ICON_URL
        );
        rootStyle.setProperty(
          "--prism-marker-focus-ring-1",
          hexToRgba(prismSettings.highlightColor, strength.alpha * 0.58)
        );
        rootStyle.setProperty(
          "--prism-marker-focus-ring-2",
          hexToRgba(prismSettings.highlightColor, strength.alpha * 0.42)
        );
        rootStyle.setProperty(
          "--prism-marker-focus-ring-3",
          hexToRgba(prismSettings.highlightColor, strength.alpha * 0.3)
        );
        rootStyle.setProperty(
          "--prism-marker-focus-ring-4",
          hexToRgba(prismSettings.highlightColor, strength.alpha * 0.2)
        );
        rootStyle.setProperty(
          "--prism-marker-focus-ring-5",
          hexToRgba(prismSettings.highlightColor, strength.alpha * 0.12)
        );
        rootStyle.setProperty(
          "--prism-marker-focus-radius",
          "8px"
        );
      }


`;
