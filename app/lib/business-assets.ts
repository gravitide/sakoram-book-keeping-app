// The files a business folder holds at fixed names, read and written through
// the Rust `save_business_asset` / `read_business_asset` /
// `remove_business_asset` commands (never the fs plugin: a business folder can
// live on any drive). The kinds mirror `asset_slot` in src-tauri/src/tenants.rs
// — add a kind there and here together.
import { invoke } from "@tauri-apps/api/core";

// Where each kind lives in the business folder:
//   logo                            logos/logo.<ext> — the cropped square identity logo
//   logo-original                   logos/logo-original.<ext> — its untouched upload, for Re-crop
//   pdf-header                      pdf-header.<ext> — the wide Built-in header logo
//   pdf-header-original             pdf-header-original.<ext> — its untouched upload
//   stationery-background           stationery/background.<ext> — the Full-page background PDFs render
//   stationery-background-original  stationery/background-original.<ext> — its untouched raster upload
export type BusinessAssetKind = "logo" | "logo-original" | "pdf-header" | "pdf-header-original" | "stationery-background" | "stationery-background-original";

/** Write an asset (replacing any copy in another format); resolves to the absolute path written. */
export function saveBusinessAsset(id: string, kind: BusinessAssetKind, ext: string, bytes: Uint8Array | number[]): Promise<string> {
	return invoke<string>("save_business_asset", { id, kind, ext, bytes: Array.from(bytes) });
}

/** Read an asset as [extension, bytes]; rejects when there is none. */
export function readBusinessAsset(id: string, kind: BusinessAssetKind): Promise<[string, number[]]> {
	return invoke<[string, number[]]>("read_business_asset", { id, kind });
}

/** Delete every format of an asset; nothing to delete is not an error. */
export function removeBusinessAsset(id: string, kind: BusinessAssetKind): Promise<void> {
	return invoke<void>("remove_business_asset", { id, kind });
}
