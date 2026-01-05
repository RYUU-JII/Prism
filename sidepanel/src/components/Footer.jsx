import React from 'react';

const Footer = ({
  expertMode,
  onExpertModeToggle,
  expertTheme,
  onExpertThemeToggle,
  pickerActive,
  onPickerToggle,
  isPickerDisabled,
}) => {
  return (
    <footer className="panel-shell__footer">
      <button
        className={`panel-shell__action ${expertMode ? 'active' : ''}`}
        type="button"
        aria-label="Expert mode"
        data-tooltip="Expert mode"
        onClick={onExpertModeToggle}
      >
        <span>Expert</span>
      </button>
      <button
        className="panel-shell__action"
        type="button"
        aria-label="Toggle editor theme"
        data-tooltip="Toggle editor theme"
        onClick={onExpertThemeToggle}
      >
        <span>{expertTheme === 'dark' ? 'Dark' : 'Light'}</span>
      </button>
      <button
        className={`panel-shell__action ${pickerActive ? 'active' : ''}`}
        type="button"
        aria-label="Pick element"
        data-tooltip={isPickerDisabled ? "Element picker: HTML only" : "Pick element"}
        onClick={onPickerToggle}
        disabled={isPickerDisabled}
      >
        <span>Pick</span>
      </button>
    </footer>
  );
};

export default Footer;
