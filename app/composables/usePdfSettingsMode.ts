// The Stationery mode picked on /settings/pdf right now (maybe unsaved), for
// the sidebar: its middle in-page anchor is named after the mode's options
// ("Built-in options", …). Written by the page; null until it first mounts,
// when the sidebar falls back to the saved mode.
import type { StationeryMode } from "~/lib/stationery";

export const usePdfSettingsMode = () => useState<StationeryMode | null>("pdf-settings-mode", () => null);
