import React, { useEffect, useRef, useState } from 'react';

const SETTINGS_TABS = [
  { id: "core", label: "Core" },
  { id: "global", label: "Global" },
];

const Header = ({
  onSaveHtml,
  onSnapshot,
  onCopy,
  onOpenWindow,
  onExportPrompt,
  pickerActive,
  onPickerToggle,
  isPickerDisabled,
  isSnapshotDisabled,
  isFreezeDisabled,
  isExportPromptDisabled,
  instructionCount,
  canvasFrozen,
  onFreezeToggle,
  uiSettings,
  onToggleSetting,
  onUpdateSetting,
  themeMode,
  onThemeModeChange,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [utilityMenuOpen, setUtilityMenuOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("core");
  const shellRef = useRef(null);
  const pickerHighlight = uiSettings?.pickerHighlight || {};
  const memoResetPolicy = uiSettings?.memoResetPolicy || "on_code_change";
  const showTooltips = uiSettings?.showTooltips !== false;
  const activeThemeMode =
    themeMode === "light" || themeMode === "dark" ? themeMode : "detect";

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
    if (!settingsOpen) return;
    setUtilityMenuOpen(false);
  }, [settingsOpen]);

  const coreButtonDefs = [
    {
      id: "playPause",
      title: canvasFrozen ? "Resume Playback" : "Pause Playback",
      tooltip: canvasFrozen ? "Resume" : "Pause",
      action: onFreezeToggle,
      disabled: Boolean(isFreezeDisabled),
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
      title: "Element Picker",
      tooltip: "Picker",
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
      title: "Copy Prompt",
      tooltip: "Copy prompt",
      action: onExportPrompt,
      disabled: Boolean(isExportPromptDisabled),
      extraClass: "panel-shell__action--export",
      icon: (
        <>
          <svg
            className="panel-shell__export-stars"
            viewBox="0 0 24 24"
            aria-hidden="true"
            shapeRendering="geometricPrecision"
          >
            <path d="M8.2 2.6 10 7.2 14.6 9 10 10.8 8.2 15.4 6.4 10.8 1.8 9 6.4 7.2Z" />
            <path d="M17.2 2.7 18.2 5.3 20.8 6.3 18.2 7.3 17.2 9.9 16.2 7.3 13.6 6.3 16.2 5.3Z" />
            <path d="M17.8 12.9 18.6 15 20.7 15.8 18.6 16.6 17.8 18.7 17 16.6 14.9 15.8 17 15Z" />
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
      title: "Open in Window",
      tooltip: "Open in window",
      action: onOpenWindow,
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
      title: "Save Screenshot",
      tooltip: "Save screenshot",
      action: onSnapshot,
      disabled: Boolean(isSnapshotDisabled),
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.5 7.5h7l1.2 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.3l1.2-2Zm3.5 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
        </svg>
      ),
    },
    {
      id: "copyImage",
      title: "Copy Screenshot",
      tooltip: "Copy screenshot",
      action: onCopy,
      disabled: Boolean(isSnapshotDisabled),
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

  const resolveTooltip = (tooltip) => (showTooltips ? tooltip : undefined);

  const renderSettingsTabs = () => (
    <div
      className="panel-shell__settings-inline-tabs"
      role="tablist"
      aria-label="Settings section"
    >
      {SETTINGS_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={settingsTab === tab.id}
          className={`panel-shell__settings-title-tab ${settingsTab === tab.id ? "is-active" : ""}`}
          onClick={() => setSettingsTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const renderSettingsBlockTitle = (label) => (
    <div className="panel-shell__settings-title panel-shell__settings-title--label">
      <span className="panel-shell__settings-title-name">{label}</span>
      {renderSettingsTabs()}
    </div>
  );

  const renderToolbarButton = (def, options = {}) => {
    const { disabled = false, inUtilityMenu = false } = options;
    const buttonDisabled = Boolean(disabled || def.disabled);
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
        data-tooltip={resolveTooltip(def.tooltip)}
        role={inUtilityMenu ? "menuitem" : undefined}
        disabled={buttonDisabled}
        onClick={() => {
          if (buttonDisabled) return;
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
              data-tooltip={resolveTooltip("Settings")}
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
                data-tooltip={utilityMenuOpen ? undefined : resolveTooltip("Utilities")}
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
        data-active-tab={settingsTab}
        aria-hidden={!settingsOpen}
      >
        <div className="panel-shell__settings-grid panel-shell__settings-grid--two-column">
          <div className="panel-shell__settings-block is-core">
            {renderSettingsBlockTitle("Core")}
            <div className="panel-shell__setting-row">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Auto Pause on Picker</div>
                <div className="panel-shell__setting-description">피커 시작 시 자동으로 일시정지</div>
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
                <div className="panel-shell__setting-description">요소 선택 후 피커 모드 유지</div>
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
                <div className="panel-shell__setting-title">Prompt Detail Level</div>
                <div className="panel-shell__setting-description">프롬프트에 포함할 코드 범위</div>
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
            <div className="panel-shell__setting-row is-stacked">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Memo Reset Policy</div>
                <div className="panel-shell__setting-description">메모 자동 초기화 기준</div>
              </div>
              <div className="panel-shell__segmented">
                {[
                  { id: "on_code_change", label: "On change" },
                  { id: "on_copy", label: "On copy" },
                  { id: "manual", label: "Manual" },
                ].map((policy) => (
                  <button
                    key={policy.id}
                    type="button"
                    className={`panel-shell__segment ${memoResetPolicy === policy.id ? "is-active" : ""}`}
                    onClick={() => onUpdateSetting?.("memoResetPolicy", policy.id)}
                  >
                    {policy.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="panel-shell__setting-row is-stacked panel-shell__setting-row--picker">
              <div className="panel-shell__picker-heading">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Picker Highlight</div>
                  <div className="panel-shell__setting-description">피커 강조 색상 및 강도</div>
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
            {renderSettingsBlockTitle("Global")}
            <div className="panel-shell__setting-row">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Interaction Lock on Pause</div>
                <div className="panel-shell__setting-description">일시정지 상태에서 상호작용 잠금</div>
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
                <div className="panel-shell__setting-title">Tooltips</div>
                <div className="panel-shell__setting-description">버튼 호버 시 도움말 표시</div>
              </div>
              <button
                type="button"
                className={`panel-shell__switch ${showTooltips ? "is-on" : ""}`}
                aria-label="Toggle tooltips"
                aria-pressed={showTooltips}
                onClick={() => onToggleSetting?.("showTooltips")}
              >
                <span className="panel-shell__switch-thumb" />
              </button>
            </div>
            <div className="panel-shell__setting-row is-stacked">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Capture Range</div>
                <div className="panel-shell__setting-description">보이는 영역 또는 전체 콘텐츠</div>
              </div>
              <div className="panel-shell__segmented">
                {[
                  { id: "visible", label: "Visible" },
                  { id: "full", label: "Full" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`panel-shell__segment ${uiSettings?.captureRange === option.id ? "is-active" : ""}`}
                    onClick={() => onUpdateSetting?.("captureRange", option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="panel-shell__setting-row is-stacked">
              <div className="panel-shell__setting-copy">
                <div className="panel-shell__setting-title">Theme Mode</div>
                <div className="panel-shell__setting-description">페이지 감지 또는 고정 모드</div>
              </div>
              <div className="panel-shell__segmented">
                {[
                  { id: "detect", label: "Detect" },
                  { id: "light", label: "Light" },
                  { id: "dark", label: "Dark" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`panel-shell__segment ${activeThemeMode === mode.id ? "is-active" : ""}`}
                    onClick={() => onThemeModeChange?.(mode.id)}
                  >
                    {mode.label}
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
