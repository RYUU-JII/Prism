(() => {
  function buildCodeFingerprint(code) {
    const source = String(code || "").replace(/\r\n?/g, "\n");
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const lineCount = source ? source.split("\n").length : 0;
    const hashHex = (hash >>> 0).toString(16).padStart(8, "0");
    return `${lineCount}L-${hashHex}`;
  }

  function decodeBasicEntities(text) {
    if (!text || typeof text !== "string") return "";
    return text
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&amp;/gi, "&");
  }

  function stripSingleCodeFence(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return "";
    const fenced = trimmed.match(/^```[^\n]*\n?([\s\S]*?)\n?```$/);
    return fenced ? fenced[1] : trimmed;
  }

  function extractPatchEnvelope(text) {
    const normalized = decodeBasicEntities(stripSingleCodeFence(text));
    if (!normalized) return "";

    const wrapperRegex = /<prism-patches\b[^>]*>[\s\S]*?<\/prism-patches>/gi;
    let wrapperMatch = null;
    let found = null;
    while ((wrapperMatch = wrapperRegex.exec(normalized)) !== null) {
      found = wrapperMatch[0];
    }
    return found || normalized;
  }

  function parsePrismPatches(rawText) {
    const envelope = extractPatchEnvelope(rawText);
    if (!envelope) return { kind: "none", patches: [], baseFingerprint: "" };

    const hasWrapper = /<prism-patches\b[^>]*>/i.test(envelope);
    const wrapperMatch = envelope.match(/<prism-patches\b([^>]*)>/i);
    const wrapperAttrText = wrapperMatch ? wrapperMatch[1] || "" : "";
    const baseMatch = wrapperAttrText.match(/\b(?:base|b)\s*=\s*["']?([a-zA-Z0-9_.:-]+)["']?/i);
    const baseFingerprint = baseMatch ? baseMatch[1] : "";
    const patchRegex = /<prism-patch\b([^>]*)>([\s\S]*?)<\/prism-patch>/gi;
    const patches = [];
    let match = null;

    while ((match = patchRegex.exec(envelope)) !== null) {
      const attrText = match[1] || "";
      const startMatch = attrText.match(/\b(?:start_line|s)\s*=\s*["']?(\d+)["']?/i);
      const endMatch = attrText.match(/\b(?:end_line|e)\s*=\s*["']?(\d+)["']?/i);
      if (!startMatch || !endMatch) continue;

      const startLine = Number(startMatch[1]);
      const endLine = Number(endMatch[1]);
      if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) continue;
      if (startLine <= 0 || endLine <= 0) continue;
      if (endLine < startLine) continue;

      let replacement = (match[2] || "").replace(/\r\n?/g, "\n");
      if (replacement.startsWith("\n")) replacement = replacement.slice(1);
      if (replacement.endsWith("\n")) replacement = replacement.slice(0, -1);

      patches.push({
        startLine,
        endLine,
        replacement,
        index: patches.length,
      });
    }

    if (hasWrapper && patches.length === 0) {
      return { kind: "no_change", patches: [], baseFingerprint };
    }
    if (patches.length === 0) {
      return { kind: "invalid", patches: [], baseFingerprint };
    }

    return { kind: "patches", patches, baseFingerprint };
  }

  function applyPrismPatches(baseCode, patches) {
    const baseLines = String(baseCode || "").replace(/\r\n?/g, "\n").split("\n");
    const totalLines = baseLines.length;
    const orderedAsc = patches.slice().sort((a, b) => a.startLine - b.startLine || a.index - b.index);

    for (let i = 0; i < orderedAsc.length; i += 1) {
      const patch = orderedAsc[i];
      if (patch.startLine > totalLines || patch.endLine > totalLines) {
        return {
          ok: false,
          reason: `Line range out of bounds: ${patch.startLine}-${patch.endLine} (max ${totalLines})`,
        };
      }
      if (i > 0) {
        const prev = orderedAsc[i - 1];
        if (patch.startLine <= prev.endLine) {
          return {
            ok: false,
            reason: `Overlapping ranges: ${prev.startLine}-${prev.endLine} and ${patch.startLine}-${patch.endLine}`,
          };
        }
      }
    }

    const nextLines = baseLines.slice();
    const orderedDesc = orderedAsc.slice().sort((a, b) => b.startLine - a.startLine || b.index - a.index);
    for (const patch of orderedDesc) {
      const deleteCount = patch.endLine - patch.startLine + 1;
      const replacementLines = patch.replacement ? patch.replacement.split("\n") : [];
      nextLines.splice(patch.startLine - 1, deleteCount, ...replacementLines);
    }

    return { ok: true, code: nextLines.join("\n"), patchCount: orderedAsc.length };
  }

  function isRiskyHtmlPatch(baseCode, patches) {
    const structuralCloseRe = /<\/\s*(main|body|html)\s*>/i;
    const structuralBlockRe = /<\s*(header|nav|main|section|article|aside|footer)\b[\s\S]*?<\/\s*(header|nav|main|section|article|aside|footer)\s*>/i;
    const baseLines = String(baseCode || "").replace(/\r\n?/g, "\n").split("\n");

    for (const patch of patches) {
      const span = patch.endLine - patch.startLine + 1;
      const replacement = String(patch.replacement || "");
      const replacementLines = replacement ? replacement.split("\n").length : 0;
      const targetSlice = baseLines.slice(Math.max(0, patch.startLine - 1), patch.endLine).join("\n");

      if (span <= 1 && structuralCloseRe.test(replacement)) {
        return true;
      }
      if (span <= 2 && replacementLines >= 15 && structuralBlockRe.test(replacement)) {
        return true;
      }
      if (
        span <= 1 &&
        /<\s*main\b/i.test(replacement) &&
        !/<\s*main\b/i.test(targetSlice) &&
        structuralCloseRe.test(replacement)
      ) {
        return true;
      }
    }

    return false;
  }

  function assessPatchedHtmlIntegrity(baseCode, nextCode) {
    const base = String(baseCode || "").replace(/\r\n?/g, "\n");
    const next = String(nextCode || "").replace(/\r\n?/g, "\n");
    if (!next.trim()) {
      return { ok: false, reason: "empty_result" };
    }

    const baseLooksLikeDoc = /<!doctype\s+html/i.test(base) || /<html\b/i.test(base);
    if (baseLooksLikeDoc) {
      if (!/<html\b/i.test(next) || !/<body\b/i.test(next)) {
        return { ok: false, reason: "missing-root-tags" };
      }
      if (!/<\/body\s*>/i.test(next) || !/<\/html\s*>/i.test(next)) {
        return { ok: false, reason: "missing-root-closers" };
      }
    }

    if (next.length < Math.max(120, base.length * 0.25)) {
      return { ok: false, reason: "suspicious_shrink" };
    }

    const criticalTags = ["main", "section", "article", "div", "ul", "ol", "table", "form"];
    for (const tag of criticalTags) {
      const openCount = (next.match(new RegExp(`<${tag}\\b`, "gi")) || []).length;
      const closeCount = (next.match(new RegExp(`</${tag}\\s*>`, "gi")) || []).length;
      if (Math.abs(openCount - closeCount) > 4) {
        return { ok: false, reason: `unbalanced_${tag}` };
      }
    }

    return { ok: true, reason: "" };
  }

  function hasCompletePatchPayload(text) {
    const source = String(text || "");
    const hasOpen = /<\s*prism-patches\b/i.test(source) || /&lt;\s*prism-patches\b/i.test(source);
    const hasClose = /<\s*\/\s*prism-patches\s*>/i.test(source) || /&lt;\s*\/\s*prism-patches\s*&gt;/i.test(source);
    return hasOpen && hasClose;
  }

  window.PrismPatchUtils = {
    buildCodeFingerprint,
    decodeBasicEntities,
    stripSingleCodeFence,
    extractPatchEnvelope,
    parsePrismPatches,
    applyPrismPatches,
    isRiskyHtmlPatch,
    assessPatchedHtmlIntegrity,
    hasCompletePatchPayload,
  };
})();
