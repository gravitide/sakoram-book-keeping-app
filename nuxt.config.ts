import process from "node:process";
import Aura from "@primevue/themes/aura";

const host = process.env.TAURI_DEV_HOST;

export default defineNuxtConfig({
	modules: [
		"@vueuse/nuxt",
		"@nuxt/ui",
		"nuxt-svgo",
		"reka-ui/nuxt",
		"@nuxt/eslint",
		"@pinia/nuxt",
		"@primevue/nuxt-module"
	],
	// PrimeVue is used for DataTable (resizable columns out of the box) and
	// ContextMenu (row right-click on the list pages). Everything else in
	// the app is NuxtUI. Restrict auto-imports to those three components
	// so PrimeVue's composables (especially `useToast`) don't shadow
	// NuxtUI's, and the bundle doesn't pull in the rest of PrimeVue.
	// The Aura theme respects our existing `.dark` class so PrimeVue
	// inherits the app's light/dark mode without a separate toggle.
	primevue: {
		autoImport: true,
		components: {
			include: ["DataTable", "Column", "ContextMenu"]
		},
		composables: {
			include: []
		},
		directives: {
			include: []
		},
		options: {
			theme: {
				preset: Aura,
				options: {
					darkModeSelector: ".dark",
					cssLayer: false
				}
			}
		}
	},
	app: {
		head: {
			title: "Sakoram - The desktop bookkeeper!",
			charset: "utf-8",
			viewport: "width=device-width, initial-scale=1",
			meta: [
				{ name: "format-detection", content: "no" },
				{ name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" }
			]
		},
		// Page + layout transitions are disabled (set to false).
		//
		// Nuxt's default is `{ mode: "out-in" }` for both, which means
		// the OLD page must finish its leave transition AND unmount
		// before the new page even starts to mount. On a desktop app
		// with heavy lists, that gives the user a "frozen until the
		// new page is ready" feel — the sidebar is unresponsive during
		// the leave transition, and the in-page loading spinner can't
		// show because the new page hasn't mounted yet.
		//
		// Disabling the transitions lets the new page mount instantly
		// on click. The NuxtLoadingIndicator bar + the in-page spinner
		// + the keep-alive on <NuxtPage> together cover what the fade
		// transition used to communicate (and what it never did, which
		// is letting the user click another link mid-nav).
		pageTransition: false,
		layoutTransition: false
	},
	css: [
		"@/assets/css/main.css"
	],
	svgo: {
		autoImportPath: "@/assets/"
	},
	// Bundle every Lucide icon referenced in source into the client build.
	// Without this, NuxtUI / @nuxt/icon falls back to fetching SVGs from the
	// Iconify API at runtime — which fails offline (we ship a desktop app
	// that's expected to work without internet) and shows blank squares
	// when the user's network is slow on first paint. `scan: true` tells
	// Vite to inline only the icons actually used in templates, so the
	// bundle stays small.
	icon: {
		provider: "iconify",
		clientBundle: {
			scan: true,
			sizeLimitKb: 512
		}
	},
	ssr: false,
	dir: {
		modules: "app/modules"
	},
	imports: {
		presets: [
			{
				from: "zod",
				imports: [
					"z",
					{
						name: "infer",
						as: "zInfer",
						type: true
					}
				]
			}
		]
	},
	vite: {
		clearScreen: false,
		envPrefix: ["VITE_", "TAURI_"],
		// TipTap + @nuxt/ui's own bundled TipTap pulled two prosemirror-model
		// copies (1.25.4 vs 1.25.10). Both loading at runtime made every
		// structural editor command (lists, Enter/splitBlock) throw
		// "multiple versions of prosemirror-model". Dedupe forces the bundler
		// to resolve every ProseMirror package to a single copy so node schema
		// identity is shared across the editor.
		resolve: {
			dedupe: [
				"prosemirror-model",
				"prosemirror-state",
				"prosemirror-transform",
				"prosemirror-view",
				"prosemirror-keymap",
				"prosemirror-commands",
				"prosemirror-schema-list",
				"prosemirror-history",
				"prosemirror-inputrules",
				"prosemirror-gapcursor",
				"prosemirror-dropcursor",
				"@tiptap/pm"
			]
		},
		server: {
			strictPort: true,
			hmr: host
				? {
					protocol: "ws",
					host,
					port: 3001
				}
				: undefined,
			watch: {
				ignored: ["**/src-tauri/**"]
			}
		}
	},
	devServer: {
		host: host || "0.0.0.0",
		port: 4004
	},
	router: {
		options: {
			scrollBehaviorType: "smooth"
		}
	},
	eslint: {
		config: {
			standalone: false
		}
	},
	devtools: {
		enabled: false
	},
	experimental: {
		typedPages: true
	},
	compatibilityDate: "2026-01-01"
});
