const PATCH_FULL_SYNC_CADENCE_OPTIONS = [0, 2, 3, 5, 8];
const UI_SETTINGS_KEY = "prism-ui-settings-v3";
const LEGACY_THEME_KEY = "prism-expert-theme";
const CORE_POLICY_PROFILE_VERSION = 1;
const AUTO_IMPORT_DEFAULT_VERSION = 1;
const VALID_THEME_MODES = ["detect", "light", "dark"];
const VALID_STARTUP_MODES = ["view", "edit"];

const DEFAULT_UI_SETTINGS = {
  themeMode: "detect",
  lockInteractionsWhenPaused: true,
  showTooltips: true,
  debugPickerOverlay: false,
  captureRange: "visible",
  memoResetPolicy: "on_copy",
  keepPickerActiveAfterSelect: true,
  pickerAutoPause: false,
  pickerHighlight: {
    strength: "medium",
    color: "#14b8a6",
  },
  aiResponseMode: "patch",
  adaptiveResponseRouting: true,
  autoImportResponse: false,
  autoImportResponseVersion: AUTO_IMPORT_DEFAULT_VERSION,
  patchFullSyncEvery: 0,
  retryFullSyncOnReject: false,
  exportAction: "inject",
  startupMode: "view",
  corePolicyProfileVersion: CORE_POLICY_PROFILE_VERSION,
};

