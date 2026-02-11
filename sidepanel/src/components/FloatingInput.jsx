import React, { useState, useEffect, useRef } from 'react';

const FloatingInput = ({
    line,
    initialValue,
    elementRect,
    viewerRect,
    canvasFrozen,
    onSave,
    onRemove,
    onClose,
}) => {
    const [text, setText] = useState(initialValue || '');
    const inputRef = useRef(null);
    const containerRef = useRef(null);
    const hasExisting = Boolean(initialValue);

    useEffect(() => {
        setText(initialValue || '');
    }, [initialValue, line]);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [line]);

    const handleSubmit = () => {
        if (!text.trim()) return;
        onSave(text.trim());
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    // Calculate position — compact card near the element
    const cardWidth = 260;
    let posStyle = {};

    // Check if it's the background (covers most of the viewer)
    const isBackground = elementRect && viewerRect &&
        elementRect.width > viewerRect.width * 0.9 &&
        elementRect.height > viewerRect.height * 0.9;

    if (elementRect && viewerRect) {
        if (isBackground) {
            // Pin to top-left of the viewer for background/global mode
            posStyle = {
                position: 'fixed',
                left: `${viewerRect.left + 12}px`,
                top: `${viewerRect.top + 12}px`,
                width: `${cardWidth}px`,
            };
        } else {
            const elCenterY = elementRect.top + elementRect.height / 2;
            const viewerH = viewerRect.height;
            const placeBelow = elCenterY < viewerH * 0.6;

            const top = placeBelow
                ? viewerRect.top + elementRect.top + elementRect.height + 8
                : viewerRect.top + elementRect.top - 8;

            // Horizontal: try to align with element's left edge, clamp within viewport
            const elLeft = viewerRect.left + Math.min(elementRect.left, viewerRect.width - cardWidth - 12);
            const clampedLeft = Math.max(12, Math.min(elLeft, window.innerWidth - cardWidth - 12));

            posStyle = {
                position: 'fixed',
                left: `${clampedLeft}px`,
                width: `${cardWidth}px`,
                ...(placeBelow
                    ? { top: `${top}px` }
                    : { bottom: `${window.innerHeight - top}px` }),
            };
        }
    } else {
        // Fallback: bottom-center
        posStyle = {
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: '80px',
            width: `${cardWidth}px`,
        };
    };

    return (
        <>
            {/* Backdrop to close on outside click */}
            <div
                className="floating-input-backdrop"
                onClick={onClose}
            />
            <div
                ref={containerRef}
                className="floating-input"
                style={posStyle}
            >
                <div className="floating-input__header">
                    <span className="floating-input__line-tag">
                        {isBackground ? 'Background' : `Line ${line}`}
                    </span>
                    <span
                        className={`floating-input__state ${canvasFrozen ? 'is-paused' : 'is-playing'}`}
                        title={canvasFrozen ? 'Canvas paused' : 'Canvas playing'}
                    >
                        {canvasFrozen ? 'Paused' : 'Playing'}
                    </span>
                    {hasExisting && (
                        <button
                            className="floating-input__remove"
                            onClick={onRemove}
                            title="메모 삭제"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                            </svg>
                        </button>
                    )}
                    <button
                        className="floating-input__close"
                        onClick={onClose}
                        aria-label="닫기"
                    >✕</button>
                </div>
                <div className="floating-input__body">
                    <input
                        ref={inputRef}
                        className="floating-input__field"
                        type="text"
                        placeholder="AI에게 지시 입력..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    {text.trim() && (
                        <button
                            className="floating-input__send"
                            onClick={handleSubmit}
                            aria-label="저장"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};

export default FloatingInput;
