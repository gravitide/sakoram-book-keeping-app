<template>
	<div>
		<UPopover v-model:open="open" :ui="{ content: 'w-(--reka-popper-anchor-width)' }">
			<UButton
				color="neutral"
				variant="outline"
				class="w-full justify-between"
				:disabled="disabled"
				trailing-icon="i-lucide-chevrons-up-down"
			>
				<span v-if="selected" class="truncate">{{ selected.full_name }}</span>
				<span v-else class="text-(--ui-text-muted)">Select an employee…</span>
			</UButton>
			<template #content>
				<div class="p-2 border-b border-(--ui-border)">
					<UInput
						v-model="search"
						placeholder="Search employees…"
						icon="i-lucide-search"
						autofocus
					/>
				</div>
				<div class="max-h-72 overflow-auto">
					<div v-if="items.length === 0" class="p-4 text-sm text-(--ui-text-muted) text-center">
						<div v-if="store.employees.length === 0">
							No employees yet.
						</div>
						<div v-else>
							No matches.
						</div>
					</div>
					<button
						v-for="e in items"
						:key="e.id"
						type="button"
						class="block w-full text-left px-3 py-2 hover:bg-(--ui-bg-muted) text-sm"
						:class="{ 'bg-(--ui-primary)/10 text-(--ui-primary)': e.id === modelValue }"
						@click="select(e)"
					>
						<div class="font-medium">
							{{ e.full_name }}
						</div>
						<div v-if="e.designation || e.nic" class="text-xs text-(--ui-text-muted) truncate">
							{{ [e.designation, e.nic].filter(Boolean).join(" · ") }}
						</div>
					</button>
				</div>
				<div class="p-2 border-t border-(--ui-border) flex justify-between">
					<NuxtLink to="/employees/new" class="text-xs text-(--ui-primary) hover:underline">
						+ New employee
					</NuxtLink>
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
	import type { EmployeeRow } from "~/stores/employees";
	import { useEmployeesStore } from "~/stores/employees";

	interface Props {
		modelValue: number | null
		disabled?: boolean
		required?: boolean
	}
	const props = withDefaults(defineProps<Props>(), { disabled: false, required: false });
	const emit = defineEmits<{
		"update:modelValue": [value: number | null]
		select: [employee: EmployeeRow]
	}>();

	const store = useEmployeesStore();
	onMounted(async () => {
		if (store.employees.length === 0) await store.load();
	});

	const open = ref(false);
	const search = ref("");

	const items = computed(() => {
		const q = search.value.trim().toLowerCase();
		const active = store.employees.filter((e) => e.is_archived === 0);
		if (!q) return active;
		return active.filter((e) =>
			e.full_name.toLowerCase().includes(q)
			|| (e.designation ?? "").toLowerCase().includes(q)
			|| (e.nic ?? "").toLowerCase().includes(q)
		);
	});

	const selected = computed(() => store.employees.find((e) => e.id === props.modelValue) ?? null);

	const select = (e: EmployeeRow) => {
		emit("update:modelValue", e.id);
		emit("select", e);
		open.value = false;
		search.value = "";
	};

	const clear = () => {
		emit("update:modelValue", null);
	};
</script>
