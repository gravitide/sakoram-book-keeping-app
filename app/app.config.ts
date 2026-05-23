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
			slots: {
				base: "cursor-pointer"
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
