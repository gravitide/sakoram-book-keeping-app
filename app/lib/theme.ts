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

// The PDF accent is split from the UI theme colour (company_settings has a
// dedicated `pdf_theme_color`), so a business can run, say, a green app UI
// with red invoices. Businesses that predate the split — or haven't picked a
// separate PDF colour yet — fall back to their UI theme_color, so nothing
// changes visually until they choose. Every PDF payload builder resolves its
// accent through here.
export const pdfThemeHex = (
	settings: { pdf_theme_color?: string | null, theme_color?: string | null } | null | undefined
): string => themeHex(settings?.pdf_theme_color ?? settings?.theme_color);

export const isValidThemeColor = (name: string | null | undefined): name is ThemeColor =>
	THEME_COLORS.some((c) => c.value === name);
