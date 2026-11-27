// Re-encode (part of) an image through a canvas — the one place the app turns
// pixels back into PNG / JPEG bytes: the crop modal's output and the Full-page
// background's ~300 DPI downscale both come through here.
//
// Browser-only (it needs `document`); the sizing rules it is handed are pure
// and tested in stationery-artwork.ts / crop-rect.ts.

export interface ImageRegion {
	x: number
	y: number
	w: number
	h: number
}

/** JPEG quality for every re-encode; PNG ignores it. */
const JPEG_QUALITY = 0.92;

/**
 * Draw `source` (default: the whole image) of `img` scaled to `out` pixels and
 * encode it as `type`. Rejects if the browser can't encode the canvas (e.g. a
 * tainted, cross-origin image).
 */
export async function encodeImage(
	img: HTMLImageElement,
	out: { w: number, h: number },
	type: string,
	source: ImageRegion = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }
): Promise<Blob> {
	const canvas = document.createElement("canvas");
	canvas.width = out.w;
	canvas.height = out.h;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Couldn't prepare the image.");
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(img, source.x, source.y, source.w, source.h, 0, 0, out.w, out.h);
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY));
	if (!blob) throw new Error("Couldn't encode the image.");
	return blob;
}
