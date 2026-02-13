import React, { useEffect, useRef, useState } from "react";

const CommandBar = ({
  onSend,
  onAddMemo,
  onRemoveMemo,
  onClearSelection,
  selectedLine,
  selectedMemoText,
  selectionToken,
  isPickerActive,
  isInputDisabled,
  isExportDisabled,
  memoCount = 0,
  rightSlot = null,
}) => {
  const inputRef = useRef(null);
  const sendFxTimerRef = useRef(null);
  const [text, setText] = useState("");
  const [sendFxActive, setSendFxActive] = useState(false);
  const hasSelection = Number.isFinite(selectedLine) && selectedLine > 0;
  const hasExistingMemo = Boolean((selectedMemoText || "").trim());
  const inputLocked = !isPickerActive || isInputDisabled || !hasSelection;

  useEffect(() => {
    setText(selectedMemoText || "");
  }, [selectedLine, selectedMemoText]);

  useEffect(() => {
    if (!hasSelection) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [hasSelection, selectionToken]);

  useEffect(() => {
    return () => {
      if (!sendFxTimerRef.current) return;
      window.clearTimeout(sendFxTimerRef.current);
      sendFxTimerRef.current = null;
    };
  }, []);

  const handleSubmit = () => {
    const value = text.trim();
    if (!value) return;
    const saved = onAddMemo?.(value);
    if (saved !== false) {
      setText("");
    }
  };

  const handleSend = () => {
    onSend?.();
    setSendFxActive(true);
    if (sendFxTimerRef.current) {
      window.clearTimeout(sendFxTimerRef.current);
      sendFxTimerRef.current = null;
    }
    sendFxTimerRef.current = window.setTimeout(() => {
      setSendFxActive(false);
      sendFxTimerRef.current = null;
    }, 820);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
      return;
    }
    if (event.key === "Escape") {
      onClearSelection?.();
    }
  };

  const baseHint = hasSelection ? "Enter 저장 / Shift+Enter 줄바꿈" : "요소 선택 대기중";
  const hintText = baseHint;

  return (
    <div className={`panel-shell__command-bar ${sendFxActive ? "is-send-fx" : ""}`}>
      <div className="panel-shell__command-energy" aria-hidden="true" />
      <div className="panel-shell__command-edge-flash" aria-hidden="true" />
      <button
        type="button"
        className="panel-shell__command-send"
        onClick={handleSend}
        disabled={isExportDisabled}
        data-tooltip="Send to AI (All memos & code)"
      >
        <div className="panel-shell__command-send-inner">
          <svg viewBox="0 0 24 24">
            <path d="M21.99 21 1 12 21.99 3 22 10 7 12l15 2z" />
          </svg>
          {memoCount > 0 && (
            <span className="panel-shell__command-badge">{memoCount}</span>
          )}
        </div>
      </button>

      <div className="panel-shell__command-input-wrapper">
        <div className="panel-shell__command-topline">
          <span className={`panel-shell__command-line ${hasSelection ? "is-selected" : ""}`}>
            {hasSelection ? `Line ${selectedLine}` : "No target"}
          </span>
          <div className="panel-shell__command-actions">
            {hasSelection && (
              <>
              {hasExistingMemo && (
                <button
                  type="button"
                  className="panel-shell__command-mini danger"
                  onClick={onRemoveMemo}
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                className="panel-shell__command-mini"
                onClick={onClearSelection}
              >
                Clear
              </button>
              </>
            )}
          </div>
        </div>
        <textarea
          ref={inputRef}
          className="panel-shell__command-input"
          placeholder={
            hasSelection
              ? "메모를 입력하고 Enter"
              : isPickerActive
                ? "요소를 클릭해 메모 대상을 선택하세요"
                : "피커를 활성화해 요소를 선택하세요"
          }
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputLocked}
        />
        <div className="panel-shell__command-bottom">
          <span className="panel-shell__command-hint">{hintText}</span>
          <button
            type="button"
            className="panel-shell__command-submit"
            onClick={handleSubmit}
            disabled={inputLocked || !text.trim()}
          >
            Save
          </button>
        </div>
      </div>
      <div className="panel-shell__command-side">{rightSlot}</div>
    </div>
  );
};

export default CommandBar;
