import React, { useEffect, useMemo, useRef, useState } from "react";

const NotesIsland = ({
  instructionEntries,
  instructionCount,
  canvasFrozen,
  pulseToken = 0,
  onInstructionHover,
  onInstructionSelect,
  onInstructionDelete,
  onClearAllInstructions,
}) => {
  const entries = Array.isArray(instructionEntries) ? instructionEntries : [];
  const hasEntries = entries.length > 0;
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [pulseActive, setPulseActive] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [hoveredLine, setHoveredLine] = useState(null);
  const rootRef = useRef(null);
  const pulseTimerRef = useRef(null);
  const isExpanded = isHovered || isPinned;

  const clearPreview = () => {
    setHoveredLine(null);
    onInstructionHover?.(null);
  };

  useEffect(() => {
    return () => {
      if (!pulseTimerRef.current) return;
      window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!pulseToken) return;
    setPulseActive(true);
    if (pulseTimerRef.current) {
      window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
    pulseTimerRef.current = window.setTimeout(() => {
      setPulseActive(false);
      pulseTimerRef.current = null;
    }, 720);
  }, [pulseToken]);

  useEffect(() => {
    if (isExpanded) return;
    setClearConfirmOpen(false);
    clearPreview();
  }, [isExpanded]);

  useEffect(() => {
    if (!isPinned) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setIsPinned(false);
      setIsHovered(false);
      setClearConfirmOpen(false);
      clearPreview();
    };
    const handleEsc = (event) => {
      if (event.key !== "Escape") return;
      if (clearConfirmOpen) {
        setClearConfirmOpen(false);
        return;
      }
      setIsPinned(false);
      setIsHovered(false);
      clearPreview();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [clearConfirmOpen, isPinned]);

  const islandStatus = useMemo(() => {
    if (isPinned) return "PINNED";
    if (clearConfirmOpen) return "CLEAR?";
    if (isHovered && hasEntries) return "REVIEW";
    if (isHovered && !hasEntries) return "EMPTY";
    if (instructionCount > 0) return "STAGED";
    if (canvasFrozen) return "PAUSED";
    return "";
  }, [canvasFrozen, clearConfirmOpen, hasEntries, instructionCount, isHovered, isPinned]);

  const islandLabel = useMemo(() => {
    const baseLabel = `NOTES ${instructionCount}`;
    if (!islandStatus) return baseLabel;
    return `${baseLabel} ${islandStatus}`;
  }, [instructionCount, islandStatus]);

  const setPreviewLine = (line) => {
    const numericLine = Number(line);
    if (numericLine === 0) {
      setHoveredLine(0);
      onInstructionHover?.(null);
      return;
    }
    if (!Number.isFinite(numericLine) || numericLine < 0) {
      clearPreview();
      return;
    }
    setHoveredLine(numericLine);
    onInstructionHover?.(numericLine);
  };

  const handleSelectEntry = (entry) => {
    onInstructionSelect?.(entry);
    setClearConfirmOpen(false);
    clearPreview();
    if (!isPinned) {
      setIsHovered(false);
    }
  };

  const handleConfirmClear = () => {
    if (!hasEntries) return;
    onClearAllInstructions?.();
    setClearConfirmOpen(false);
  };

  return (
    <section
      ref={rootRef}
      className={`notes-island ${isExpanded ? "is-expanded" : ""} ${isPinned ? "is-pinned" : ""} ${pulseActive ? "is-pulse" : ""}`}
      aria-label={islandLabel}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => {
        if (isPinned) return;
        setIsHovered(false);
        clearPreview();
      }}
    >
      <button
        type="button"
        className="notes-island__bar"
        aria-expanded={isExpanded}
        aria-pressed={isPinned}
        aria-label={isPinned ? "메모 패널 고정 해제" : "메모 패널 고정"}
        onClick={() => {
          setIsPinned((prev) => !prev);
          setIsHovered(true);
          setClearConfirmOpen(false);
        }}
      >
        <span className={`notes-island__dot ${isPinned ? "is-pinned" : ""}`} aria-hidden="true">
          {isPinned ? (
            <svg className="notes-island__dot-pin" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 3h8v2l-2 2v4l2 2v2H8v-2l2-2V7L8 5V3Zm3 12h2v6l-1-1.5L11 21v-6Z" />
            </svg>
          ) : (
            <span className="notes-island__dot-core" />
          )}
        </span>
        <span className="notes-island__count">NOTES {instructionCount}</span>
        {islandStatus && <span className="notes-island__status">{islandStatus}</span>}
      </button>

      <div className="notes-island__panel" hidden={!isExpanded}>
        <div className="notes-island__panel-header">
          <span className="notes-island__panel-title">메모 {instructionCount}개</span>
          <div className="notes-island__panel-actions">
            <button
              type="button"
              className="notes-island__confirm-btn is-danger"
              disabled={!hasEntries}
              onClick={() => setClearConfirmOpen((prev) => !prev)}
            >
              전체 삭제
            </button>
          </div>
        </div>

        <div className="notes-island__rows" onPointerLeave={clearPreview}>
          {!hasEntries && <div className="notes-island__empty">아직 작성된 메모가 없습니다.</div>}
          {hasEntries &&
            entries.map((entry) => (
              <div
                key={`${entry.line}:${entry.token || ""}:${entry.memoText || ""}`}
                className={`notes-island__row ${hoveredLine === entry.line ? "is-hovered" : ""}`}
                onPointerEnter={() => setPreviewLine(entry.line)}
              >
                <button
                  type="button"
                  className={`notes-island__row-main ${hoveredLine === entry.line ? "is-hovered" : ""}`}
                  onFocus={() => setPreviewLine(entry.line)}
                  onBlur={(event) => {
                    if (event.currentTarget.parentElement?.contains(event.relatedTarget)) return;
                    clearPreview();
                  }}
                  onClick={() => handleSelectEntry(entry)}
                >
                  <span className="notes-island__line">
                    {Number(entry.line) > 0 ? `L${entry.line}` : "GEN"}
                  </span>
                  <span className="notes-island__memo">{entry.memoText}</span>
                </button>
                <button
                  type="button"
                  className="notes-island__row-delete"
                  aria-label={Number(entry.line) > 0 ? `Delete note on line ${entry.line}` : "Delete untargeted note"}
                  onFocus={() => setPreviewLine(entry.line)}
                  onBlur={(event) => {
                    if (event.currentTarget.parentElement?.contains(event.relatedTarget)) return;
                    clearPreview();
                  }}
                  onClick={() => onInstructionDelete?.(entry)}
                >
                  ×
                </button>
              </div>
            ))}
        </div>

        {clearConfirmOpen && hasEntries && (
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
