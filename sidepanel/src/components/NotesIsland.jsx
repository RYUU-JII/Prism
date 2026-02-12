import React, { useEffect, useMemo, useRef, useState } from "react";

const HOVER_OPEN_DELAY_MS = 250;
const HOVER_CLOSE_DELAY_MS = 250;

const NotesIsland = ({
  instructionEntries,
  instructionCount,
  toastMessage,
  pickerActive,
  canvasFrozen,
  onInstructionHover,
  onInstructionSelect,
  onInstructionDelete,
  onClearAllInstructions,
}) => {
  const entries = Array.isArray(instructionEntries) ? instructionEntries : [];
  const hasEntries = entries.length > 0;
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [hoveredLine, setHoveredLine] = useState(null);
  const [pointerInside, setPointerInside] = useState(false);
  const rootRef = useRef(null);
  const hoverOpenTimerRef = useRef(null);
  const hoverCloseTimerRef = useRef(null);

  const clearHoverOpenTimer = () => {
    if (!hoverOpenTimerRef.current) return;
    window.clearTimeout(hoverOpenTimerRef.current);
    hoverOpenTimerRef.current = null;
  };

  const clearHoverCloseTimer = () => {
    if (!hoverCloseTimerRef.current) return;
    window.clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = null;
  };

  const clearPreview = () => {
    setHoveredLine(null);
    onInstructionHover?.(null);
  };

  const closePanel = () => {
    setExpanded(false);
    setClearConfirmOpen(false);
    clearPreview();
    clearHoverOpenTimer();
    clearHoverCloseTimer();
  };

  const scheduleHoverOpen = () => {
    if (pinned) {
      setExpanded(true);
      return;
    }
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    hoverOpenTimerRef.current = window.setTimeout(() => {
      hoverOpenTimerRef.current = null;
      setExpanded(true);
    }, HOVER_OPEN_DELAY_MS);
  };

  const scheduleHoverClose = () => {
    if (pinned) return;
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      hoverCloseTimerRef.current = null;
      closePanel();
    }, HOVER_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      clearHoverOpenTimer();
      clearHoverCloseTimer();
    };
  }, []);

  useEffect(() => {
    if (expanded) return;
    setClearConfirmOpen(false);
    clearPreview();
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return undefined;
    const handleEsc = (event) => {
      if (event.key !== "Escape") return;
      if (clearConfirmOpen) {
        setClearConfirmOpen(false);
        return;
      }
      if (pinned) {
        const stillHovering = pointerInside || rootRef.current?.matches?.(":hover");
        setPinned(false);
        if (!stillHovering) closePanel();
        return;
      }
      scheduleHoverClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [clearConfirmOpen, expanded, pinned, pointerInside]);

  const idleMessage = useMemo(() => {
    if (pickerActive) return "피커 모드 활성";
    if (canvasFrozen) return "일시정지 상태";
    if (hasEntries) return "메모 상태 대기";
    return "메모가 없습니다.";
  }, [canvasFrozen, hasEntries, pickerActive]);

  const barMessage = toastMessage && toastMessage.trim() ? toastMessage : idleMessage;

  const setPreviewLine = (line) => {
    const numericLine = Number(line);
    if (!Number.isFinite(numericLine) || numericLine <= 0) {
      clearPreview();
      return;
    }
    setHoveredLine(numericLine);
    onInstructionHover?.(numericLine);
  };

  const handleClearRequest = () => {
    if (!hasEntries) return;
    setPinned(true);
    setExpanded(true);
    setClearConfirmOpen((prev) => !prev);
  };

  const handleConfirmClear = () => {
    if (!hasEntries) return;
    onClearAllInstructions?.();
    setClearConfirmOpen(false);
  };

  const handleBarClick = () => {
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    setClearConfirmOpen(false);

    if (pinned) {
      const stillHovering = pointerInside || rootRef.current?.matches?.(":hover");
      setPinned(false);
      if (!stillHovering) {
        closePanel();
      }
      return;
    }

    setPinned(true);
    setExpanded(true);
  };

  const handleBarKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleBarClick();
  };

  return (
    <section
      ref={rootRef}
      className={`notes-island ${expanded ? "is-expanded" : ""} ${pinned ? "is-pinned" : ""} ${toastMessage ? "has-toast" : ""}`}
      onMouseEnter={() => {
        setPointerInside(true);
        scheduleHoverOpen();
      }}
      onMouseLeave={() => {
        setPointerInside(false);
        clearPreview();
        scheduleHoverClose();
      }}
      onFocusCapture={() => {
        clearHoverCloseTimer();
        setExpanded(true);
      }}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        scheduleHoverClose();
      }}
      aria-label="Notes island"
    >
      <div
        className="notes-island__bar"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={pinned ? "Unpin notes panel" : "Pin notes panel"}
        onKeyDown={handleBarKeyDown}
        onClick={handleBarClick}
      >
        <span className={`notes-island__dot ${pinned ? "is-pinned" : ""}`} aria-hidden="true">
          {!pinned && <span className="notes-island__dot-core" />}
          {pinned && (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 4h8v2l-2 2v4l2 2v2H8v-2l2-2V8L8 6V4Zm3 12h2v4l-1.1-1.6L11 20v-4Z" />
            </svg>
          )}
        </span>
        <span className="notes-island__message">{barMessage}</span>
        <span className="notes-island__count">{instructionCount}개</span>
        {pinned && (
          <button
            type="button"
            className="notes-island__row-delete notes-island__bar-trash"
            aria-label="Clear all notes"
            disabled={!hasEntries}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleClearRequest();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5h8l.7 1H20v2H4V6h3.3L8 5Zm0 4h8l-.5 9a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2L8 9Zm2 1v7h2v-7h-2Zm4 0v7h1v-7h-1Z" />
            </svg>
          </button>
        )}
      </div>
      <div className="notes-island__panel">
        <div className="notes-island__rows">
          {!hasEntries && <div className="notes-island__empty">아직 작성된 메모가 없습니다.</div>}
          {hasEntries &&
            entries.map((entry) => (
              <div
                key={entry.line}
                className={`notes-island__row ${hoveredLine === entry.line ? "is-hovered" : ""}`}
                onPointerEnter={() => setPreviewLine(entry.line)}
                onPointerLeave={clearPreview}
              >
                <button
                  type="button"
                  className={`notes-island__row-main ${hoveredLine === entry.line ? "is-hovered" : ""}`}
                  onFocus={() => setPreviewLine(entry.line)}
                  onBlur={(event) => {
                    if (event.currentTarget.parentElement?.contains(event.relatedTarget)) return;
                    clearPreview();
                  }}
                  onClick={() => {
                    onInstructionSelect?.(entry.line);
                    if (!pinned) closePanel();
                  }}
                >
                  <span className="notes-island__line">L{entry.line}</span>
                  <span className="notes-island__memo">{entry.memoText}</span>
                </button>
                <button
                  type="button"
                  className="notes-island__row-delete"
                  aria-label={`Delete note on line ${entry.line}`}
                  onFocus={() => setPreviewLine(entry.line)}
                  onBlur={(event) => {
                    if (event.currentTarget.parentElement?.contains(event.relatedTarget)) return;
                    clearPreview();
                  }}
                  onClick={() => onInstructionDelete?.(entry.line)}
                >
                  ×
                </button>
              </div>
            ))}
        </div>
        {clearConfirmOpen && pinned && (
          <div className="notes-island__confirm" role="alertdialog" aria-live="assertive">
            <div className="notes-island__confirm-copy">
              이 작업에서 작성한 {instructionCount}개의 메모가 모두 삭제됩니다.
            </div>
            <div className="notes-island__confirm-actions">
              <button
                type="button"
                className="notes-island__confirm-btn"
                onClick={() => setClearConfirmOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="notes-island__confirm-btn is-danger"
                onClick={handleConfirmClear}
              >
                전체 삭제
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default NotesIsland;
