import React, { useEffect, useRef, useState } from 'react';

const Header = ({
  onSaveHtml,
  onSnapshot,
  onCopy,
  onOpenWindow,
  onExportPrompt,
  pickerActive,
  onPickerToggle,
  isPickerDisabled,
  instructionCount,
  canvasFrozen,
  onFreezeToggle,
  uiSettings,
  onToggleSetting,
  onUpdateSetting,
  theme,
  onThemeChange,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [utilityMenuOpen, setUtilityMenuOpen] = useState(false);
  const shellRef = useRef(null);
  const pickerHighlight = uiSettings?.pickerHighlight || {};

  useEffect(() => {
    if (!settingsOpen && !utilityMenuOpen) return undefined;

    const handleOutside = (event) => {
      const shell = shellRef.current;
      if (!shell || shell.contains(event.target)) return;
      setSettingsOpen(false);
      setUtilityMenuOpen(false);
    };

    const handleEsc = (event) => {
      if (event.key !== "Escape") return;
      if (utilityMenuOpen) {
        setUtilityMenuOpen(false);
        return;
      }
      setSettingsOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    window.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [settingsOpen, utilityMenuOpen]);

  useEffect(() => {
    if (settingsOpen) return;
    setUtilityMenuOpen(false);
  }, [settingsOpen]);

  const coreButtonDefs = [
    {
      id: "playPause",
      title: canvasFrozen ? "Play animations" : "Pause animations",
      tooltip: canvasFrozen ? "Play" : "Pause",
      action: onFreezeToggle,
      extraClass: canvasFrozen ? "panel-shell__action--pause" : "panel-shell__action--play",
      icon: canvasFrozen ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      ),
    },
    {
      id: "picker",
      title: "Toggle element picker",
      tooltip: "Element picker",
      action: onPickerToggle,
      extraClass: pickerActive ? "panel-shell__action--active" : "",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17.5 12a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Zm0-2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM7 17l5-5 1.4 1.4L8.4 18.4 11 21H3v-8l2.6 2.6L7 17Z" />
        </svg>
      ),
    },
    {
      id: "exportPrompt",
      title: "Export AI prompt",
      tooltip: "Export prompt",
      action: onExportPrompt,
      extraClass: "panel-shell__action--export",
      icon: (
        <>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" />
          </svg>
          {instructionCount > 0 && (
            <span className="action-count-badge">{instructionCount}</span>
          )}
        </>
      ),
    },
  ];

  const utilityButtonDefs = [
    {
      id: "openWindow",
      title: "Open In Window",
      tooltip: "Open window",
      action: onOpenWindow,
      extraClass: "panel-shell__action--ghost",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2H6v8H4V6Zm6 6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-6Zm2 0v6h7v-6h-7Z" />
        </svg>
      ),
    },
    {
      id: "saveHtml",
      title: "Save HTML",
      tooltip: "Save HTML",
      action: onSaveHtml,
      icon: <span>HTML</span>,
    },
    {
      id: "snapshot",
      title: "Save Image",
      tooltip: "Save image",
      action: onSnapshot,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.5 7.5h7l1.2 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.3l1.2-2Zm3.5 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
        </svg>
      ),
    },
    {
      id: "copyImage",
      title: "Copy Image",
      tooltip: "Copy image",
      action: onCopy,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2Zm2 0v9a2 2 0 0 0 2 2h5v2H6V9h2Zm2 0h7v9h-7V7Z" />
        </svg>
      ),
    },
  ];

  const toggleSettings = () => {
    setSettingsOpen((prev) => !prev);
    setUtilityMenuOpen(false);
  };

  const renderToolbarButton = (def, options = {}) => {
    const { disabled = false, inUtilityMenu = false } = options;
    const classes = [
      "panel-shell__action",
      def.extraClass,
      inUtilityMenu ? "panel-shell__utility-menu-item" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        key={def.id}
        className={classes}
        type="button"
        aria-label={def.title}
        data-tooltip={def.tooltip}
        role={inUtilityMenu ? "menuitem" : undefined}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          def.action?.();
          if (inUtilityMenu) {
            setUtilityMenuOpen(false);
          }
        }}
      >
        {def.icon}
      </button>
    );
  };

  return (
    <header
      ref={shellRef}
      className={`panel-shell__bar ${settingsOpen ? "is-settings-open" : ""}`}
    >
      <div className="panel-shell__bar-main panel-shell__bar-main--two-sector">
        <div className="panel-shell__sector panel-shell__sector--core">
          <div className="panel-shell__actions panel-shell__actions--core">
            {coreButtonDefs.map((item) =>
              renderToolbarButton(item, {
                disabled: settingsOpen || (item.id === "picker" && isPickerDisabled),
              })
            )}
          </div>
        </div>
        <div className="panel-shell__sector panel-shell__sector--utility-settings">
          <div className="panel-shell__meta-controls">
            <button
              className={`panel-shell__action panel-shell__action--settings ${settingsOpen ? "panel-shell__action--active" : ""}`}
              type="button"
              aria-label="Toggle settings"
              data-tooltip="Settings"
              aria-expanded={settingsOpen}
              onClick={toggleSettings}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19.14 12.94a7.38 7.38 0 0 0 .05-.94 7.38 7.38 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.65l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.14 7.14 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.43h-3.84a.5.5 0 0 0-.5.43l-.36 2.54c-.57.23-1.11.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.83a.5.5 0 0 0 .12.65l2.03 1.58c-.03.31-.05.63-.05.94s.02.63.05.94L2.82 14.52a.5.5 0 0 0-.12.65l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.04.71 1.63.94l.36 2.54a.5.5 0 0 0 .5.43h3.84a.5.5 0 0 0 .5-.43l.36-2.54c.57-.23 1.11-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.65l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
              </svg>
            </button>
          </div>
          <span className="panel-shell__meta-divider" />
          <div className="panel-shell__utility-controls">
            <div className="panel-shell__utility-overflow is-visible">
              <button
                className={`panel-shell__action panel-shell__action--overflow ${utilityMenuOpen ? "panel-shell__action--active" : ""}`}
                type="button"
                aria-label="Open utility menu"
                aria-expanded={utilityMenuOpen}
                data-tooltip="Utilities"
                disabled={settingsOpen}
                onClick={() => setUtilityMenuOpen((prev) => !prev)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
                </svg>
              </button>
              {utilityMenuOpen && (
                <div className="panel-shell__utility-menu" role="menu" aria-label="Utility actions">
                  <div className="panel-shell__utility-menu-list">
                    {utilityButtonDefs.map((item) =>
                      renderToolbarButton(item, { inUtilityMenu: true, disabled: settingsOpen })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div
        className={`panel-shell__settings ${settingsOpen ? "is-open" : ""}`}
        aria-hidden={!settingsOpen}
      >
        <div className="panel-shell__settings-grid panel-shell__settings-grid--two-column">
          <div className="panel-shell__settings-block is-core">
            <div className="panel-shell__settings-title">Core</div>
            <div className="panel-shell__setting-row">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Auto Pause On Picker</div>
                <div className="panel-shell__setting-description">피커 진입 시 자동 정지</div>
              </div>
              <button
                type="button"
                className={`panel-shell__switch ${uiSettings?.pickerAutoPause ? "is-on" : ""}`}
                aria-label="Auto Pause On Picker"
                aria-pressed={uiSettings?.pickerAutoPause}
                onClick={() => onToggleSetting?.("pickerAutoPause")}
              >
                <span className="panel-shell__switch-thumb" />
              </button>
            </div>
            <div className="panel-shell__setting-row">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Keep Picker Active</div>
                <div className="panel-shell__setting-description">선택 후 피커 유지</div>
              </div>
              <button
                type="button"
                className={`panel-shell__switch ${uiSettings?.keepPickerActiveAfterSelect ? "is-on" : ""}`}
                aria-label="Keep picker active"
                aria-pressed={uiSettings?.keepPickerActiveAfterSelect}
                onClick={() => onToggleSetting?.("keepPickerActiveAfterSelect")}
              >
                <span className="panel-shell__switch-thumb" />
              </button>
            </div>
            <div className="panel-shell__setting-row is-stacked">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Export Detail</div>
                <div className="panel-shell__setting-description">라인/스니펫/전체 코드 범위</div>
              </div>
              <div className="panel-shell__segmented">
                {[1, 2, 3].map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`panel-shell__segment ${Number(uiSettings?.exportPromptLevel) === level ? "is-active" : ""}`}
                    onClick={() => onUpdateSetting?.("exportPromptLevel", level)}
                  >
                    {level === 1 ? "Lines" : level === 2 ? "Snippets" : "Full"}
                  </button>
                ))}
              </div>
            </div>
            <div className="panel-shell__setting-row is-stacked panel-shell__setting-row--picker">
              <div className="panel-shell__picker-heading">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Picker Highlight</div>
                  <div className="panel-shell__setting-description">강도/색상 통합 설정</div>
                </div>
                <input
                  className="panel-shell__color-input"
                  type="color"
                  value={pickerHighlight?.color || "#14b8a6"}
                  onChange={(event) => onUpdateSetting?.("pickerHighlightColor", event.target.value)}
                  aria-label="Picker highlight color"
                />
              </div>
              <div className="panel-shell__segmented">
                {["subtle", "medium", "strong"].map((strength) => (
                  <button
                    key={strength}
                    type="button"
                    className={`panel-shell__segment ${pickerHighlight?.strength === strength ? "is-active" : ""}`}
                    onClick={() => onUpdateSetting?.("pickerHighlightStrength", strength)}
                  >
                    {strength}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="panel-shell__settings-block is-global">
            <div className="panel-shell__settings-title">Global</div>
            <div className="panel-shell__setting-row">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Lock On Pause</div>
                <div className="panel-shell__setting-description">일시정지 시 상호작용 차단</div>
              </div>
              <button
                type="button"
                className={`panel-shell__switch ${uiSettings?.lockInteractionsWhenPaused ? "is-on" : ""}`}
                aria-label="Lock interactions on pause"
                aria-pressed={uiSettings?.lockInteractionsWhenPaused}
                onClick={() => onToggleSetting?.("lockInteractionsWhenPaused")}
              >
                <span className="panel-shell__switch-thumb" />
              </button>
            </div>
            <div className="panel-shell__setting-row">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Dim Markers In Play</div>
                <div className="panel-shell__setting-description">재생 중 메모 하이라이트 약화</div>
              </div>
              <button
                type="button"
                className={`panel-shell__switch ${uiSettings?.dimMarkersWhilePlaying ? "is-on" : ""}`}
                aria-label="Dim markers in play mode"
                aria-pressed={uiSettings?.dimMarkersWhilePlaying}
                onClick={() => onToggleSetting?.("dimMarkersWhilePlaying")}
              >
                <span className="panel-shell__switch-thumb" />
              </button>
            </div>
            <div className="panel-shell__setting-row is-stacked">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Feedback Intensity</div>
                <div className="panel-shell__setting-description">토스트/글로우 시각 강도</div>
              </div>
              <div className="panel-shell__segmented">
                {["low", "medium", "high"].map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`panel-shell__segment ${uiSettings?.feedbackIntensity === level ? "is-active" : ""}`}
                    onClick={() => onUpdateSetting?.("feedbackIntensity", level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div className="panel-shell__setting-row is-stacked">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Theme</div>
                <div className="panel-shell__setting-description">패널 테마</div>
              </div>
              <div className="panel-shell__segmented">
                {["light", "dark"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`panel-shell__segment ${theme === mode ? "is-active" : ""}`}
                    onClick={() => onThemeChange?.(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
