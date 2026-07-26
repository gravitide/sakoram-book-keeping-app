// One hex → the eleven-step OKLCH ramp NuxtUI 4 consumes.
//
// NuxtUI reads --ui-color-primary-{50..950} and derives --ui-primary from
// shade 500 (light) / 400 (dark). A named Tailwind palette supplies all
// eleven; a custom hex is only one, so we synthesise the rest.
//
// We take only the HUE and CHROMA from the input and force a fixed lightness
// curve lifted from Tailwind v4's own palettes. That is deliberate: it means
// a near-white or near-black pick still lands at the standard 500 lightness,
// so filled buttons keep their contrast and there is no way to choose an
// unreadable theme. Chroma is clamped; zero is a legitimate grey accent.
//
// Maths is hand-rolled (sRGB → linear → OKLab → OKLCH). A colour library
// would be ~15 kB for one conversion in an app that ships offline.

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Tailwind v4's lightness curve, averaged across its palettes. */
const LIGHTNESS: Record<number, number> = {
	50: 0.971, 100: 0.936, 200: 0.885, 300: 0.808, 400: 0.704, 500: 0.637,
	600: 0.577, 700: 0.505, 800: 0.444, 900: 0.396, 950: 0.258
};

/** Chroma at each shade, relative to shade 500. */
const CHROMA_SCALE: Record<number, number> = {
	50: 0.055, 100: 0.131, 200: 0.262, 300: 0.481, 400: 0.806, 500: 1,
	600: 1.034, 700: 0.899, 800: 0.810, 900: 0.743, 950: 0.388
};

/** Beyond this the colour leaves sRGB and the browser clips it anyway. */
const MAX_CHROMA = 0.30;

const srgbToLinear = (c: number): number =>
	c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/** #rgb / #rrggbb / bare hex → [r, g, b] in 0..1. Null when unparseable. */
function parseHex(hex: string): [number, number, number] | null {
	let h = hex.trim().toLowerCase().replace(/^#/, "");
	if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
	if (!/^[0-9a-f]{6}$/.test(h)) return null;
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** sRGB → OKLCH. Returns chroma and hue only; lightness is discarded. */
function hexToChromaHue(hex: string): { chroma: number, hue: number } {
	const rgb = parseHex(hex);
	if (!rgb) return { chroma: 0, hue: 0 };
	const [r, g, b] = rgb.map(srgbToLinear) as [number, number, number];

	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

	const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
	const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

	const chroma = Math.min(Math.hypot(a, bb), MAX_CHROMA);
	const hue = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
	return { chroma, hue };
}

const round = (n: number, dp: number): number => Number(n.toFixed(dp));

/** The eleven `oklch(...)` strings for a custom accent hex. */
export function buildPrimaryRamp(hex: string): Record<number, string> {
	const { chroma, hue } = hexToChromaHue(hex);
	const ramp: Record<number, string> = {};
	for (const shade of SHADES) {
		const c = round(chroma * CHROMA_SCALE[shade]!, 4);
		ramp[shade] = `oklch(${round(LIGHTNESS[shade]!, 3)} ${c} ${round(hue, 2)})`;
	}
	return ramp;
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Apply the accent app-wide.
 *
 * A named preset goes through `appConfig.ui.colors.primary`, which is what
 * NuxtUI is designed for. A hex instead writes the synthesised ramp as inline
 * styles on <html> — inline beats NuxtUI's `:root` block, and `--ui-primary`
 * re-derives from it automatically, so light and dark both work with no
 * extra branch. Switching back to a preset must clear the overrides or they
 * would keep winning.
 */
export function applyPrimaryColor(
	appConfig: { ui: { colors: { primary: string } } },
	value: string | null | undefined
): void {
	const root = document.documentElement;
	if (typeof value === "string" && HEX_RE.test(value.trim())) {
		const ramp = buildPrimaryRamp(value);
		for (const shade of SHADES) root.style.setProperty(`--ui-color-primary-${shade}`, ramp[shade]!);
		return;
	}
	for (const shade of SHADES) root.style.removeProperty(`--ui-color-primary-${shade}`);
	if (value) appConfig.ui.colors.primary = value;
}
