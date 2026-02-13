import React, { useEffect, useRef, useState } from "react";
import { SHORTCUT_LABELS, isModKey, keyEquals } from "../../../core/settings/shortcuts.js";

const CommandBar = ({
  onSend,
  onRequestRepair,
  onAddMemo,
  onRemoveMemo,
  onClearSelection,
  selectedLine,
  selectedMemoText,
  selectionToken,
  isExportDisabled,
  maxWidthPx,
  repairNudgeToken,
}) => {
  const inputRef = useRef(null);
  const helpRef = useRef(null);
  const repairNudgeTimerRef = useRef(null);
  const [text, setText] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [repairNudgeVisible, setRepairNudgeVisible] = useState(false);
  const hasSelection = Number.isFinite(selectedLine) && selectedLine > 0;
  const hasExistingMemo = Boolean((selectedMemoText || "").trim());
  const inputLocked = false;

  useEffect(() => {
    setText(selectedMemoText || "");
  }, [selectedLine, selectedMemoText]);

  const resizeInputToTwoLines = () => {
    const el = inputRef.current;
    if (!el) return;
    const style = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(style.lineHeight) || 16;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
    const minHeight = Math.ceil(lineHeight + paddingTop + paddingBottom + borderTop + borderBottom);
    const maxHeight = Math.ceil(lineHeight * 3 + paddingTop + paddingBottom + borderTop + borderBottom);

    el.style.height = "0px";
    const desired = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight));
    el.style.height = `${desired}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  useEffect(() => {
    resizeInputToTwoLines();
  }, [text, selectedLine, selectedMemoText]);

  useEffect(() => {
    if (!hasSelection) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [hasSelection, selectionToken]);

  useEffect(() => {
    if (!helpOpen) return undefined;
    const handleOutsidePointerDown = (event) => {
      if (!helpRef.current) return;
      if (helpRef.current.contains(event.target)) return;
      setHelpOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [helpOpen]);

  useEffect(() => {
    if (!repairNudgeToken) return;
    setRepairNudgeVisible(true);
    if (repairNudgeTimerRef.current) {
      window.clearTimeout(repairNudgeTimerRef.current);
    }
    repairNudgeTimerRef.current = window.setTimeout(() => {
      setRepairNudgeVisible(false);
      repairNudgeTimerRef.current = null;
    }, 5000);
  }, [repairNudgeToken]);

  useEffect(() => {
    return () => {
      if (!repairNudgeTimerRef.current) return;
      window.clearTimeout(repairNudgeTimerRef.current);
      repairNudgeTimerRef.current = null;
    };
  }, []);

  const handleSend = () => {
    onSend?.();
  };

  const handleRepair = () => {
    onRequestRepair?.();
    setRepairNudgeVisible(false);
    setHelpOpen(false);
  };

  const handleSaveMemoOnly = () => {
    const value = text.trim();
    if (!value) return;
    const saved = onAddMemo?.(value);
    if (saved !== false) {
      setText("");
    }
  };

  const handleDeleteMemoOnly = () => {
    if (!hasExistingMemo) return;
    onRemoveMemo?.();
  };

  const handleClearDraftOnly = () => {
    if (!text) return;
    setText("");
  };

  const handleSaveOrDelete = () => {
    const value = text.trim();
    if (value) {
      handleSaveMemoOnly();
      return;
    }
    if (hasExistingMemo) {
      onRemoveMemo?.();
    }
  };

  const handleKeyDown = (event) => {
    const mod = isModKey(event);
    if (mod && !event.shiftKey && !event.altKey && keyEquals(event, "Enter")) {
      event.preventDefault();
      handleSend();
      return;
    }
    if (mod && !event.altKey && !event.shiftKey && keyEquals(event, "s")) {
      event.preventDefault();
      handleSaveMemoOnly();
      return;
    }
    if (mod && !event.altKey && event.shiftKey && keyEquals(event, "Backspace")) {
      event.preventDefault();
      handleDeleteMemoOnly();
      return;
    }
    if (!mod && !event.altKey && event.shiftKey && keyEquals(event, "Backspace")) {
      event.preventDefault();
      handleClearDraftOnly();
      return;
    }
    if (!mod && !event.altKey && keyEquals(event, "Enter") && !event.shiftKey) {
      event.preventDefault();
      handleSaveOrDelete();
      return;
    }
    if (keyEquals(event, "Escape")) {
      onClearSelection?.();
    }
  };

  const inputWrapperStyle =
    Number.isFinite(maxWidthPx) && maxWidthPx > 0
      ? { "--panel-shell-command-max-width": `${Math.round(maxWidthPx)}px` }
      : undefined;

  return (
    <div className="panel-shell__command-bar">
      <div className="panel-shell__command-input-wrapper" style={inputWrapperStyle}>
        <div className="panel-shell__command-help" ref={helpRef}>
          {repairNudgeVisible && (
            <button
              type="button"
              className="panel-shell__command-repair-cta"
              onClick={handleRepair}
              aria-label="Repair with full code"
            >
              Full Code Repair
            </button>
          )}
          <button
            type="button"
            className={`panel-shell__command-help-btn ${helpOpen ? "is-open" : ""}`}
            aria-label="Picker and memo shortcut help"
            aria-expanded={helpOpen ? "true" : "false"}
            onClick={() => setHelpOpen((prev) => !prev)}
          >
            ?
          </button>
          {helpOpen && (
            <div className="panel-shell__command-help-popover" role="dialog" aria-label="Shortcut help">
              <p>정책: 선택/메모 편집은 명시적 입력만 반영됩니다.</p>
              <p>피킹: {SHORTCUT_LABELS.pickByClick}</p>
              <p>피커 토글: {SHORTCUT_LABELS.togglePicker}</p>
              <p>메모 저장: Enter</p>
              <p>전송: {SHORTCUT_LABELS.send}</p>
              <button
                type="button"
                className="panel-shell__command-repair-popover-btn"
                onClick={handleRepair}
              >
                Repair with Full Code
              </button>
            </div>
          )}
        </div>
        <div className={`panel-shell__command-editor ${hasSelection ? "" : "is-unselected"}`}>
          {hasSelection && (
            <span className="panel-shell__command-target-tag" aria-hidden="true">
              L{selectedLine}
            </span>
          )}
          <textarea
            ref={inputRef}
            className="panel-shell__command-input"
            placeholder={
              hasSelection
                ? "선택 라인 메모를 입력하고 Enter"
                : "라인 미지정 메모를 입력하세요 (서술형 설명 가능)"
            }
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onInput={resizeInputToTwoLines}
            onKeyDown={handleKeyDown}
            disabled={inputLocked}
          />
          <div className="panel-shell__command-actions">
            {hasSelection && (
              <button
                type="button"
                className="panel-shell__command-clear-inline"
                aria-label="Clear selected line"
                onClick={onClearSelection}
              >
                ×
              </button>
            )}
            <button
              type="button"
              className="panel-shell__command-send-inline"
              onClick={handleSend}
              disabled={isExportDisabled}
              data-tooltip="Send to AI (All memos & code)"
              aria-label="Send to AI"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21.99 21 1 12 21.99 3 22 10 7 12l15 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandBar;
