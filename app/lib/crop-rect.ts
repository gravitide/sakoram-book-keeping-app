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

/** The whole image — the Reset state and the default for a fresh crop. */
export function fullRect(imgW: number, imgH: number): CropRect {
	return { x: 0, y: 0, w: imgW, h: imgH };
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
 */
export function resizeRect(
	rect: CropRect,
	corner: "nw" | "ne" | "sw" | "se",
	dx: number,
	dy: number,
	imgW: number,
	imgH: number,
	minSize = 16
): CropRect {
	let { x, y, w, h } = rect;
	const right = x + w;
	const bottom = y + h;

	if (corner === "nw" || corner === "sw") {
		const nx = Math.min(Math.max(x + dx, 0), right - minSize);
		w = right - nx;
		x = nx;
	} else {
		w = Math.min(Math.max(w + dx, minSize), imgW - x);
	}
	if (corner === "nw" || corner === "ne") {
		const ny = Math.min(Math.max(y + dy, 0), bottom - minSize);
		h = bottom - ny;
		y = ny;
	} else {
		h = Math.min(Math.max(h + dy, minSize), imgH - y);
	}
	return round({ x, y, w, h });
}
