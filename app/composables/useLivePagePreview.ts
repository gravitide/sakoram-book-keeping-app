// A live PNG of page 1 of a document payload, re-rendered by the real Typst
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
		run: (data: Record<string, unknown>) => invoke<number[]>("render_document_page_png", { data, ppi: opts.ppi ?? 72 }),
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

	const key = () => JSON.stringify([payload(), opts.deps?.() ?? null]);
	let active = true;
	const render = (now: boolean) => {
		const data = payload();
		if (!data || !active) return;
		if (now) runner.runNow(data);
		else runner.schedule(data);
	};

	watch(key, (_, prev) => render(prev === undefined), { immediate: true });

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

	return { url: readonly(url), loading: readonly(loading), error: readonly(error) };
}
