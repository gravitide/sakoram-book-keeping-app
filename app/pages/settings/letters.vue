<template>
	<div class="select-none">
		<header class="mb-6 max-w-2xl mx-auto">
			<h1 class="text-2xl font-semibold">
				Letters
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Manage the categories you tag letters with, the top margin reserved for
				pre-printed letterhead paper, and (soon) reusable letterhead templates.
			</p>
		</header>

		<div class="space-y-6 max-w-2xl mx-auto">
			<!-- Categories -->
			<UCard id="categories" class="scroll-mt-6">
				<template #header>
					<div class="font-medium">
						Categories
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Tags for organising and filtering letters (e.g. "Service letter",
						"Internship confirmation"). Archiving hides a category from the
						picker without touching letters already tagged with it.
					</div>
				</template>

				<div class="space-y-4">
					<div class="flex items-center gap-2">
						<UInput
							v-model="newName"
							placeholder="New category name…"
							class="flex-1"
							@keydown.enter.prevent="addCategory"
						/>
						<UButton icon="i-lucide-plus" :disabled="!newName.trim() || busy" @click="addCategory">
							Add
						</UButton>
					</div>

					<div v-if="catStore.categories.length === 0" class="text-sm text-(--ui-text-muted) py-4 text-center">
						No categories yet. Add one above.
					</div>
					<ul v-else class="divide-y divide-(--ui-border) border border-(--ui-border) rounded-md">
						<li
							v-for="c in catStore.categories"
							:key="c.id"
							class="flex items-center gap-2 px-3 py-2"
							:class="c.is_archived === 1 ? 'opacity-55' : ''"
						>
							<template v-if="editingId === c.id">
								<UInput v-model="editName" class="flex-1" autofocus @keydown.enter.prevent="saveRename(c.id)" />
								<UButton size="xs" icon="i-lucide-check" :disabled="busy" @click="saveRename(c.id)">
									Save
								</UButton>
								<UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="editingId = null">
									Cancel
								</UButton>
							</template>
							<template v-else>
								<span class="flex-1 text-sm truncate">{{ c.name }}</span>
								<UBadge v-if="c.is_archived === 1" size="xs" color="neutral" variant="subtle">
									Archived
								</UBadge>
								<UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Rename" @click="startRename(c)" />
								<UButton
									size="xs"
									color="neutral"
									variant="ghost"
									:icon="c.is_archived === 1 ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
									:aria-label="c.is_archived === 1 ? 'Restore' : 'Archive'"
									:disabled="busy"
									@click="toggleArchive(c)"
								/>
								<UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Delete" :disabled="busy" @click="removeCategory(c)" />
							</template>
						</li>
					</ul>
				</div>
			</UCard>

			<!-- Pre-printed letterhead -->
			<UCard id="preprinted" class="scroll-mt-6">
				<template #header>
					<div class="font-medium">
						Pre-printed letterhead paper
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						When a letter is set to print on pre-printed stationery, this much
						blank space is reserved at the top and bottom of the page so the
						letter body clears your physical letterhead + footer. Only affects
						letters with the "pre-printed" toggle on.
					</div>
				</template>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
					<div class="space-y-4">
						<UFormField label="Top margin (mm)" help="Clears your printed letterhead header. Typically 40–60mm.">
							<UInputNumber v-model="topMarginMm" :min="0" :max="150" :step="1" class="w-40" />
						</UFormField>
						<UFormField label="Bottom margin (mm)" help="Clears a printed footer band, if any. Typically 15–30mm.">
							<UInputNumber v-model="bottomMarginMm" :min="0" :max="150" :step="1" class="w-40" />
						</UFormField>
					</div>

					<!-- A4 preview: shaded bands = reserved space, clear middle = writable. -->
					<div class="flex flex-col items-center">
						<div
							class="relative bg-white border border-(--ui-border) rounded-sm shadow-sm overflow-hidden"
							:style="{ width: `${PAGE_W}px`, height: `${PAGE_H}px` }"
						>
							<div
								class="absolute inset-x-0 top-0 bg-(--ui-primary)/15 border-b border-dashed border-(--ui-primary)/50 flex items-center justify-center"
								:style="{ height: `${topBandPx}px` }"
							>
								<span class="text-[9px] font-medium text-(--ui-primary) tabular-nums">{{ topMarginMm }}mm</span>
							</div>
							<div class="absolute inset-x-3 flex flex-col gap-1.5" :style="{ top: `${topBandPx + 8}px` }">
								<div v-for="n in 6" :key="n" class="h-px bg-gray-300" :style="{ width: n === 6 ? '55%' : '100%' }" />
							</div>
							<div
								class="absolute inset-x-0 bottom-0 bg-(--ui-primary)/15 border-t border-dashed border-(--ui-primary)/50 flex items-center justify-center"
								:style="{ height: `${bottomBandPx}px` }"
							>
								<span class="text-[9px] font-medium text-(--ui-primary) tabular-nums">{{ bottomMarginMm }}mm</span>
							</div>
						</div>
						<p class="text-[11px] text-(--ui-text-muted) mt-2 text-center max-w-[180px]">
							A4 preview — shaded bands are reserved for your pre-printed stationery.
						</p>
					</div>
				</div>

				<template #footer>
					<div class="flex justify-end gap-2">
						<UButton color="neutral" variant="outline" :disabled="!marginDirty || saving" @click="resetMargin">
							Reset
						</UButton>
						<UButton :disabled="!marginDirty || saving" :loading="saving" @click="saveMargin">
							Save
						</UButton>
					</div>
				</template>
			</UCard>

			<!-- Letterhead templates (future) -->
			<UCard id="templates" class="scroll-mt-6">
				<template #header>
					<div class="flex items-center justify-between">
						<div class="font-medium">
							Letterhead templates
						</div>
						<UBadge size="xs" color="neutral" variant="subtle">
							Coming soon
						</UBadge>
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Save reusable letterhead layouts (logo placement, fonts, footer) and
						pick one per letter. Planned for a future update.
					</div>
				</template>

				<div class="text-sm text-(--ui-text-muted) py-2 flex items-center gap-2">
					<UIcon name="i-lucide-layout-template" class="size-4" />
					Not available yet — letters currently use your PDF header logo + footer.
				</div>
			</UCard>
		</div>
	</div>
