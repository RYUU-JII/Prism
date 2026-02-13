import { DEFAULT_UI_SETTINGS } from "../settings/uiSettings.js";

function buildCodeFingerprint(code) {
  const source = String(code || "").replace(/\r\n?/g, "\n");
  let hash = 2166136261;
  let lineCount = source ? 1 : 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charCodeAt(i);
    hash ^= ch;
    hash = Math.imul(hash, 16777619);
    if (ch === 10) lineCount += 1;
  }
  const hashHex = (hash >>> 0).toString(16).padStart(8, "0");
  return `${lineCount}L-${hashHex}`;
}

function normalizeCodeForPrompt(code) {
  return String(code || "").replace(/\r\n?/g, "\n");
}

function normalizeMemoForRequest(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n")
    .trim();
}

function normalizeInstructionTokenForRequest(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  if (!/^[A-Za-z0-9:_-]{1,64}$/.test(raw)) return "";
  return raw;
}

function normalizeSourceLineForRequest(text) {
  const raw = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, " ").trim();
  const maxLength = 240;
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

function toQuotedPromptField(value) {
  return JSON.stringify(String(value || ""));
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
    const codeLines = normalizeCodeForPrompt(payload?.code || "").split("\n");
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
  activeSelection = null,
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

  const normalizedCode = normalizeCodeForPrompt(safePayload.code || "");
  const codeLines = normalizedCode.split("\n");
  const promptLevel = 3;
  const isPatchMode = resolvedResponseMode === "patch";

  let codeLabel = safePayload.language || "text";
  let codeBody = normalizedCode;
  if (isPatchMode) {
    codeLabel = `${codeLabel} (full-numbered)`;
    codeBody = codeLines.map((line, index) => `${index + 1}|${line}`).join("\n");
  } else {
    codeLabel = `${codeLabel} (full)`;
  }

  const baseFingerprint = buildCodeFingerprint(safePayload.code);
  const activeLine = Number(activeSelection?.line);
  const activeToken = normalizeInstructionTokenForRequest(activeSelection?.token);
  const hasActiveSelection = Number.isFinite(activeLine) && activeLine > 0;
  let prompt = "";
  prompt += `[SRC] ${safePayload.url || "Unknown"}\n`;
  prompt += `[BASE] ${baseFingerprint}\n`;
  prompt += "[RULE] Treat [CURRENT_SOURCE_OF_TRUTH] as the single source of truth for this turn. Ignore prior chat code context.\n";
  prompt += `[CURRENT_SOURCE_OF_TRUTH ${codeLabel}]\n${codeBody}\n[/CURRENT_SOURCE_OF_TRUTH]\n`;
  prompt += "[REQUEST]\n";
  safeEntries.forEach((entry) => {
    const line = Number(entry?.line);
    const memo = normalizeMemoForRequest(entry?.memoText);
    if (!memo) return;
    if (!Number.isFinite(line) || line < 0) return;
    if (line === 0) {
      prompt += `GLOBAL memo=${toQuotedPromptField(memo)}\n`;
      return;
    }
    const token = normalizeInstructionTokenForRequest(entry?.token);
    const sourceLine = normalizeSourceLineForRequest(entry?.sourceLineText);
    const lineToken = token ? ` token=${token}` : "";
    const sourceHint = sourceLine ? ` source=${toQuotedPromptField(sourceLine)}` : "";
    prompt += `TARGET line=${line}${lineToken}${sourceHint} memo=${toQuotedPromptField(memo)}\n`;
  });
  prompt += "[/REQUEST]\n";
  if (hasActiveSelection) {
    prompt += `[ACTIVE_TARGET] line=${activeLine}${activeToken ? ` token=${activeToken}` : ""}\n`;
  }
  if (safeRecoveryHint) {
    prompt += `[RECOVERY]\n${safeRecoveryHint}\n[/RECOVERY]\n`;
  }
  if (isPatchMode) {
    prompt += "[CONSTRAINT]\n";
    prompt += "no analysis / no planning text.\n";
    prompt += "output MUST be a single markdown code block with xml language tag.\n";
    prompt += "no text before or after the code block.\n";
    prompt += "inside the code block, the first tag must be <prism-patches>.\n";
    prompt += "line numbers must target [CURRENT_SOURCE_OF_TRUTH] above only.\n";
    prompt += "line prefixes like '73|' are reference markers only; never include those prefixes in REPLACEMENT.\n";
    prompt += "GLOBAL memo means untargeted intent; infer proper lines conservatively.\n";
    if (hasActiveSelection) {
      prompt += "prioritize [ACTIVE_TARGET] for destructive edits.\n";
      prompt += "preserve sibling nodes on the same line unless REQUEST explicitly asks for broader deletion.\n";
    }
    prompt += "Format example:\n";
    prompt += "```xml\n";
    prompt += `<prism-patches v="1" b="${baseFingerprint}">\n`;
    prompt += '<prism-patch s="START" e="END">\n';
    prompt += "REPLACEMENT\n";
    prompt += "</prism-patch>\n";
    prompt += "</prism-patches>\n";
    prompt += "```\n";
    prompt += "s/e = original line numbers (1-index, inclusive), multi patches allowed, sorted asc, non-overlap.\n";
    prompt += 'no full code. no change => ```xml\\n<prism-patches v="1"/>\\n```.\n';
  } else {
    prompt += "[CONSTRAINT]\n";
    prompt += "return full updated code only.\n";
    prompt += "no markdown fences, no analysis, no extra prose.\n";
    if (hasActiveSelection) {
      prompt += "prioritize [ACTIVE_TARGET] and keep same-line siblings unless explicitly requested.\n";
    }
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
