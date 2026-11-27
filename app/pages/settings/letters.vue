<template>
	<div class="select-none">
		<header class="mb-6 max-w-2xl mx-auto">
			<h1 class="text-2xl font-semibold">
				Letters
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Manage the categories you tag letters with, and find where the
				Stationery your letters print on is set.
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

			<!-- Pre-printed paper: the business-wide bands, edited here in the
				Stationery editor (they're the same bands the Pre-printed paper
				Stationery uses, so either place edits one setting). -->
			<UCard id="preprinted" class="scroll-mt-6">
				<template #header>
					<div class="font-medium">
						Pre-printed paper
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						A letter set to "Pre-printed paper" prints onto paper that already
						carries your letterhead, so it leaves blank bands at the top and
						bottom for it — whatever Stationery your other documents use. Set
						how deep those bands are here.
					</div>
				</template>

				<div class="flex flex-wrap items-center gap-3">
					<UButton icon="i-lucide-pencil-ruler" :disabled="!settingsStore.settings" @click="openBands">
						Adjust pre-printed paper
					</UButton>
					<span class="text-xs text-(--ui-text-muted) tabular-nums">
						Top {{ formatMm(storedBands.top) }} mm · bottom {{ formatMm(storedBands.bottom) }} mm · {{ paperLabel }}
					</span>
				</div>
				<p class="text-xs text-(--ui-text-muted) mt-3">
					Paper size and the rest of your Stationery are in
					<NuxtLink to="/settings/pdf#stationery" class="text-(--ui-primary) hover:underline">
						PDF settings
					</NuxtLink>.
				</p>
			</UCard>

			<!-- Stationery artwork: a pointer — letters set to "use stationery" print on the business Stationery -->
			<UCard id="artwork" class="scroll-mt-6">
				<template #header>
					<div class="font-medium">
						Stationery artwork
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						Letters set to "use stationery" print on your business Stationery,
						like every other document — including a full-page background or
						separate header and footer images.
					</div>
				</template>

				<p class="text-sm text-(--ui-text-muted) py-2 flex items-center gap-2">
					<UIcon name="i-lucide-image" class="size-4" />
					<span>
						Upload and place your artwork in
						<NuxtLink to="/settings/pdf#stationery" class="text-(--ui-primary) hover:underline">
							PDF settings
						</NuxtLink>.
					</span>
				</p>
			</UCard>
		</div>

		<StationeryEditorModal
			v-model:open="bandsOpen"
			v-model:margins="bandsDraft"
			mode="preprinted"
			:paper="paperKey"
			:settings="settingsStore.settings"
			@applied="saveBands"
		/>
	</div>
</template>

<script setup lang="ts">
// Per-business Letters settings: managed category list (immediate persistence),
// the Pre-printed paper bands a pre-printed letter reserves (opened in the
// Stationery editor and saved straight away — they're the business-wide bands
// in company_settings.pdf_stationery, shared with the Pre-printed paper
// Stationery on /settings/pdf), and a pointer to the Stationery artwork there.
	import type { StationeryMarginsMm } from "~/lib/stationery";
	import type { LetterCategoryRow } from "~/stores/letter_categories";
	import { resolvePaperSize } from "~/lib/page-settings";
	import { parseStationery, setPreprintedMargins } from "~/lib/stationery";
	import { formatMm } from "~/lib/stationery-geometry";
	import { useLetterCategoriesStore } from "~/stores/letter_categories";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Letters" });

	const catStore = useLetterCategoriesStore();
	const settingsStore = useSettingsStore();
	const toast = useToast();

	await Promise.all([catStore.load(), settingsStore.ensureLoaded()]);

	const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

	// ---- Pre-printed paper bands --------------------------------------
	const storedBands = computed(() => parseStationery(settingsStore.settings?.pdf_stationery).preprinted);
	const paperKey = computed(() => resolvePaperSize(settingsStore.settings?.pdf_paper_size).key);
	const paperLabel = computed(() => resolvePaperSize(paperKey.value).label);
	const bandsOpen = ref(false);
	// The editor drafts on its own and hands the bands back on Apply; seeded
	// from the saved settings every time it opens (kept-alive page).
	const bandsDraft = ref<StationeryMarginsMm>({ ...storedBands.value });
	watch(bandsOpen, (open) => {
		if (open) bandsDraft.value = { ...storedBands.value };
	}, { flush: "sync" });
	const openBands = () => {
		bandsOpen.value = true;
	};
	onDeactivated(() => {
		bandsOpen.value = false;
	});

	const saveBands = async () => {
		try {
			await settingsStore.save({ pdf_stationery: setPreprintedMargins(settingsStore.settings?.pdf_stationery, { ...bandsDraft.value }) });
			toast.add({ title: "Pre-printed paper bands saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({ title: "Could not save the bands", description: msg(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	const busy = ref(false);
	const newName = ref("");
	const editingId = ref<number | null>(null);
	const editName = ref("");

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
</script>
