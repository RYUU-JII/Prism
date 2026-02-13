import { SNAPSHOT_BRIDGE_RUNTIME_SOURCE } from "./bridge/snapshotBridgeRuntimeSource.js";
import { VIEWPORT_POLICY_STYLE_SOURCE } from "./bridge/viewportPolicyStyleSource.js";

function wrapScriptSource(source) {
  return `<script>\n${source}\n    </` + "script>";
}

function wrapStyleSource(id, source) {
  return `<style id="${id}">\n${source}\n    </` + "style>";
}

export function buildHtmlBridgeAssets() {
  return {
    snapshotBridge: wrapScriptSource(SNAPSHOT_BRIDGE_RUNTIME_SOURCE),
    viewportPolicyStyle: wrapStyleSource("prism-viewport-policy", VIEWPORT_POLICY_STYLE_SOURCE),
  };
}
