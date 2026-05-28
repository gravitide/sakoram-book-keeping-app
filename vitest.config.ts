import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.spec.ts", "app/**/*.test.ts"],
		globals: false
	},
	resolve: {
		alias: {
			"@/": fileURLToPath(new URL("./app/", import.meta.url)),
			"~/": fileURLToPath(new URL("./app/", import.meta.url))
		}
	}
});
