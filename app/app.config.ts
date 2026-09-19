export default defineAppConfig({
	app: {
		name: "Sakoram",
		author: "Gravitide",
		repo: "https://github.com/srisar/sakoram-book-keeping-app"
	},
	ui: {
		colors: {
			primary: "green",
			neutral: "zinc"
		},
		button: {
			// Uppercase + a touch of letter-spacing across every button
			// in the app — same treatment we use on chip labels and
			// table headers. Reads as a clear "action" cue and matches
			// the rest of the UI's typography rhythm.
			//
			// `!text-xs` drops the default text-sm (14px) one step to
			// 12px. Uppercase glyphs hit cap-height on every letter so
			// the buttons read visually bigger than mixed-case body
			// text at the same nominal size — trimming a step brings
			// them back into proportion. The `!` is needed because the
			// per-size variant (md → text-sm) would otherwise win.
			slots: {
				base: "cursor-pointer uppercase tracking-wide !text-xs"
			}
		},
		card: {
			// Match the sidebar's softened drop shadow so every elevated
			// surface (KPI tiles, dashboard cards, section cards on
			// detail pages, modals) reads as a single visual layer
			// above the paper page bg. Tailwind-merge takes care of
			// overriding UCard's default shadow token.
			slots: {
				root: "shadow-md shadow-black/10"
			}
		},
		modal: {
			// Modal chrome (title + supporting description in the
			// header) AND the body content are not data the user copies
			// out — keep the whole dialog out of the drag-select cycle.
			// Form inputs inside the body still pick up user-select:text
			// via the global rule in main.css, so forms stay editable.
			// (Modals using #content instead of #body need to add
			// `select-none` themselves — the slot styling here only
			// reaches the default body slot.)
			slots: {
				title: "select-none",
				description: "select-none",
				body: "select-none"
			}
		},
		popover: {
			// Popover bodies host pickers (Client / Vendor / Employee /
			// Category / Date) and filter strips — list-like read-only
			// UI that shouldn't drag-select like data. Form inputs
			// (search boxes etc.) inside still stay text-selectable via
			// the input/textarea override in main.css.
			slots: {
				content: "select-none"
			}
		},
		formField: {
			slots: {
				root: "w-full",
				// Helper text shouldn't drag-select like data — same
				// rationale as the global `label` rule in main.css.
				hint: "select-none",
				description: "select-none",
				help: "select-none"
			}
		},
		input: {
			slots: {
				root: "w-full"
			}
		},
		textarea: {
			slots: {
				root: "w-full",
				base: "resize-none"
			}
		},
		accordion: {
			slots: {
				trigger: "cursor-pointer",
				item: "md:py-2"
			}
		},
		navigationMenu: {
			slots: {
				link: "cursor-pointer"
			}
		}
	}
});
