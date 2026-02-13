import React, { useEffect, useRef, useState } from 'react';

const SETTINGS_TABS = [
  { id: "core", label: "Core" },
  { id: "picker", label: "Picker" },
  { id: "global", label: "Global" },
];

const Header = ({
  onSaveHtml,
  onSnapshot,
  onCopy,
  onOpenWindow,
  isSnapshotDisabled,
  isFreezeDisabled,
  canvasFrozen,
  onFreezeToggle,
  uiSettings,
  onToggleSetting,
  onUpdateSetting,
  themeMode,
  onThemeModeChange,
  isViewMode,
  onToggleViewMode,
  feedbackMessage,
  feedbackActive,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [utilityMenuOpen, setUtilityMenuOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("core");
  const shellRef = useRef(null);
  const settingsToggleRef = useRef(null);
  const pickerHighlight = uiSettings?.pickerHighlight || {};
  const memoResetPolicy = uiSettings?.memoResetPolicy || "on_code_change";
  const patchFullSyncEvery = Number(uiSettings?.patchFullSyncEvery) || 0;
  const retryFullSyncOnReject = uiSettings?.retryFullSyncOnReject === true;
  const adaptiveResponseRouting = uiSettings?.adaptiveResponseRouting !== false;
  const showTooltips = uiSettings?.showTooltips !== false;
  const debugPickerOverlay = uiSettings?.debugPickerOverlay === true;
  const activeThemeMode =
    themeMode === "light" || themeMode === "dark" ? themeMode : "detect";
  const indicatorMessage =
    typeof feedbackMessage === "string" && feedbackMessage.trim()
      ? feedbackMessage.trim()
      : "대기중";

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
    if (!settingsOpen) {
      setUtilityMenuOpen(false);
      // Restore focus to toggle button when closing
      if (settingsToggleRef.current) {
        settingsToggleRef.current.focus();
      }
    }
  }, [settingsOpen]);

  const coreButtonDefs = [
    {
      id: "pickerDebugOverlay",
      title: debugPickerOverlay ? "Disable Picker Debug" : "Enable Picker Debug",
      tooltip: debugPickerOverlay ? "Picker Debug: On" : "Picker Debug: Off",
      action: () => onToggleSetting?.("debugPickerOverlay"),
      extraClass: `panel-shell__action--debug ${debugPickerOverlay ? "panel-shell__action--active" : ""}`,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 8h-2.81a5 5 0 0 0-9.38 0H5a2 2 0 0 0-2 2v2h2v3a4 4 0 0 0 4 4h1v2h4v-2h1a4 4 0 0 0 4-4v-3h2v-2a2 2 0 0 0-2-2Zm-7-3a3 3 0 0 1 2.82 2h-5.64A3 3 0 0 1 13 5Zm4 10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-3h10v3Zm-6-1h4v2h-4v-2Z" />
        </svg>
      ),
    },
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
      id: "viewMode",
      title: isViewMode ? "Edit Mode" : "View Mode",
      tooltip: isViewMode ? "Switch to Edit Mode" : "Switch to View Mode",
      action: onToggleViewMode,
      icon: isViewMode ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5ZM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5Zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3Z" />
        </svg>
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
      label: "HTML",
      icon: <span>HTML</span>,
    },
    {
      id: "snapshot",
      title: "Save Screenshot",
      tooltip: "Save screenshot",
      action: onSnapshot,
      disabled: Boolean(isSnapshotDisabled),
      label: "Screenshot",
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
      label: "Copy Img",
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
        {inUtilityMenu && <span className="panel-shell__utility-label">{def.label}</span>}
      </button>
    );
  };

  return (
    <header
      ref={shellRef}
      className={`panel-shell__bar ${settingsOpen ? "is-settings-open" : ""}`}
    >
      <div className="panel-shell__bar-center">
        <div
          className={`panel-shell__feedback-indicator ${feedbackActive ? "is-active" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="panel-shell__feedback-dot" aria-hidden="true" />
          <span className="panel-shell__feedback-text">{indicatorMessage}</span>
        </div>
      </div>
      <div className="panel-shell__bar-main panel-shell__bar-main--two-sector">
        <div className="panel-shell__sector panel-shell__sector--core">
          <div className="panel-shell__actions panel-shell__actions--core">
            {coreButtonDefs.map((item) =>
              renderToolbarButton(item, {
                disabled: settingsOpen,
              })
            )}
          </div>
        </div>
        <div className="panel-shell__sector panel-shell__sector--utility-settings">
          <div className="panel-shell__meta-controls">
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

            <button
              ref={settingsToggleRef}
              className={`panel-shell__action panel-shell__action--settings ${settingsOpen ? "panel-shell__action--active" : ""}`}
              type="button"
              id="prism-settings-toggle"
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
        </div>
      </div>
      <div
        className={`panel-shell__settings ${settingsOpen ? "is-open" : ""}`}
        data-active-tab={settingsTab}
        aria-hidden={settingsOpen ? undefined : "true"}
      >
        <div className="panel-shell__settings-overlay-header">
          <div className="panel-shell__settings-tabs">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`panel-shell__settings-tab-btn ${settingsTab === tab.id ? "is-active" : ""}`}
                onClick={() => setSettingsTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="panel-shell__settings-close"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close settings"
          >
            <svg viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          </button>
        </div>

        <div className="panel-shell__settings-content">
          {settingsTab === "core" && (
            <div className="panel-shell__settings-section">
              <div className="panel-shell__setting-row is-stacked">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Export Action</div>
                  <div className="panel-shell__setting-description">프롬프트 내보내기 시 후속 동작</div>
                </div>
                <div className="panel-shell__segmented">
                  {[
                    { id: "copy", label: "Copy Only" },
                    { id: "inject", label: "Inject" },
                    { id: "send", label: "Auto-send" },
                  ].map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className={`panel-shell__segment ${uiSettings?.exportAction === action.id ? "is-active" : ""}`}
                      onClick={() => onUpdateSetting?.("exportAction", action.id)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel-shell__setting-row is-stacked">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Policy</div>
                  <div className="panel-shell__setting-description">메모 초기화 정책</div>
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
              <div className="panel-shell__setting-row is-stacked">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">AI Response Mode</div>
                  <div className="panel-shell__setting-description">AI 답변 수신 방식 선택</div>
                </div>
                <div className="panel-shell__segmented">
                  {[
                    { id: "full", label: "Full Code" },
                    { id: "patch", label: "Smart Patch" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={`panel-shell__segment ${uiSettings?.aiResponseMode === mode.id ? "is-active" : ""}`}
                      onClick={() => onUpdateSetting?.("aiResponseMode", mode.id)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel-shell__setting-row">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Adaptive Routing</div>
                  <div className="panel-shell__setting-description">복합 수정 감지 시 Full Code로 자동 전환</div>
                </div>
                <button
                  type="button"
                  className={`panel-shell__switch ${adaptiveResponseRouting ? "is-on" : ""}`}
                  onClick={() => onToggleSetting?.("adaptiveResponseRouting")}
                >
                  <span className="panel-shell__switch-thumb" />
                </button>
              </div>
              <div className="panel-shell__setting-row">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Auto-import AI Response</div>
                  <div className="panel-shell__setting-description">AI 답변 완료 시 코드를 자동으로 가져오기</div>
                </div>
                <button
                  type="button"
                  className={`panel-shell__switch ${uiSettings?.autoImportResponse ? "is-on" : ""}`}
                  onClick={() => onToggleSetting?.("autoImportResponse")}
                >
                  <span className="panel-shell__switch-thumb" />
                </button>
              </div>
              <div className="panel-shell__setting-row is-stacked">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Patch Full Sync Cadence</div>
                  <div className="panel-shell__setting-description">N턴마다 full 컨텍스트 강제 동기화</div>
                </div>
                <div className="panel-shell__segmented">
                  {[
                    { value: 0, label: "Off" },
                    { value: 2, label: "2T" },
                    { value: 3, label: "3T" },
                    { value: 5, label: "5T" },
                    { value: 8, label: "8T" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`panel-shell__segment ${patchFullSyncEvery === option.value ? "is-active" : ""}`}
                      onClick={() => onUpdateSetting?.("patchFullSyncEvery", option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel-shell__setting-row">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Retry Full Sync on Reject</div>
                  <div className="panel-shell__setting-description">Smart Patch 거부 시 full sync 자동 재시도</div>
                </div>
                <button
                  type="button"
                  className={`panel-shell__switch ${retryFullSyncOnReject ? "is-on" : ""}`}
                  onClick={() => onToggleSetting?.("retryFullSyncOnReject")}
                >
                  <span className="panel-shell__switch-thumb" />
                </button>
              </div>
            </div>
          )}

          {settingsTab === "picker" && (
            <div className="panel-shell__settings-section">
              <div className="panel-shell__setting-row">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Auto Pause on Picker</div>
                  <div className="panel-shell__setting-description">피커 시작 시 자동으로 일시정지</div>
                </div>
                <button
                  type="button"
                  className={`panel-shell__switch ${uiSettings?.pickerAutoPause ? "is-on" : ""}`}
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
                  onClick={() => onToggleSetting?.("keepPickerActiveAfterSelect")}
                >
                  <span className="panel-shell__switch-thumb" />
                </button>
              </div>
              <div className="panel-shell__setting-row is-stacked">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Picker Highlight</div>
                  <div className="panel-shell__setting-description">피커 강조 색상 및 강도</div>
                </div>
                <div className="panel-shell__picker-config">
                  <input
                    className="panel-shell__color-input"
                    type="color"
                    value={pickerHighlight?.color || "#14b8a6"}
                    onChange={(event) => onUpdateSetting?.("pickerHighlightColor", event.target.value)}
                  />
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
            </div>
          )}

          {settingsTab === "global" && (
            <div className="panel-shell__settings-section">
              <div className="panel-shell__setting-row">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Interaction Lock on Pause</div>
                  <div className="panel-shell__setting-description">일시정지 상태에서 상호작용 잠금</div>
                </div>
                <button
                  type="button"
                  className={`panel-shell__switch ${uiSettings?.lockInteractionsWhenPaused ? "is-on" : ""}`}
                  onClick={() => onToggleSetting?.("lockInteractionsWhenPaused")}
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
              <div className="panel-shell__setting-row">
                <div className="panel-shell__setting-copy">
                  <div className="panel-shell__setting-title">Tooltips</div>
                  <div className="panel-shell__setting-description">버튼 호버 시 도움말 표시</div>
                </div>
                <button
                  type="button"
                  className={`panel-shell__switch ${showTooltips ? "is-on" : ""}`}
                  onClick={() => onToggleSetting?.("showTooltips")}
                >
                  <span className="panel-shell__switch-thumb" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
