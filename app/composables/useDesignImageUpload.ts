// Puts a file into the open business's folder as a page-design image
// (stationery/item-<id>.<ext>) for the page designer, always under a FRESH id
// — a saved design's files are never overwritten (app/lib/design-draft.ts).
//
//   PNG / JPEG — through ImageCropModal (free aspect, capped at ~300 DPI at
//                the page size: artworkPixelSize, the same cap as rasterTarget);
//                Cancel uploads nothing.
//   SVG        — as-is; warns when it still holds live text.
//   PDF        — as-is; its proportions come from a small PNG of page 1.
//
// The page renders ImageCropModal bound to `crop` and calls onCropped /
// onCropCancel. The caller adds each returned id to its "uploaded this
// session" list (design-draft filesToRemove).

import type { CropRect } from "~/lib/crop-rect";
import type { ImageExt } from "~/lib/page-design";
import type { PaperSize } from "~/lib/paper-sizes";
import { invoke } from "@tauri-apps/api/core";
import { itemAssetKind, readBusinessAsset, removeBusinessAsset, saveBusinessAsset } from "~/lib/business-assets";
import { uploadPlan } from "~/lib/design-image";
import { newItemId } from "~/lib/page-design";
import { artworkMimeOf, artworkPixelSize, svgAspect, svgHasLiveText } from "~/lib/stationery-artwork";
import { useTenantsStore } from "~/stores/tenants";

export interface UploadedImage { id: string, ext: ImageExt, aspect: number }

const aspectOf = async (blob: Blob): Promise<number> => {
	const bitmap = await createImageBitmap(blob);
	const aspect = bitmap.width / bitmap.height;
	bitmap.close();
	return aspect;
};

export function useDesignImageUpload() {
	const tenants = useTenantsStore();
	const toast = useToast();

	/** What ImageCropModal shows: open, the image, its output type and size cap. */
	const crop = reactive({
		open: false,
		blob: null as Blob | null,
		outputType: "image/png" as "image/png" | "image/jpeg",
		maxOutput: artworkPixelSize("a4")
	});
	let pending: { ext: ImageExt, resolve: (r: UploadedImage | null) => void } | null = null;

	const tenantId = () => {
		const id = tenants.activeTenantId;
		if (!id) throw new Error("No business is open.");
		return id;
	};

	const write = async (ext: ImageExt, bytes: number[]): Promise<string> => {
		const id = newItemId();
		await saveBusinessAsset(tenantId(), itemAssetKind(id), ext, bytes);
		return id;
	};

	/** Open the crop step for a raster image; resolves when it is applied or cancelled. */
	const cropThen = (blob: Blob, ext: ImageExt, paper: PaperSize) => new Promise<UploadedImage | null>((resolve) => {
		pending?.resolve(null);
		pending = { ext, resolve };
		crop.blob = blob;
		crop.outputType = ext === "jpg" ? "image/jpeg" : "image/png";
		crop.maxOutput = artworkPixelSize(paper);
		crop.open = true;
	});

	/** A new design image from a dropped or picked file, or null (refused, or the crop was cancelled). */
	async function upload(file: File, paper: PaperSize): Promise<UploadedImage | null> {
		const plan = uploadPlan(file.name, file.type);
		if ("error" in plan) {
			toast.add({ title: "Can't use that file", description: plan.error, color: "error", icon: "i-lucide-circle-alert" });
			return null;
		}
		if (plan.raster) return cropThen(file, plan.ext, paper);

		const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
		const id = await write(plan.ext, bytes);
		let aspect = 1;
		if (plan.ext === "svg") {
			const svg = await file.text();
			aspect = svgAspect(svg) ?? 1;
			if (svgHasLiveText(svg)) {
				toast.add({
					title: "Convert the text to outlines",
					description: "This SVG still contains live text. The PDF uses only Sakoram's bundled fonts, so its lettering may come out in a different typeface. Convert text to outlines in your design app and upload it again.",
					color: "warning",
					icon: "i-lucide-type"
				});
			}
		} else {
			// Measuring renders page 1: a PDF that can't be rendered here would make
			// every document PDF fail, so it is refused (and its file removed).
			try {
				const png = await invoke<number[]>("render_stationery_artwork_png", { ppi: 20, artwork: `item-${id}` });
				aspect = await aspectOf(new Blob([new Uint8Array(png)], { type: "image/png" }));
			} catch (e) {
				await removeBusinessAsset(tenantId(), itemAssetKind(id)).catch(() => {});
				toast.add({ title: "Can't use that PDF", description: "Its first page couldn't be read. Try exporting it again, or use an SVG or PNG.", color: "error", icon: "i-lucide-circle-alert" });
				console.warn("[designer] PDF image refused", e);
				return null;
			}
		}
		return { id, ext: plan.ext, aspect };
	}

	/** A cropped copy of an existing raster design image, under a new id; null when cancelled. */
	async function cropExisting(itemId: string, ext: ImageExt, paper: PaperSize): Promise<UploadedImage | null> {
		const [, bytes] = await readBusinessAsset(tenantId(), itemAssetKind(itemId));
		return cropThen(new Blob([new Uint8Array(bytes)], { type: artworkMimeOf(ext) }), ext, paper);
	}

	async function onCropped(_rect: CropRect, blob: Blob) {
		const p = pending;
		pending = null;
		crop.open = false;
		if (!p) return;
		try {
			const id = await write(p.ext, Array.from(new Uint8Array(await blob.arrayBuffer())));
			p.resolve({ id, ext: p.ext, aspect: await aspectOf(blob) });
		} catch (e) {
			toast.add({ title: "Couldn't add the image", description: e instanceof Error ? e.message : String(e), color: "error", icon: "i-lucide-circle-alert" });
			p.resolve(null);
		}
	}

	// The modal's X / Escape / overlay only closes it (no `cancel`): treat as Cancel.
	watch(() => crop.open, (open) => {
		if (!open && pending) onCropCancel();
	});

	function onCropCancel() {
		pending?.resolve(null);
		pending = null;
		crop.open = false;
	}

	return { crop, upload, cropExisting, onCropped, onCropCancel };
}
