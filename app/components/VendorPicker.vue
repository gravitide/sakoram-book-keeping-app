<template>
	<div>
		<!-- Popover width: at least 288px, but matches the trigger when
			the trigger is wider. The default `w-(--reka-popper-anchor-width)`
			alone left the popover ~210px wide on detail-page columns,
			cramping long vendor names. -->
		<UPopover v-model:open="open" :ui="{ content: 'min-w-72 w-(--reka-popper-anchor-width)' }">
			<UButton
				color="neutral"
				variant="outline"
				class="w-full justify-between"
				:disabled="disabled"
				trailing-icon="i-lucide-chevrons-up-down"
			>
				<span v-if="selected" class="truncate">{{ selected.name }}</span>
				<span v-else class="text-(--ui-text-muted)">Select a vendor…</span>
			</UButton>
			<template #content>
				<div class="p-2 border-b border-(--ui-border)">
					<UInput
						v-model="search"
						placeholder="Search vendors…"
						icon="i-lucide-search"
						autofocus
					/>
				</div>
				<div class="max-h-72 overflow-auto">
					<div v-if="items.length === 0" class="p-4 text-sm text-(--ui-text-muted) text-center">
						<div v-if="store.vendors.length === 0">
							No vendors yet.
						</div>
						<div v-else>
							No matches.
						</div>
					</div>
					<button
						v-for="v in items"
						:key="v.id"
						type="button"
						class="block w-full text-left px-3 py-2 hover:bg-(--ui-bg-muted) text-sm"
						:class="{ 'bg-(--ui-primary)/10 text-(--ui-primary)': v.id === modelValue }"
						@click="select(v)"
					>
						<div class="font-medium">
							{{ v.name }}
						</div>
						<div v-if="v.contact_person || v.email" class="text-xs text-(--ui-text-muted) truncate">
							{{ [v.contact_person, v.email].filter(Boolean).join(" · ") }}
						</div>
					</button>
				</div>
				<div class="p-2 border-t border-(--ui-border) flex justify-between">
					<button
						type="button"
						class="text-xs text-(--ui-primary) hover:underline"
						@click="createNew"
					>
						+ New vendor
					</button>
					<button
						v-if="modelValue !== null && !required"
						type="button"
						class="text-xs text-(--ui-text-muted) hover:text-(--ui-error)"
						@click="clear"
					>
						Clear
					</button>
				</div>
			</template>
		</UPopover>
	</div>
</template>

<script setup lang="ts">
	import type { VendorRow } from "~/stores/vendors";
	import { useVendorsStore } from "~/stores/vendors";

	// v-model = vendor_id (number) or null when nothing selected.

	interface Props {
		modelValue: number | null
		disabled?: boolean
		required?: boolean
	}
	const props = withDefaults(defineProps<Props>(), { disabled: false, required: false });
	const emit = defineEmits<{
		"update:modelValue": [value: number | null]
		select: [vendor: VendorRow]
		createNew: []
	}>();

	const store = useVendorsStore();
	onMounted(async () => {
		if (store.vendors.length === 0) await store.load();
	});

	const open = ref(false);
	const search = ref("");

	const items = computed(() => {
		const q = search.value.trim().toLowerCase();
		const active = store.vendors.filter((v) => v.is_archived === 0);
		if (!q) return active;
		return active.filter((v) =>
			v.name.toLowerCase().includes(q)
			|| (v.email ?? "").toLowerCase().includes(q)
			|| (v.contact_person ?? "").toLowerCase().includes(q)
		);
	});

	const selected = computed(() => store.vendors.find((v) => v.id === props.modelValue) ?? null);

	const select = (v: VendorRow) => {
		emit("update:modelValue", v.id);
		emit("select", v);
		open.value = false;
		search.value = "";
	};

	const clear = () => {
		emit("update:modelValue", null);
	};

	// "+ New vendor" — close the popover, ask the host modal to close (so the
	// dialog dismisses cleanly), then navigate. Without closing the modal
	// first it stays stuck over the new-vendor page.
	const createNew = async () => {
		open.value = false;
		emit("createNew");
		await nextTick();
		await navigateTo("/vendors/new");
	};
</script>