function loadUiSettings() {
  try {
    const raw = localStorage.getItem(UI_SETTINGS_KEY);
    if (!raw) return DEFAULT_UI_SETTINGS;
    const parsed = JSON.parse(raw);
    const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
    const themeMode = VALID_THEME_MODES.includes(parsed?.themeMode)
      ? parsed.themeMode
      : legacyTheme === "light" || legacyTheme === "dark"
        ? legacyTheme
        : DEFAULT_UI_SETTINGS.themeMode;
    const storedProfileVersion = Number(parsed?.corePolicyProfileVersion || 0);
    const shouldApplyCorePolicyProfile = storedProfileVersion < CORE_POLICY_PROFILE_VERSION;
    const startupMode = VALID_STARTUP_MODES.includes(parsed?.startupMode)
      ? parsed.startupMode
      : DEFAULT_UI_SETTINGS.startupMode;
    const captureRange = ["visible", "full"].includes(parsed?.captureRange)
      ? parsed.captureRange
      : DEFAULT_UI_SETTINGS.captureRange;
    let memoResetPolicy = ["on_code_change", "on_copy", "manual"].includes(parsed?.memoResetPolicy)
      ? parsed.memoResetPolicy
      : DEFAULT_UI_SETTINGS.memoResetPolicy;
    const legacyStrength = ["subtle", "medium", "strong"].includes(parsed?.highlightStrength)
      ? parsed.highlightStrength
      : DEFAULT_UI_SETTINGS.pickerHighlight.strength;
    const legacyColor =
      typeof parsed?.highlightColor === "string" && parsed.highlightColor.trim()
        ? parsed.highlightColor
        : DEFAULT_UI_SETTINGS.pickerHighlight.color;
    const pickerHighlightRaw =
      parsed?.pickerHighlight && typeof parsed.pickerHighlight === "object"
        ? parsed.pickerHighlight
        : null;
    const pickerHighlight = {
      strength: ["subtle", "medium", "strong"].includes(pickerHighlightRaw?.strength)
        ? pickerHighlightRaw.strength
        : legacyStrength,
      color:
        typeof pickerHighlightRaw?.color === "string" && pickerHighlightRaw.color.trim()
          ? pickerHighlightRaw.color
          : legacyColor,
    };
    let exportAction = ["copy", "inject", "send"].includes(parsed?.exportAction)
      ? parsed.exportAction
      : DEFAULT_UI_SETTINGS.exportAction;
    let autoImportResponse =
      typeof parsed?.autoImportResponse === "boolean"
        ? parsed.autoImportResponse
        : DEFAULT_UI_SETTINGS.autoImportResponse;
    const storedAutoImportVersion = Number(parsed?.autoImportResponseVersion || 0);
    let patchFullSyncEvery = PATCH_FULL_SYNC_CADENCE_OPTIONS.includes(Number(parsed?.patchFullSyncEvery))
      ? Number(parsed.patchFullSyncEvery)
      : DEFAULT_UI_SETTINGS.patchFullSyncEvery;
    let retryFullSyncOnReject =
      typeof parsed?.retryFullSyncOnReject === "boolean"
        ? parsed.retryFullSyncOnReject
        : DEFAULT_UI_SETTINGS.retryFullSyncOnReject;
    let aiResponseMode = ["full", "patch"].includes(parsed?.aiResponseMode)
      ? parsed.aiResponseMode
      : DEFAULT_UI_SETTINGS.aiResponseMode;
    let adaptiveResponseRouting =
      typeof parsed?.adaptiveResponseRouting === "boolean"
        ? parsed.adaptiveResponseRouting
        : DEFAULT_UI_SETTINGS.adaptiveResponseRouting;

    if (shouldApplyCorePolicyProfile) {
      memoResetPolicy = DEFAULT_UI_SETTINGS.memoResetPolicy;
      exportAction = DEFAULT_UI_SETTINGS.exportAction;
      autoImportResponse = DEFAULT_UI_SETTINGS.autoImportResponse;
      patchFullSyncEvery = DEFAULT_UI_SETTINGS.patchFullSyncEvery;
      retryFullSyncOnReject = DEFAULT_UI_SETTINGS.retryFullSyncOnReject;
      adaptiveResponseRouting = DEFAULT_UI_SETTINGS.adaptiveResponseRouting;
      aiResponseMode = DEFAULT_UI_SETTINGS.aiResponseMode;
    }
    if (storedAutoImportVersion < AUTO_IMPORT_DEFAULT_VERSION) {
      autoImportResponse = DEFAULT_UI_SETTINGS.autoImportResponse;
    }

    return {
      themeMode,
      lockInteractionsWhenPaused:
        typeof parsed?.lockInteractionsWhenPaused === "boolean"
          ? parsed.lockInteractionsWhenPaused
          : DEFAULT_UI_SETTINGS.lockInteractionsWhenPaused,
      showTooltips:
        typeof parsed?.showTooltips === "boolean"
          ? parsed.showTooltips
          : typeof parsed?.hideHintOverlay === "boolean"
            ? !parsed.hideHintOverlay
            : DEFAULT_UI_SETTINGS.showTooltips,
      debugPickerOverlay:
        typeof parsed?.debugPickerOverlay === "boolean"
          ? parsed.debugPickerOverlay
          : DEFAULT_UI_SETTINGS.debugPickerOverlay,
      captureRange,
      memoResetPolicy,
      keepPickerActiveAfterSelect:
        typeof parsed?.keepPickerActiveAfterSelect === "boolean"
          ? parsed.keepPickerActiveAfterSelect
          : DEFAULT_UI_SETTINGS.keepPickerActiveAfterSelect,
      pickerAutoPause:
        typeof parsed?.pickerAutoPause === "boolean"
          ? parsed.pickerAutoPause
          : DEFAULT_UI_SETTINGS.pickerAutoPause,
      pickerHighlight,
      exportAction,
      startupMode,
      autoImportResponse,
      autoImportResponseVersion: AUTO_IMPORT_DEFAULT_VERSION,
      patchFullSyncEvery,
      retryFullSyncOnReject,
      adaptiveResponseRouting,
      aiResponseMode,
      corePolicyProfileVersion: CORE_POLICY_PROFILE_VERSION,
    };
  } catch (err) {
    return DEFAULT_UI_SETTINGS;
  }
}

function resolveThemeModeTheme(themeMode, detectedTheme) {
  if (themeMode === "light" || themeMode === "dark") return themeMode;
  return detectedTheme === "dark" ? "dark" : "light";
}

export {
  PATCH_FULL_SYNC_CADENCE_OPTIONS,
  UI_SETTINGS_KEY,
  VALID_THEME_MODES,
  VALID_STARTUP_MODES,
  DEFAULT_UI_SETTINGS,
  loadUiSettings,
  resolveThemeModeTheme,
};
