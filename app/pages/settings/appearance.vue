<template>
	<div>
		<header class="mb-6">
			<h1 class="text-2xl font-semibold">
				Appearance
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Pick the UI font and the accent color used across the app
				and on rendered documents. PDF-specific fonts live under
				Settings → PDF.
			</p>
		</header>

		<div class="space-y-6 max-w-2xl">
			<UCard>
				<template #header>
					<div class="font-medium">
						UI font
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Used in the app interface. Three fonts (Inter, Inter Tight,
						Miriam Libre) ship with the app; anything else falls through to
						what's installed on your system.
					</div>
				</template>

				<UFormField label="Font family">
					<UInput v-model="uiFont" placeholder="e.g. Inter" />
				</UFormField>

				<div class="mt-4">
					<div class="text-xs text-(--ui-text-muted) mb-2">
						Bundled fonts (always available):
					</div>
					<div class="flex flex-wrap gap-2 mb-3">
						<UButton
							v-for="suggestion in bundledFonts"
							:key="suggestion"
							size="xs"
							variant="soft"
							color="primary"
							@click="uiFont = suggestion"
						>
							{{ suggestion }}
						</UButton>
					</div>
					<div class="text-xs text-(--ui-text-muted) mb-2">
						System fonts (only if installed):
					</div>
					<div class="flex flex-wrap gap-2">
						<UButton
							v-for="suggestion in systemFonts"
							:key="suggestion"
							size="xs"
							variant="soft"
							color="neutral"
							@click="uiFont = suggestion"
						>
							{{ suggestion }}
						</UButton>
					</div>
				</div>

				<div class="mt-6 p-4 border border-(--ui-border) rounded-md bg-(--ui-bg-muted)">
					<div class="text-xs text-(--ui-text-muted) uppercase tracking-wide mb-2">
						Preview
					</div>
					<div :style="{ fontFamily: previewFontStack }" class="space-y-1">
						<div class="text-2xl font-semibold">
							The quick brown fox jumps over the lazy dog
						</div>
						<div class="text-sm">
							Sphinx of black quartz, judge my vow. 0123456789
						</div>
					</div>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Theme color
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Drives buttons, links, badges, and the header rule on PDFs.
					</div>
				</template>

				<div class="grid grid-cols-4 sm:grid-cols-8 gap-3">
					<button
						v-for="c in colors"
						:key="c.value"
						type="button"
						class="group flex flex-col items-center gap-1.5"
						:title="c.label"
						@click="themeColor = c.value"
					>
						<span
							class="size-10 rounded-full border-2 transition"
							:class="themeColor === c.value ? 'border-(--ui-text) scale-110' : 'border-(--ui-border) group-hover:border-(--ui-text-muted)'"
							:style="{ backgroundColor: c.hex }"
						/>
						<span class="text-xs" :class="themeColor === c.value ? 'text-(--ui-text) font-medium' : 'text-(--ui-text-muted)'">
							{{ c.label }}
						</span>
					</button>
				</div>
			</UCard>

			<div class="flex justify-end gap-2">
				<UButton
					color="neutral"
					variant="outline"
					:disabled="!dirty || saving"
					@click="reset"
				>
					Reset
				</UButton>
				<UButton :loading="saving" :disabled="!dirty" icon="i-lucide-save" @click="onSave">
					Save changes
				</UButton>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Appearance settings — UI font (free-text) and theme color (curated set).
// Saving here mutates the global appConfig and CSS variable, so the change
// is visible immediately app-wide. Persisted to company_settings so it
// sticks across launches.

	import type { ThemeColor } from "~/lib/theme";
	import { isValidThemeColor, THEME_COLORS } from "~/lib/theme";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Appearance" });

	const store = useSettingsStore();
	const toast = useToast();
	const appConfig = useAppConfig() as { ui: { colors: { primary: string } } };

	await store.ensureLoaded();

	const colors = THEME_COLORS;
	// Bundled fonts ship with the app via @font-face (UI) and Typst's
	// --font-path arg (PDF) — guaranteed to render regardless of what's
	// installed locally. System fonts are common picks but only render
	// when present on the user's machine; the cascade falls back to the
	// bundled Inter if not.
	const bundledFonts = [
		"Inter",
		"Inter Tight",
		"Miriam Libre"
	];
	const systemFonts = [
		"system-ui",
		"Georgia",
		"Times New Roman",
		"Courier New"
	];

	const uiFont = ref<string>(store.settings?.ui_font ?? "Inter");
	const themeColor = ref<ThemeColor>(
		isValidThemeColor(store.settings?.theme_color) ? store.settings!.theme_color : "red"
	);

	const initialUiFont = ref<string>(uiFont.value);
	const initialColor = ref<ThemeColor>(themeColor.value);

	const dirty = computed(() =>
		uiFont.value.trim() !== initialUiFont.value
		|| themeColor.value !== initialColor.value
	);

	// Live preview: change the CSS variable + appConfig as the user picks,
	// so they don't have to save to see the effect. We snap back to the
	// last-saved values if they cancel.
	const previewFontStack = computed(() =>
		`'${uiFont.value || "Inter"}', 'Inter', system-ui, sans-serif`
	);

	// Live preview: override Tailwind's --font-sans on :root + flip the
	// NuxtUI primary so the user sees changes app-wide (sidebar, toasts,
	// teleported popovers) without saving. The layout watches the saved
	// settings and re-applies them on save, so cancelling snaps back via
	// the layout watcher firing with the unchanged DB value.
	watch([uiFont, themeColor], () => {
		document.documentElement.style.setProperty("--font-sans", previewFontStack.value);
		appConfig.ui.colors.primary = themeColor.value;
	}, { immediate: true });

	const saving = ref(false);

	const onSave = async () => {
		saving.value = true;
		try {
			const u = uiFont.value.trim() || "Inter";
			await store.save({
				ui_font: u,
				theme_color: themeColor.value
			});
			initialUiFont.value = u;
			initialColor.value = themeColor.value;
			toast.add({ title: "Appearance saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Save failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			saving.value = false;
		}
	};

	const reset = () => {
		uiFont.value = initialUiFont.value;
		themeColor.value = initialColor.value;
	};
</script>
