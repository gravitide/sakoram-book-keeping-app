// The upload plumbing both Stationery artwork cards share
// (StationeryBackgroundCard, StationeryHeaderFooterCard): decoding an upload,
// the ~300 DPI downscale, saving a raster upload as its untouched original +
// the derivative PDFs render, reading back what Re-crop starts from, and the
// one error toast. What each card does with the result — the background's
// paper-shaped crop, an image's place on the page — stays in the card.
//
// Every file goes through the business-asset commands (a business folder can
// live on any drive — see CLAUDE.md), never the fs plugin.

import type { BusinessAssetKind } from "~/lib/business-assets";
import type { CropRect } from "~/lib/crop-rect";
import type { PaperSize } from "~/lib/page-settings";
import type { ArtworkExt } from "~/lib/stationery";
import { readBusinessAsset, saveBusinessAsset } from "~/lib/business-assets";
import { encodeImage } from "~/lib/canvas-image";
import { artworkFormatOf, artworkMimeOf, artworkPixelSize, downscaleSize } from "~/lib/stationery-artwork";
import { useTenantsStore } from "~/stores/tenants";

/** One piece of artwork's two files: the one PDFs render, and the untouched raster upload kept for Re-crop. */
export interface ArtworkAssets {
	asset: BusinessAssetKind
	original: BusinessAssetKind
}

/** What Re-crop opens: the source image and the crop to start from (null = the whole image). */
export interface CropSource {
	ext: ArtworkExt
	blob: Blob
	initial: CropRect | null
}

export function useRasterArtwork() {
	const tenants = useTenantsStore();
	const toast = useToast();

	const fail = (title: string, err: unknown) => toast.add({
		title,
		description: err instanceof Error ? err.message : String(err),
		color: "error",
		icon: "i-lucide-circle-alert"
	});

	const activeId = () => {
		if (!tenants.activeTenantId) throw new Error("No active business.");
		return tenants.activeTenantId;
	};

	/** Decode an image so its pixel size can be read (and it can be drawn to a canvas). */
	const loadImage = (blob: Blob) => new Promise<HTMLImageElement>((resolve, reject) => {
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("That image couldn't be read."));
		};
		img.src = url;
	});

	/** The whole image, downscaled to ~300 DPI at the paper size (never enlarged). */
	const downscaled = async (img: HTMLImageElement, ext: ArtworkExt, paper: PaperSize): Promise<Uint8Array> => {
		const out = downscaleSize(img.naturalWidth, img.naturalHeight, artworkPixelSize(paper));
		const blob = await encodeImage(img, out, artworkMimeOf(ext));
		return new Uint8Array(await blob.arrayBuffer());
	};

	/** A raster upload: the untouched original first, then the derivative PDFs render. */
	const saveRaster = async (assets: ArtworkAssets, ext: ArtworkExt, original: Uint8Array, derivative: Uint8Array | Blob) => {
		const id = activeId();
		const bytes = derivative instanceof Blob ? new Uint8Array(await derivative.arrayBuffer()) : derivative;
		await saveBusinessAsset(id, assets.original, ext, original);
		await saveBusinessAsset(id, assets.asset, ext, bytes);
	};

	/** Just the derivative (a Re-crop: the original is already there). */
	const saveDerivative = async (assets: ArtworkAssets, ext: ArtworkExt, derivative: Blob) => {
		await saveBusinessAsset(activeId(), assets.asset, ext, new Uint8Array(await derivative.arrayBuffer()));
	};

	/**
	 * What Re-crop starts from: the untouched original with the stored crop —
	 * or, when there is no original (e.g. restored from an older build's
	 * backup), the derivative itself, uncropped.
	 */
	const readCropSource = async (assets: ArtworkAssets, storedCrop: CropRect | null): Promise<CropSource> => {
		const id = activeId();
		let ext: string;
		let bytes: number[];
		let initial = storedCrop;
		try {
			[ext, bytes] = await readBusinessAsset(id, assets.original);
		} catch {
			[ext, bytes] = await readBusinessAsset(id, assets.asset);
			initial = null;
		}
		const format = artworkFormatOf(`x.${ext}`) ?? "png";
		return { ext: format, blob: new Blob([new Uint8Array(bytes)], { type: artworkMimeOf(format) }), initial };
	};

	return { fail, activeId, loadImage, downscaled, saveRaster, saveDerivative, readCropSource };
}
