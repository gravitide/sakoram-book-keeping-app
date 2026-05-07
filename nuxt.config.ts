import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

export default defineNuxtConfig({
	modules: [
		"@vueuse/nuxt",
		"@nuxt/ui",
		"nuxt-svgo",
		"reka-ui/nuxt",
		"@nuxt/eslint",
		"@pinia/nuxt"
	],
	app: {
		head: {
			title: "Sakoram Book Keeping",
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