</template>

<script setup lang="ts">
// Per-business Letters settings: managed category list (immediate persistence),
// the pre-printed top margin (saved onto company_settings), and a placeholder
// for future letterhead templates.
	import type { LetterCategoryRow } from "~/stores/letter_categories";
	import { useLetterCategoriesStore } from "~/stores/letter_categories";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Letters" });

	const catStore = useLetterCategoriesStore();
	const settings = useSettingsStore();
	const toast = useToast();

	await Promise.all([catStore.load(), settings.ensureLoaded()]);

	const busy = ref(false);
	const newName = ref("");
	const editingId = ref<number | null>(null);
	const editName = ref("");

	const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

	const addCategory = async () => {
		const name = newName.value.trim();
		if (!name || busy.value) return;
		busy.value = true;
		try {
			await catStore.create(name);
			newName.value = "";
		} catch (err) {
			toast.add({ title: "Could not add category", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			busy.value = false;
		}
	};

	const startRename = (c: LetterCategoryRow) => {
		editingId.value = c.id;
		editName.value = c.name;
	};

	const saveRename = async (id: number) => {
		const name = editName.value.trim();
		if (!name || busy.value) return;
		busy.value = true;
		try {
			await catStore.rename(id, name);
			editingId.value = null;
		} catch (err) {
			toast.add({ title: "Could not rename", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			busy.value = false;
		}
	};

	const toggleArchive = async (c: LetterCategoryRow) => {
		busy.value = true;
		try {
			await catStore.setArchived(c.id, c.is_archived === 0);
		} catch (err) {
			toast.add({ title: "Could not update", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			busy.value = false;
		}
	};

	const removeCategory = async (c: LetterCategoryRow) => {
		busy.value = true;
		try {
			await catStore.remove(c.id);
			toast.add({ title: `Deleted “${c.name}”`, color: "success", icon: "i-lucide-trash-2" });
		} catch (err) {
			toast.add({ title: "Could not delete", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			busy.value = false;
		}
	};

	// --- pre-printed top / bottom margins ---------------------------------
	const DEFAULT_TOP = 55;
	const DEFAULT_BOTTOM = 20;
	const topMarginMm = ref<number>(settings.settings?.letter_preprinted_top_margin_mm ?? DEFAULT_TOP);
	const bottomMarginMm = ref<number>(settings.settings?.letter_preprinted_bottom_margin_mm ?? DEFAULT_BOTTOM);
	const saving = ref(false);
	const marginDirty = computed(() =>
		topMarginMm.value !== (settings.settings?.letter_preprinted_top_margin_mm ?? DEFAULT_TOP)
		|| bottomMarginMm.value !== (settings.settings?.letter_preprinted_bottom_margin_mm ?? DEFAULT_BOTTOM)
	);

	// A4 preview geometry. Page is 210×297mm; the box is PAGE_W wide and scaled
	// to A4 aspect. The reserved bands are the margins scaled by the same
	// mm→px factor (clamped so an extreme value can't overflow the page box).
	const PAGE_W = 150;
	const PAGE_H = Math.round(PAGE_W * 297 / 210);
	const MM_TO_PX = PAGE_H / 297;
	const clampBand = (mm: number) => Math.max(0, Math.min(PAGE_H * 0.45, mm * MM_TO_PX));
	const topBandPx = computed(() => Math.round(clampBand(topMarginMm.value || 0)));
	const bottomBandPx = computed(() => Math.round(clampBand(bottomMarginMm.value || 0)));

	const resetMargin = () => {
		topMarginMm.value = settings.settings?.letter_preprinted_top_margin_mm ?? DEFAULT_TOP;
		bottomMarginMm.value = settings.settings?.letter_preprinted_bottom_margin_mm ?? DEFAULT_BOTTOM;
	};

	const saveMargin = async () => {
		if (saving.value) return;
		saving.value = true;
		try {
			await settings.save({
				letter_preprinted_top_margin_mm: topMarginMm.value,
				letter_preprinted_bottom_margin_mm: bottomMarginMm.value
			});
			toast.add({ title: "Saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Could not save", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		} finally {
			saving.value = false;
		}
	};
</script>
