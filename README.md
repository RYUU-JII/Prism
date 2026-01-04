# Prism

**Copy. Prism. Render.**

Prism is a Chrome Extension (Manifest V3) that instantly renders copied AI-generated code in your Side Panel for a seamless preview experience.

## Features

- Clipboard-driven workflow (no auto-scanning): copy code → Prism reacts
- Side Panel preview with a sandboxed renderer (MV3/CSP-friendly)
- Snapshot tools: export HTML, save PNG, copy PNG to clipboard
- “Open in window” for a full-page preview (Alt + Left to go back)

## Supported AI Platforms

Prism is designed to be compatible with a wide range of AI platforms. Please note that while we strive for universal support, it may not function perfectly in all environments or on every website due to varying security policies or code structures.

## Installation

### For Users (Quick Install)
1. Go to the Releases page.
2. Download the latest `Prism-x.x.x.zip` file.
3. Unzip the file to a permanent folder.
4. Open Chrome and go to `chrome://extensions`.
5. Enable **Developer mode** (top right).
6. Click **Load unpacked** and select the unzipped folder.

### For Developers (Local Testing & Learning)
1. Clone this repository for personal experimentation: `git clone https://github.com/RYUU-JII/Prism.git`
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `Prism` folder.

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

We are currently preparing for the **v0.2.0 update** and would love to hear your feedback! 

While we are not accepting Pull Requests at this time to maintain a consistent architectural vision, we highly encourage you to report bugs or suggest features via **Issues**. Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for more details on how to get involved.
