import React from 'react';

const Header = ({
  onSaveHtml,
  onSnapshot,
  onCopy,
  onOpenWindow,
  onThemeToggle,
  onExportPrompt,
  pickerActive,
  onPickerToggle,
  isPickerDisabled,
  instructionCount,
  canvasFrozen,
  onFreezeToggle,
}) => {
  return (
    <header className="panel-shell__bar">
      <div className="panel-shell__left">
        <div
          className="panel-shell__title clickable"
          onClick={onThemeToggle}
          role="button"
          tabIndex={0}
          title="Change Theme"
        >
          Prism
        </div>
        <button
          className="panel-shell__action panel-shell__action--ghost"
          type="button"
          aria-label="Open in window"
          data-tooltip="Open in window"
          onClick={onOpenWindow}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2H6v8H4V6Zm6 6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-6Zm2 0v6h7v-6h-7Z"
            />
          </svg>
        </button>
      </div>
      <div className="panel-shell__actions">
        {/* Play/Pause toggle */}
        <button
          className={`panel-shell__action ${canvasFrozen ? 'panel-shell__action--pause' : 'panel-shell__action--play'}`}
          type="button"
          onClick={onFreezeToggle}
          aria-label={canvasFrozen ? 'Play animations' : 'Pause animations'}
          data-tooltip={canvasFrozen ? 'Play' : 'Pause'}
        >
          {canvasFrozen ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
          )}
        </button>
        {/* Picker toggle */}
        <button
          className={`panel-shell__action ${pickerActive ? 'panel-shell__action--active' : ''}`}
          type="button"
          onClick={onPickerToggle}
          disabled={isPickerDisabled}
          aria-label="Toggle element picker"
          data-tooltip="Element picker"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17.5 12a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Zm0-2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM7 17l5-5 1.4 1.4L8.4 18.4 11 21H3v-8l2.6 2.6L7 17Z" />
          </svg>
        </button>
        {/* Export prompt */}
        <button
          className="panel-shell__action panel-shell__action--export"
          type="button"
          onClick={onExportPrompt}
          aria-label="Export AI prompt"
          data-tooltip="Export prompt"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" />
          </svg>
          {instructionCount > 0 && (
            <span className="action-count-badge">{instructionCount}</span>
          )}
        </button>
        <span className="panel-shell__divider" />
        <button
          className="panel-shell__action"
          type="button"
          aria-label="Save HTML"
          data-tooltip="Save HTML"
          onClick={onSaveHtml}
        >
          <span>HTML</span>
        </button>
        <button
          className="panel-shell__action"
          type="button"
          aria-label="Save image"
          data-tooltip="Save image"
          onClick={onSnapshot}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M8.5 7.5h7l1.2 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.3l1.2-2Zm3.5 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"
            />
          </svg>
        </button>
        <button
          className="panel-shell__action"
          type="button"
          aria-label="Copy image"
          data-tooltip="Copy image"
          onClick={onCopy}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M8 7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2Zm2 0v9a2 2 0 0 0 2 2h5v2H6V9h2Zm2 0h7v9h-7V7Z"
            />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default Header;
