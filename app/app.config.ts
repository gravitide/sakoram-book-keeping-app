export default defineAppConfig({
	app: {
		name: "Nuxtor",
		author: "Nicola Spadari",
		repo: "https://github.com/NicolaSpadari/nuxtor",
		tauriSite: "https://tauri.app",
		nuxtSite: "https://nuxt.com",
		nuxtUiSite: "https://ui4.nuxt.dev"
	},
	pageCategories: {
		system: {
			label: "System",
			icon: "lucide:square-terminal"
		},
		storage: {
			label: "Storage",
			icon: "lucide:archive"
		},
		interface: {
			label: "Interface",
			icon: "lucide:app-window-mac"
		},
		other: {
			label: "Other",
			icon: "lucide:folder"
		}
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
