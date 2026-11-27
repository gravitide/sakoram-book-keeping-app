// The files a business folder holds at fixed names, read and written through
// the Rust `save_business_asset` / `read_business_asset` /
// `remove_business_asset` commands (never the fs plugin: a business folder can
// live on any drive). The kinds mirror `asset_slot` in src-tauri/src/tenants.rs
// — add a kind there and here together.
import { invoke } from "@tauri-apps/api/core";

// Where each kind lives in the business folder:
//   logo                            logos/logo.<ext> — the cropped square identity logo
//   logo-original                   logos/logo-original.<ext> — its untouched upload, for Re-crop
//   stationery-item-<id>            stationery/item-<id>.<ext> — a page-design image (app/lib/page-design.ts)
export type BusinessAssetKind = "logo" | "logo-original" | `stationery-item-${string}`;

/** The asset kind of a page-design image item. */
export function itemAssetKind(itemId: string): BusinessAssetKind {
	return `stationery-item-${itemId}`;
}

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
