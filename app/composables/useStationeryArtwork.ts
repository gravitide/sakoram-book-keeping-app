// The open business's Stationery artwork as something an <img> can show,
// shared by the Stationery thumbnail, the artwork cards' upload tiles and the
// Stationery editor — so the bytes (and, for a PDF, a Typst render) are
// fetched once per artwork, not once per surface. One artwork per kind: the
// Full-page background, and the Header & footer images' header and footer.
//
//   SVG / PNG / JPEG — the file itself, read through Rust (a business folder
//                      can live on any drive; asset:// URLs can't reach it).
//   PDF              — its first page rendered to PNG by the bundled Typst
//                      (`render_stationery_artwork_png`): the webview can't
//                      draw a PDF in an <img>. If that fails the URL stays
//                      null and callers show a placeholder.
//
// Module-level state per kind, reference-counted: the blob URL is revoked when
// the last user of that kind unmounts. Reloads when the stored artwork changes,
// and on `reload()` — an upload that replaces the file with the same format
// leaves the stored JSON identical, so the uploader must call it.

import type { Ref } from "vue";
import type { BusinessAssetKind } from "~/lib/business-assets";
import type { ArtworkExt } from "~/lib/stationery";
import { invoke } from "@tauri-apps/api/core";
import { readBusinessAsset } from "~/lib/business-assets";
import { parseStationery } from "~/lib/stationery";
import { artworkMimeOf } from "~/lib/stationery-artwork";
import { useSettingsStore } from "~/stores/settings";
import { useTenantsStore } from "~/stores/tenants";

export type StationeryArtworkKind = "background" | "header" | "footer";

const ASSET_KIND: Record<StationeryArtworkKind, BusinessAssetKind> = {
	background: "stationery-background",
	header: "stationery-header",
	footer: "stationery-footer"
};

interface ArtworkState {
	url: Ref<string | null>
	loading: Ref<boolean>
	users: number
	generation: number
	scope: ReturnType<typeof effectScope> | null
}

const states = new Map<StationeryArtworkKind, ArtworkState>();
const stateFor = (kind: StationeryArtworkKind): ArtworkState => {
	let s = states.get(kind);
	if (!s) {
		s = { url: ref(null), loading: ref(false), users: 0, generation: 0, scope: null };
		states.set(kind, s);
	}
	return s;
};

// Enough for the editor at a generous zoom; the thumbnail downsamples it.
const PDF_PREVIEW_PPI = 110;

/**
 * What identifies the stored artwork of `kind` — its format plus whatever
 * changes the file (a crop, the sheet it was made for). Positions and margins
 * are left out, so moving an image doesn't re-read (or re-render) it.
 */
const artworkKey = (stored: string | null | undefined, kind: StationeryArtworkKind) => {
	const s = parseStationery(stored);
	if (kind === "background") return { ext: s.background.ext, extra: [s.background.paper, s.background.crop] };
	const image = s.header_footer[kind];
	return { ext: image?.ext ?? null, extra: [image?.crop ?? null, image?.aspect ?? null] };
};

export function useStationeryArtwork(kind: StationeryArtworkKind = "background") {
	const store = useSettingsStore();
	const tenants = useTenantsStore();
	const state = stateFor(kind);
	const ext = computed<ArtworkExt | null>(() => artworkKey(store.settings?.pdf_stationery, kind).ext);

	const setUrl = (next: string | null) => {
		if (state.url.value) URL.revokeObjectURL(state.url.value);
		state.url.value = next;
	};

	const reload = async () => {
		const mine = ++state.generation;
		const tenantId = tenants.activeTenantId;
		const format = artworkKey(store.settings?.pdf_stationery, kind).ext;
		if (!tenantId || !format) {
			setUrl(null);
			return;
		}
		state.loading.value = true;
		try {
			let blob: Blob;
			if (format === "pdf") {
				const png = await invoke<number[]>("render_stationery_artwork_png", { ppi: PDF_PREVIEW_PPI, artwork: kind });
				blob = new Blob([new Uint8Array(png)], { type: "image/png" });
			} else {
				const [readExt, bytes] = await readBusinessAsset(tenantId, ASSET_KIND[kind]);
				blob = new Blob([new Uint8Array(bytes)], { type: artworkMimeOf(readExt) });
			}
			// A newer reload started while this one was reading: let it win.
			if (mine === state.generation) setUrl(URL.createObjectURL(blob));
		} catch (err) {
			// Callers fall back to a placeholder; say why in the console.
			console.warn(`[stationery] couldn't load the ${kind} preview:`, err);
			if (mine === state.generation) setUrl(null);
		} finally {
			if (mine === state.generation) state.loading.value = false;
		}
	};

	state.users++;
	if (state.users === 1) {
		// Detached: the first user's own scope would stop this watcher when it
		// unmounts, even though others still use the artwork.
		state.scope = effectScope(true);
		state.scope.run(() => watch(
			() => JSON.stringify([tenants.activeTenantId, artworkKey(store.settings?.pdf_stationery, kind)]),
			reload,
			{ immediate: true }
		));
	}
	onBeforeUnmount(() => {
		state.users--;
		if (state.users === 0) {
			state.scope?.stop();
			state.scope = null;
			state.generation++;
			setUrl(null);
		}
	});

	return { url: readonly(state.url), loading: readonly(state.loading), ext, reload };
}
