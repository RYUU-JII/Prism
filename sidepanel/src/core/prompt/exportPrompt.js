import { DEFAULT_UI_SETTINGS } from "../settings/uiSettings.js";

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

function evaluateEditComplexity(payload, instructionEntries) {
  const entries = Array.isArray(instructionEntries) ? instructionEntries : [];
  const lines = Array.from(
    new Set(
      entries
        .map((entry) => Number(entry?.line))
        .filter((line) => Number.isFinite(line) && line > 0)
    )
  ).sort((a, b) => a - b);

  if (lines.length === 0) {
    return { score: 0, shouldEscalateToFull: false, reasons: [] };
  }

  let score = 0;
  const reasons = [];
  const lineCount = lines.length;

  if (lineCount >= 3) {
    score += 3;
    reasons.push("multi-target");
  } else if (lineCount === 2) {
    score += 1;
    reasons.push("two-target");
  }

  const span = lines[lines.length - 1] - lines[0] + 1;
  if (span >= 24) {
    score += 2;
    reasons.push("wide-span");
  }

  let clusters = 1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] - lines[i - 1] > 8) clusters += 1;
  }
  if (clusters >= 2) {
    score += 2;
    reasons.push("multi-cluster");
  }

  const memoSize = entries.reduce((acc, entry) => acc + String(entry?.memoText || "").trim().length, 0);
  if (memoSize >= 140) {
    score += 1;
    reasons.push("large-intent");
  }

  const language = String(payload?.language || "").toLowerCase();
  if (language === "html") {
    const codeLines = String(payload?.code || "").split("\n");
    const structuralRe = /<\s*\/?\s*(html|head|body|style|script|header|nav|main|footer|section|article|aside|form|table|ul|ol|li)\b/i;
    let structuralHits = 0;

    lines.forEach((line) => {
      const start = Math.max(1, line - 2);
      const end = Math.min(codeLines.length, line + 2);
      for (let i = start; i <= end; i += 1) {
        if (structuralRe.test(codeLines[i - 1] || "")) {
          structuralHits += 1;
          break;
        }
      }
    });

    if (structuralHits >= 1) {
      score += 2;
      reasons.push("structural-zone");
    }
  }

  return {
    score,
    shouldEscalateToFull: score >= 4,
    reasons,
  };
}

function buildExportPrompt({
  payload,
  instructionEntries,
  settings,
  forceFullSync = false,
  recoveryHint = "",
}) {
  const safePayload = payload && typeof payload === "object" ? payload : null;
  const safeEntries = Array.isArray(instructionEntries) ? instructionEntries : [];
  const safeSettings = settings && typeof settings === "object" ? settings : DEFAULT_UI_SETTINGS;
  const safeRecoveryHint = typeof recoveryHint === "string" ? recoveryHint.trim() : "";
  const routingEnabled = safeSettings.adaptiveResponseRouting !== false;

  if (!safePayload?.code) {
    return {
      prompt: "",
      baseFingerprint: "",
      promptLevel: 3,
      forcedFullSync: false,
      resolvedResponseMode: safeSettings.aiResponseMode || "patch",
      autoEscalatedToFull: false,
      escalationReasons: [],
    };
  }

  let resolvedResponseMode =
    safeSettings.aiResponseMode === "full" || safeSettings.aiResponseMode === "patch"
      ? safeSettings.aiResponseMode
      : "patch";
  let autoEscalatedToFull = false;
  let escalationReasons = [];
  const forcedFullSync =
    Boolean(forceFullSync) &&
    resolvedResponseMode === "patch";
  if (forcedFullSync) {
    resolvedResponseMode = "full";
    escalationReasons = ["forced-full-sync"];
  }
  if (resolvedResponseMode === "patch" && routingEnabled) {
    const complexity = evaluateEditComplexity(safePayload, safeEntries);
    if (complexity.shouldEscalateToFull) {
      resolvedResponseMode = "full";
      autoEscalatedToFull = true;
      escalationReasons = complexity.reasons;
    }
  }

  const codeLines = String(safePayload.code || "").split("\n");
  const promptLevel = 3;
  const isPatchMode = resolvedResponseMode === "patch";

  let codeLabel = safePayload.language || "text";
  let codeBody = safePayload.code;
  if (isPatchMode) {
    codeLabel = `${codeLabel} (full-numbered)`;
    codeBody = codeLines.map((line, index) => `${index + 1}|${line}`).join("\n");
  } else {
    codeLabel = `${codeLabel} (full)`;
  }

  const baseFingerprint = buildCodeFingerprint(safePayload.code);
  let prompt = "";
  prompt += `[SRC] ${safePayload.url || "Unknown"}\n`;
  prompt += `[BASE] ${baseFingerprint}\n`;
  prompt += "[RULE] Treat [CURRENT_SOURCE_OF_TRUTH] as the single source of truth for this turn. Ignore prior chat code context.\n";
  prompt += `[CURRENT_SOURCE_OF_TRUTH ${codeLabel}]\n${codeBody}\n[/CURRENT_SOURCE_OF_TRUTH]\n`;
  prompt += "[REQUEST]\n";
  safeEntries.forEach((entry) => {
    prompt += `L${entry.line}:${entry.memoText}\n`;
  });
  prompt += "[/REQUEST]\n";
  if (safeRecoveryHint) {
    prompt += `[RECOVERY]\n${safeRecoveryHint}\n[/RECOVERY]\n`;
  }
  if (isPatchMode) {
    prompt += "[CONSTRAINT]\n";
    prompt += "xml only; no markdown/text.\n";
    prompt += "no analysis / no planning text.\n";
    prompt += "output must start with <prism-patches.\n";
    prompt += "line numbers must target [CURRENT_SOURCE_OF_TRUTH] above only.\n";
    prompt += "line prefixes like '73|' are reference markers only; never include those prefixes in REPLACEMENT.\n";
    prompt += `<prism-patches v="1" b="${baseFingerprint}">\n`;
    prompt += '<prism-patch s="START" e="END">\n';
    prompt += "REPLACEMENT\n";
    prompt += "</prism-patch>\n";
    prompt += "</prism-patches>\n";
    prompt += "s/e = original line numbers (1-index, inclusive), multi patches allowed, sorted asc, non-overlap.\n";
    prompt += 'no full code. no change => <prism-patches v="1"/>.\n';
  } else {
    prompt += "[CONSTRAINT]\n";
    prompt += "return full updated code only.\n";
    prompt += "no markdown fences, no analysis, no extra prose.\n";
    prompt += "if no change is needed, return the original full code only.\n";
  }

  return {
    prompt,
    baseFingerprint,
    promptLevel,
    forcedFullSync,
    resolvedResponseMode,
    autoEscalatedToFull,
    escalationReasons,
  };
}

export {
  buildCodeFingerprint,
  buildExportPrompt,
  evaluateEditComplexity,
};
