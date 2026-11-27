// The open business's Full-page background as something an <img> can show,
// shared by the Stationery thumbnail, the background card's upload tile and
// the Stationery editor — so the bytes (and, for a PDF, a Typst render) are
// fetched once, not once per surface.
//
//   SVG / PNG / JPEG — the file itself, read through Rust (a business folder
//                      can live on any drive; asset:// URLs can't reach it).
//   PDF              — its first page rendered to PNG by the bundled Typst
//                      (`render_stationery_artwork_png`): the webview can't
//                      draw a PDF in an <img>. If that fails the URL stays
//                      null and callers show a "PDF background" placeholder.
//
// Module-level state, reference-counted: the blob URL is revoked when the
// last user unmounts. Reloads when the stored background changes, and on
// `reload()` — an upload that replaces the file with the same format and
// paper leaves the stored JSON identical, so the uploader must call it.
import { invoke } from "@tauri-apps/api/core";
import { readBusinessAsset } from "~/lib/business-assets";
import { parseStationery } from "~/lib/stationery";
import { backgroundMimeOf } from "~/lib/stationery-artwork";
import { useSettingsStore } from "~/stores/settings";
import { useTenantsStore } from "~/stores/tenants";

const url = ref<string | null>(null);
const loading = ref(false);
let users = 0;
let generation = 0;
let watchScope: ReturnType<typeof effectScope> | null = null;

// Enough for the editor at a generous zoom; the thumbnail downsamples it.
const PDF_PREVIEW_PPI = 110;

const setUrl = (next: string | null) => {
	if (url.value) URL.revokeObjectURL(url.value);
	url.value = next;
};

export function useStationeryArtwork() {
	const store = useSettingsStore();
	const tenants = useTenantsStore();
	const ext = computed(() => parseStationery(store.settings?.pdf_stationery).background.ext);

	const reload = async () => {
		const mine = ++generation;
		const tenantId = tenants.activeTenantId;
		const format = parseStationery(store.settings?.pdf_stationery).background.ext;
		if (!tenantId || !format) {
			setUrl(null);
			return;
		}
		loading.value = true;
		try {
			let blob: Blob;
			if (format === "pdf") {
				const png = await invoke<number[]>("render_stationery_artwork_png", { ppi: PDF_PREVIEW_PPI });
				blob = new Blob([new Uint8Array(png)], { type: "image/png" });
			} else {
				const [readExt, bytes] = await readBusinessAsset(tenantId, "stationery-background");
				blob = new Blob([new Uint8Array(bytes)], { type: backgroundMimeOf(readExt) });
			}
			// A newer reload started while this one was reading: let it win.
			if (mine === generation) setUrl(URL.createObjectURL(blob));
		} catch (err) {
			// Callers fall back to a placeholder; say why in the console.
			console.warn("[stationery] couldn't load the background preview:", err);
			if (mine === generation) setUrl(null);
		} finally {
			if (mine === generation) loading.value = false;
		}
	};

	users++;
	if (users === 1) {
		// Detached: the first user's own scope would stop this watcher when it
		// unmounts, even though others still use the artwork. Keyed on the
		// artwork alone, so saving margins doesn't re-read (or re-render) it.
		watchScope = effectScope(true);
		watchScope.run(() => watch(() => {
			const { ext, paper, crop } = parseStationery(store.settings?.pdf_stationery).background;
			return JSON.stringify([tenants.activeTenantId, ext, paper, crop]);
		}, reload, { immediate: true }));
	}
	onBeforeUnmount(() => {
		users--;
		if (users === 0) {
			watchScope?.stop();
			watchScope = null;
			generation++;
			setUrl(null);
		}
	});

	return { url: readonly(url), loading: readonly(loading), ext, reload };
}
