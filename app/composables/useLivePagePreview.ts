// A live PNG of one page (page 1 unless asked) of a document payload, re-rendered by the real Typst
// pipeline (`render_document_page_png`) ~500 ms after the payload stops
// changing. Used by /settings/pdf, whose payload is the sample invoice built
// from the UNSAVED form, so every edit shows before it is saved.
//
// Latest-wins (app/lib/latest-debounced.ts): a slow render that finishes after
// a newer one is dropped. `deps` adds inputs that change the render without
// changing the payload — re-uploaded artwork or a re-cropped logo keep the
// same stored path / format, so the payload JSON alone wouldn't notice.
//
// Kept-alive page: paused while deactivated, re-rendered on activation (the
// settings may have changed elsewhere, e.g. the Letters page saving the
// Pre-printed paper bands).

import { invoke } from "@tauri-apps/api/core";
import { createLatestDebounced } from "~/lib/latest-debounced";

export interface LivePagePreviewOptions {
	/** Typst raster resolution. 72 ≈ an A4 page 595 px wide: sharp at thumbnail size on a 2× screen. */
	ppi?: number
	delayMs?: number
	deps?: () => unknown
	/** Which page to render (1-based, default 1) — the page designer's Page 1 / Page 2 switch. */
	page?: () => number
	/** The raster resolution, when it follows something reactive (the designer's zoom). Wins over `ppi`. */
	ppiFn?: () => number
}

export function useLivePagePreview(payload: () => Record<string, unknown> | null, opts: LivePagePreviewOptions = {}) {
	const url = ref<string | null>(null);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const setUrl = (next: string | null) => {
		if (url.value) URL.revokeObjectURL(url.value);
		url.value = next;
	};

	const runner = createLatestDebounced({
		delayMs: opts.delayMs ?? 500,
		run: (args: { data: Record<string, unknown>, ppi: number, page: number }) => invoke<number[]>("render_document_page_png", args),
		onResult: (png) => {
			error.value = null;
			setUrl(URL.createObjectURL(new Blob([new Uint8Array(png)], { type: "image/png" })));
		},
		onError: (err) => {
			console.warn("[pdf] live page preview failed:", err);
			error.value = err instanceof Error ? err.message : String(err);
			setUrl(null);
		},
		onBusy: (busy) => {
			loading.value = busy;
		}
	});

	const ppi = () => opts.ppiFn?.() ?? opts.ppi ?? 72;
	const page = () => opts.page?.() ?? 1;
	const key = () => JSON.stringify([payload(), opts.deps?.() ?? null, ppi(), page()]);
	let active = true;
	const render = (now: boolean) => {
		const data = payload();
		if (!data || !active) return;
		const args = { data, ppi: ppi(), page: page() };
		if (now) runner.runNow(args);
		else runner.schedule(args);
	};

	// renderNextNow(): the next change renders without the debounce (a finished
	// drag in the page designer — the user is waiting to see where it landed).
	let nextNow = false;
	const renderNextNow = () => {
		nextNow = true;
	};
	watch(key, (_, prev) => {
		const now = prev === undefined || nextNow;
		nextNow = false;
		render(now);
	}, { immediate: true });

	let firstActivation = true;
	onActivated(() => {
		active = true;
		if (firstActivation) {
			firstActivation = false;
			return;
		}
		render(true);
	});
	onDeactivated(() => {
		active = false;
		runner.cancel();
	});
	onBeforeUnmount(() => {
		runner.cancel();
		setUrl(null);
	});

	return { url: readonly(url), loading: readonly(loading), error: readonly(error), renderNextNow };
}
