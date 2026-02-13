import { SNAPSHOT_RUNTIME_PRELUDE_SOURCE } from "./runtimeSections/runtimePreludeSource.js";
import { SNAPSHOT_RUNTIME_CAPABILITIES_SOURCE } from "./runtimeSections/runtimeCapabilitiesSource.js";
import { SNAPSHOT_RUNTIME_MARKERS_SOURCE } from "./runtimeSections/runtimeMarkersSource.js";
import { SNAPSHOT_RUNTIME_PICKER_CORE_SOURCE } from "./runtimeSections/runtimePickerCoreSource.js";
import { SNAPSHOT_RUNTIME_EVENT_BINDINGS_SOURCE } from "./runtimeSections/runtimeEventBindingsSource.js";

const SNAPSHOT_BRIDGE_RUNTIME_SECTIONS = [
  SNAPSHOT_RUNTIME_PRELUDE_SOURCE,
  SNAPSHOT_RUNTIME_CAPABILITIES_SOURCE,
  SNAPSHOT_RUNTIME_MARKERS_SOURCE,
  SNAPSHOT_RUNTIME_PICKER_CORE_SOURCE,
  SNAPSHOT_RUNTIME_EVENT_BINDINGS_SOURCE,
];

export const SNAPSHOT_BRIDGE_RUNTIME_SOURCE = SNAPSHOT_BRIDGE_RUNTIME_SECTIONS.join("\n\n");
