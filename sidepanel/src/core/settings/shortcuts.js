export const SHORTCUT_LABELS = Object.freeze({
  pauseResume: "Cmd/Ctrl+Shift+P",
  saveMemo: "Cmd/Ctrl+S",
  send: "Cmd/Ctrl+Enter",
  toggleViewMode: "Cmd/Ctrl+Shift+V",
  togglePicker: "P",
  pickByClick: "Alt+Click",
  clearDraftOnly: "Shift+Backspace",
  deleteMemo: "Cmd/Ctrl+Shift+Backspace",
  clearSelection: "Escape",
  clearAllMemos: "Cmd/Ctrl+Shift+X",
  showHelp: "Cmd/Ctrl+/",
});

export const SHORTCUT_HELP_TEXT = [
  `Pause ${SHORTCUT_LABELS.pauseResume}`,
  `Save ${SHORTCUT_LABELS.saveMemo}`,
  `Send ${SHORTCUT_LABELS.send}`,
  `Editor ${SHORTCUT_LABELS.toggleViewMode}`,
  `Picker ${SHORTCUT_LABELS.togglePicker}`,
  `Pick ${SHORTCUT_LABELS.pickByClick}`,
  `DraftClear ${SHORTCUT_LABELS.clearDraftOnly}`,
  `MemoDelete ${SHORTCUT_LABELS.deleteMemo}`,
  `Unselect ${SHORTCUT_LABELS.clearSelection}`,
  `AllClear ${SHORTCUT_LABELS.clearAllMemos}`,
  `Help ${SHORTCUT_LABELS.showHelp}`,
].join(" · ");

export function isModKey(event) {
  return Boolean(event?.metaKey || event?.ctrlKey);
}

export function keyEquals(event, key) {
  return String(event?.key || "").toLowerCase() === String(key || "").toLowerCase();
}

export function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;
  const element = typeof target.closest === "function" ? target : target?.parentElement;
  if (!element || typeof element.closest !== "function") return false;
  return Boolean(
    element.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox']"
    )
  );
}
