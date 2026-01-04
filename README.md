# Prism

Prism is a Chrome Extension (Manifest V3) that renders copied AI-generated HTML code in a Side Panel for quick preview.

## Features

- Clipboard-driven workflow (no auto-scanning): copy code → Prism reacts
- Side Panel preview with a sandboxed renderer (MV3/CSP-friendly)
- Snapshot tools: export HTML, save PNG, copy PNG to clipboard
- “Open in window” for a full-page preview (Alt + Left to go back)

## How It Works

- **Content script (MAIN world)** hooks clipboard writes when a user clicks a site’s “Copy” button.
- The **Prism Orb** appears when renderable code is copied (and the panel is closed).
- The **Side Panel** hosts a sandboxed iframe that renders the code safely.

## Install (Developer Mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project folder (`Prism/`)

## Usage

1. Copy an HTML snippet from an AI chat
2. Click the Prism Orb to open the Side Panel and render
3. Use the top-right actions:
   - **HTML**: save the last rendered HTML
   - **Camera**: save a PNG snapshot
   - **Copy**: copy the PNG snapshot to clipboard

## Permissions

- `sidePanel`: open and update the Side Panel
- `storage`: small UI/state preferences
- `activeTab`: communicate with the active tab
- `downloads`: save exported HTML/PNG
- `host_permissions: <all_urls>`: needed to run on AI sites and capture resources referenced by rendered HTML

## Project Structure

```
Prism/
  manifest.json
  background.js
  content/
    spy.js
    prism-orb.js
    prism-orb.css
  sidepanel/
    index.html
    renderer.js
    theme.css
    sandbox.html
    window.html
    window.css
    vendor/
  icons/
```

## Notes

- The renderer runs inside a sandbox page to comply with MV3 CSP restrictions.
- “Advanced mode” and “Pick” tools are currently disabled for the initial release.

## Contributing

This is a personal practice project and is not accepting contributions, issues, or pull requests at this time.
