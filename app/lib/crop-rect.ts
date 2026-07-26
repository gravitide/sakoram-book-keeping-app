// Pure rect math for the header-logo crop modal. All values are integer
// SOURCE-image pixels — the modal converts pointer deltas from display space
// before calling in, and rounds happen here so the stored crop is exact.
// Pure (no Vue/Tauri) per house rule so it's unit-testable in node.

export interface CropRect {
	x: number
	y: number
	w: number
	h: number
}

const round = (r: CropRect): CropRect =>
	({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

/**
 * The Reset state and the default for a fresh crop.
 *
 * Without `aspect`, the whole image (the header-logo case — a letterhead is
 * cropped free-form). With one, the largest centred rect of that ratio that
 * fits, so a square-locked crop opens on the middle of the image rather than
 * a corner.
 */
export function fullRect(imgW: number, imgH: number, aspect?: number): CropRect {
	if (!aspect || aspect <= 0) return { x: 0, y: 0, w: imgW, h: imgH };
	// Fit by whichever axis binds first.
	let w = imgW;
	let h = w / aspect;
	if (h > imgH) {
		h = imgH;
		w = h * aspect;
	}
	return round({ x: (imgW - w) / 2, y: (imgH - h) / 2, w, h });
}

/** Translate without resizing; clamps so the rect stays fully inside. */
export function moveRect(rect: CropRect, dx: number, dy: number, imgW: number, imgH: number): CropRect {
	const x = Math.min(Math.max(rect.x + dx, 0), imgW - rect.w);
	const y = Math.min(Math.max(rect.y + dy, 0), imgH - rect.h);
	return round({ ...rect, x, y });
}

/**
 * Drag one corner. The opposite corner stays anchored; result is clamped to
 * the image and to minSize per axis (no flip-through: dragging past the
 * anchor pins at minSize rather than inverting).
 *
 * With `aspect`, width and height stay locked to that ratio: the drag is
 * driven by whichever axis the pointer moved further, the other is derived,
 * and any clamp against the image edge shrinks BOTH axes so the ratio
 * survives (clamping one axis alone would silently deform the crop).
 */
export function resizeRect(
	rect: CropRect,
	corner: "nw" | "ne" | "sw" | "se",
	dx: number,
	dy: number,
	imgW: number,
	imgH: number,
	minSize = 16,
	aspect?: number
): CropRect {
	let { x, y, w, h } = rect;
	const right = x + w;
	const bottom = y + h;
	const west = corner === "nw" || corner === "sw";
	const north = corner === "nw" || corner === "ne";

	if (aspect && aspect > 0) {
		// One driving dimension: the axis the pointer pushed further. Signs are
		// normalised so "outward" is positive on both edges.
		const wantW = w + (west ? -dx : dx);
		const wantH = h + (north ? -dy : dy);
		let nw = Math.abs(wantW - w) >= Math.abs(wantH - h) ? wantW : wantH * aspect;
		// Room available before hitting the image edge, on each axis.
		const maxW = west ? right : imgW - x;
		const maxH = north ? bottom : imgH - y;
		nw = Math.min(nw, maxW, maxH * aspect);
		nw = Math.max(nw, minSize, minSize * aspect);
		const nh = nw / aspect;
		return round({
			x: west ? right - nw : x,
			y: north ? bottom - nh : y,
			w: nw,
			h: nh
		});
	}

	if (west) {
		const nx = Math.min(Math.max(x + dx, 0), right - minSize);
		w = right - nx;
		x = nx;
	} else {
		w = Math.min(Math.max(w + dx, minSize), imgW - x);
	}
	if (north) {
		const ny = Math.min(Math.max(y + dy, 0), bottom - minSize);
		h = bottom - ny;
		y = ny;
	} else {
		h = Math.min(Math.max(h + dy, minSize), imgH - y);
	}
	return round({ x, y, w, h });
}
