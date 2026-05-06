// Single source of truth for the theme-color picker.
//
// The same name (e.g. "blue") is sent to:
//   - NuxtUI:    appConfig.ui.colors.primary = name  → drives all UI accents
//   - The PDF:   data.theme_color = THEME_HEX[name]  → drives the header rule
//                                                       + accents in document.typ
//                                                       and voucher.typ
//
// We intentionally pick the -500 Tailwind shade for the PDF hex: it reads
// well on white paper and matches the screen accent within a perceptual
// step or two.

export type ThemeColor
	= | "red"
		| "orange"
		| "amber"
		| "green"
		| "emerald"
		| "sky"
		| "blue"
		| "violet";

export const THEME_COLORS: ReadonlyArray<{ value: ThemeColor, label: string, hex: string }> = [
	{ value: "red", label: "Red", hex: "#ef4444" },
	{ value: "orange", label: "Orange", hex: "#f97316" },
	{ value: "amber", label: "Amber", hex: "#f59e0b" },
	{ value: "green", label: "Green", hex: "#22c55e" },
	{ value: "emerald", label: "Emerald", hex: "#10b981" },
	{ value: "sky", label: "Sky", hex: "#0ea5e9" },
	{ value: "blue", label: "Blue", hex: "#3b82f6" },
	{ value: "violet", label: "Violet", hex: "#8b5cf6" }
] as const;

export const themeHex = (name: string | null | undefined): string => {
	const found = THEME_COLORS.find((c) => c.value === name);
	return found?.hex ?? "#ef4444";
};

export const isValidThemeColor = (name: string | null | undefined): name is ThemeColor =>
	THEME_COLORS.some((c) => c.value === name);
