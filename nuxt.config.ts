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
		pageTransition: {
			name: "page",
			mode: "out-in"
		},
		layoutTransition: {
			name: "layout",
			mode: "out-in"
		}
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
		host: host || "0.0.0.0"
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
