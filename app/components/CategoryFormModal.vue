<template>
	<UModal v-model:open="openModel" :title="editing ? 'Edit category' : 'New category'">
		<template #body>
			<div class="space-y-4">
				<UFormField label="Name" required>
					<UInput v-model="name" placeholder="e.g. Utilities" autofocus />
				</UFormField>

				<UFormField label="Color">
					<div class="flex flex-wrap gap-2">
						<button
							v-for="c in THEME_COLORS"
							:key="c.value"
							type="button"
							:title="c.label"
							class="size-8 rounded-md border-2 transition"
							:class="color === c.value ? 'border-(--ui-text)' : 'border-transparent hover:border-(--ui-border)'"
							:style="{ backgroundColor: c.hex }"
							@click="color = c.value"
						/>
					</div>
				</UFormField>

				<UFormField label="Icon">
					<div class="grid grid-cols-8 gap-2">
						<button
							v-for="i in ICON_CHOICES"
							:key="i"
							type="button"
							class="size-8 rounded-md border flex items-center justify-center transition"
							:class="icon === i ? 'border-(--ui-primary) bg-(--ui-primary)/10 text-(--ui-primary)' : 'border-(--ui-border) hover:bg-(--ui-bg-muted)'"
							@click="icon = i"
						>
							<UIcon :name="i" class="size-4" />
						</button>
					</div>
				</UFormField>

				<div class="rounded-md border border-(--ui-border) bg-(--ui-bg-muted) px-3 py-2 flex items-center gap-2 text-sm">
					<span
						class="inline-flex size-6 rounded items-center justify-center text-white"
						:style="{ backgroundColor: previewHex }"
					>
						<UIcon :name="icon" class="size-3.5" />
					</span>
					<span class="font-medium">{{ name || "Preview" }}</span>
				</div>
			</div>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2 w-full">
				<UButton color="neutral" variant="outline" @click="cancel">
					Cancel
				</UButton>
				<UButton :loading="saving" :disabled="!canSave" @click="submit">
					{{ editing ? "Save" : "Create" }}
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
	import type { BillCategoryRow } from "~/stores/bill_categories";
	import { THEME_COLORS, themeHex } from "~/lib/theme";
	import { useBillCategoriesStore } from "~/stores/bill_categories";

	// Reusable create/edit modal for bill categories. The bill page opens this
	// inline (no full-page navigation) so the user stays in flow when adding a
	// new category mid-bill. The /categories list page uses it too.

	interface Props {
		open: boolean
		// Pass an existing row to edit it; omit to create a new one.
		category?: BillCategoryRow | null
	}
	const props = withDefaults(defineProps<Props>(), { category: null });
	const emit = defineEmits<{
		"update:open": [v: boolean]
		// Emitted on successful save with the affected row id.
		saved: [id: number]
	}>();

	const store = useBillCategoriesStore();
	const toast = useToast();

	const ICON_CHOICES = [
		"i-lucide-tag",
		"i-lucide-zap",
		"i-lucide-building-2",
		"i-lucide-home",
		"i-lucide-package",
		"i-lucide-truck",
		"i-lucide-car",
		"i-lucide-wrench",
		"i-lucide-briefcase",
		"i-lucide-laptop",
		"i-lucide-phone",
		"i-lucide-printer",
		"i-lucide-shopping-cart",
		"i-lucide-utensils",
		"i-lucide-graduation-cap",
		"i-lucide-shield"
	] as const;

	const openModel = computed({
		get: () => props.open,
		set: (v: boolean) => emit("update:open", v)
	});

	const editing = computed(() => props.category !== null);

	const name = ref("");
	const color = ref<string>("blue");
	const icon = ref<string>("i-lucide-tag");
	const saving = ref(false);

	const previewHex = computed(() => themeHex(color.value));
	const canSave = computed(() => name.value.trim().length > 0);

	// Reset / hydrate the form whenever the modal opens.
	watch(() => props.open, (isOpen) => {
		if (!isOpen) return;
		if (props.category) {
			name.value = props.category.name;
			color.value = props.category.color;
			icon.value = props.category.icon;
		} else {
			name.value = "";
			color.value = "blue";
			icon.value = "i-lucide-tag";
		}
	});

	const cancel = () => {
		emit("update:open", false);
	};

	const submit = async () => {
		if (!canSave.value) return;
		saving.value = true;
		try {
			let id: number;
			if (props.category) {
				id = props.category.id;
				await store.update(id, { name: name.value.trim(), color: color.value, icon: icon.value });
			} else {
				id = await store.create({ name: name.value.trim(), color: color.value, icon: icon.value });
			}
			emit("saved", id);
			emit("update:open", false);
			toast.add({
				title: editing.value ? "Category updated" : "Category created",
				color: "success",
				icon: "i-lucide-check"
			});
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
</script>
