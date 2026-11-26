<template>
	<div class="select-none">
		<header class="mb-6 max-w-2xl mx-auto">
			<h1 class="text-2xl font-semibold">
				Letters
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Manage the categories you tag letters with, and (soon) reusable
				letterhead templates.
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

			<!-- Pre-printed paper: the margins live with the Stationery now -->
			<UCard id="preprinted" class="scroll-mt-6">
				<template #header>
					<div class="font-medium">
						Pre-printed paper
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-1">
						A letter set to "Pre-printed paper" reserves your business's
						pre-printed paper margins — the same ones every document uses on
						that stationery, set once in PDF settings.
					</div>
				</template>

				<UButton to="/settings/pdf#stationery" color="neutral" variant="outline" icon="i-lucide-stamp" trailing-icon="i-lucide-arrow-right">
					Open PDF stationery
				</UButton>
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
// a pointer to the Pre-printed paper margins (they live on the Stationery, in
// PDF settings), and a placeholder for future letterhead templates.
	import type { LetterCategoryRow } from "~/stores/letter_categories";
	import { useLetterCategoriesStore } from "~/stores/letter_categories";

	definePageMeta({ title: "Letters" });

	const catStore = useLetterCategoriesStore();
	const toast = useToast();

	await catStore.load();

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
</script>
