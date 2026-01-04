import React from 'react';

const Header = ({ onSaveHtml, onSnapshot, onCopy }) => {
  const handleOpenWindow = () => {
    alert("This feature is being migrated.");
  };

  return (
    <header className="panel-shell__bar">
      <div className="panel-shell__left">
        <div className="panel-shell__title">Prism</div>
        <button
          className="panel-shell__action panel-shell__action--ghost"
          type="button"
          aria-label="Open in window"
          data-tooltip="Open in window"
          onClick={handleOpenWindow}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2H6v8H4V6Zm6 6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-6Zm2 0v6h7v-6h-7Z"
            />
          </svg>
        </button>
      </div>
      <div className="panel-shell__actions">
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
