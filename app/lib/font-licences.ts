// Attribution for the bundled font families, shown under About → Fonts &
// licences.
//
// Every bundled family is SIL Open Font License 1.1. The OFL requires the
// copyright notice and licence to accompany the fonts in ALL copies —
// redistribution, not sale, is what triggers it — so two things ship:
//
//   - `src-tauri/fonts/OFL.txt`  the on-disk copy that travels with the TTFs
//                                (bundled by the `fonts/*` resources glob)
//   - this file                  the same attribution, structured, so the app
//                                can show it without reading from disk
//
// Values are transcribed from each TTF's own name table (IDs 0, 9, 11), which
// is authoritative for exactly the files we ship — not from an external
// listing that might describe a different cut.
//
// Adding a font: append a row here as well as in `fonts.ts`, and add the
// copyright block to `src-tauri/fonts/OFL.txt`. The unit test fails if the
// two registries drift.

export interface FontLicence {
	/** Family name, matching `BUNDLED_FONTS[].name` exactly. */
	name: string
	/** Copyright line, verbatim from the font's name table. */
	copyright: string
	/** Designer / foundry credit. */
	designer: string
	/** Project or designer URL, when the font declares one. */
	url?: string
}

export const FONT_LICENCE_NAME = "SIL Open Font License 1.1";
export const FONT_LICENCE_URL = "https://openfontlicense.org";

export const FONT_LICENCES: FontLicence[] = [
	{
		name: "Akt",
		copyright: "Copyright 2024 The Akt Project Authors",
		designer: "Dmitry Grenev",
		url: "https://github.com/dimgrenev/akt"
	},
	{
		name: "Inter",
		copyright: "Copyright 2016 The Inter Project Authors",
		designer: "Rasmus Andersson",
		url: "https://github.com/rsms/inter"
	},
	{
		name: "Inter Tight",
		copyright: "Copyright 2022 The Inter Project Authors",
		designer: "Rasmus Andersson",
		url: "https://github.com/rsms/inter-tight"
	},
	{
		name: "Stack Sans Text",
		copyright: "Copyright 2025 The Stack Sans Project Authors",
		designer: "Koto and Dylan Young",
		url: "https://github.com/DylanYoungKoto/Stack-Sans"
	},
	{
		name: "Miriam Libre",
		copyright: "Copyright 2023 The Miriam Libre Project Authors",
		designer: "Michal Sahar",
		url: "https://github.com/simoncozens/Miriam-Libre/"
	},
	{
		name: "Amarna",
		copyright: "Copyright 2025 The Amarna Project Authors",
		designer: "Ishtar van Looy",
		url: "https://github.com/ijvanl/Amarna"
	},
	{
		name: "Geomini",
		copyright: "Copyright 2026 The Geomini Project Authors",
		designer: "FontBob",
		url: "https://github.com/fontbob/geomini"
	},
	{
		name: "Iosevka Charon Mono",
		copyright: "Copyright 2015-2025 The Iosevka Project Authors",
		designer: "Belleve Invis",
		url: "https://github.com/be5invis/Iosevka"
	},
	{
		name: "Martian Mono",
		copyright: "Copyright 2020 The Martian Mono Project Authors",
		designer: "Roman Shamin",
		url: "https://github.com/evilmartians/mono"
	},
	{
		name: "Google Sans Code",
		copyright: "Copyright 2025 The Google Sans Code Project Authors",
		designer: "Google Sans Code Authors",
		url: "https://github.com/googlefonts/googlesans-code"
	}
];
