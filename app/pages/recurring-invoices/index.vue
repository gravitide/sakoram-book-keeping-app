<template>
	<div class="select-none">
		<FeatureLock v-if="locked" title="Recurring invoices" tier-label="Plus" feature="recurring" />
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold flex items-center gap-3">
					Recurring invoices
					<HelpButton slug="recurring-invoices" />
					<UIcon
						v-if="isLoading"
						name="i-lucide-loader-circle"
						class="size-4 animate-spin text-(--ui-primary)"
					/>
				</h1>
				<p class="text-sm text-(--ui-text-muted) tabular-nums">
					<span v-if="isLoading">Loading…</span>
					<template v-else>
						{{ store.templates.length }} template{{ store.templates.length === 1 ? "" : "s" }} ·
						<span v-if="store.pendingCount > 0" class="text-(--ui-warning) font-medium">
							{{ store.pendingCount }} ready to generate
						</span>
						<span v-else>nothing pending</span>
					</template>
				</p>
			</div>
			<div class="flex items-center gap-2">
				<!-- Pending count + click-to-generate is the most-used flow.
					Disabled-but-visible when nothing's pending so the button
					stays in muscle memory (rather than appearing/disappearing
					and confusing the user). -->
				<UButton
					v-if="!locked"
					color="primary"
					variant="soft"
					icon="i-lucide-play"
					:disabled="store.pendingCount === 0"
					@click="openGenerate"
				>
					Generate pending<span v-if="store.pendingCount > 0"> ({{ store.pendingCount }})</span>
				</UButton>
				<UButton v-if="!locked" icon="i-lucide-plus" @click="newTemplate">
					New recurring
				</UButton>
			</div>
		</header>

		<ListPageSkeleton v-if="isLoading" :chip-count="6" :column-count="6" />

		<UCard v-else>
			<template #header>
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by template, client, or project…"
							icon="i-lucide-search"
							size="md"
							class="flex-1 min-w-64"
						/>
						<USelectMenu
							v-model="store.clientFilter"
							:items="clientOptions"
							value-key="value"
							label-key="label"
							icon="i-lucide-users"
							class="w-56"
							:search-input="{ placeholder: 'Filter clients…' }"
						/>
						<UButton
							v-if="hasAnyFilter"
							size="md"
							variant="soft"
							color="neutral"
							icon="i-lucide-x"
							class="ml-auto"
							@click="resetFilters"
						>
							Reset
						</UButton>
					</div>

					<!-- Two filter axes share a row at md+: status (active /
						paused) on the left, frequency on the right. Stacks
						at sm. -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
						<div class="flex items-center gap-1.5 flex-wrap">
							<UIcon name="i-lucide-flag" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
							<button
								v-for="s in STATUSES"
								:key="s"
								type="button"
								class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
								:class="statusChipClasses(s)"
								@click="store.toggleStatusFilter(s)"
							>
								{{ STATUS_LABEL[s] }}
							</button>
						</div>
						<div class="flex items-center gap-1.5 flex-wrap">
							<UIcon name="i-lucide-repeat" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
							<span class="text-xs text-(--ui-text-muted) mr-1">Frequency:</span>
							<button
								v-for="f in FREQUENCIES"
								:key="f"
								type="button"
								class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
								:class="frequencyChipClasses(f)"
								@click="store.toggleFrequencyFilter(f)"
							>
								{{ FREQUENCY_LABEL[f] }}
							</button>
						</div>
					</div>
				</div>
			</template>

			<!-- Action bar only matters when there's a table to act on.
				Hidden during load / error / empty states — no point
				showing 'Auto-fit columns' for a table that isn't
				rendered. -->
			<div
				v-if="!store.loading && !store.error && store.filtered.length > 0"
				class="flex justify-between items-center gap-3 flex-wrap text-sm text-(--ui-text-muted) tabular-nums mb-3"
			>
				<UButton
					size="xs"
					variant="soft"
					color="neutral"
					icon="i-lucide-table-columns-split"
					title="Auto-size columns to their content"
					@click="autoFitColumns"
				>
					Auto-fit columns
				</UButton>
				<div class="flex items-center gap-3 ml-auto">
					<span v-if="hasAnyFilter" class="text-xs text-(--ui-text-muted)">{{ store.filtered.length }} of {{ store.templates.length }} shown</span>
				</div>
			</div>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading templates…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-repeat" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.templates.length === 0">
					No recurring invoice templates yet. Click <span class="font-medium">New recurring</span> to set one up.
				</div>
				<div v-else>
					No templates match your filters.
				</div>
			</div>

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="rows"
				state-key="recurring-invoices-table"
				:row-actions="itemsFor"
				default-sort-field="next_issue_date"
				:default-sort-order="1"
				@row-click="(row) => router.push(`/recurring-invoices/${row.id}`)"
			>
				<Column field="template_name" header="Template" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium">
							{{ data.template_name }}
						</div>
					</template>
				</Column>
				<Column field="client_name" header="Client" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data.client_name || "—" }}
						</div>
					</template>
				</Column>
				<Column field="frequency" header="Frequency" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ FREQUENCY_LABEL[data.frequency as RecurringFrequency] }}
						</div>
					</template>
				</Column>
				<Column field="next_issue_date" header="Next issue" sortable>
					<template #body="{ data }">
						<div
							class="truncate tabular-nums"
							:class="data._pending
								? 'text-(--ui-warning) font-medium'
								: 'text-(--ui-text-muted)'"
						>
							{{ data.next_issue_date }}
						</div>
					</template>
				</Column>
				<Column field="_status" header="Status" sortable>
					<template #body="{ data }">
						<StatusBadge :status="data._status" />
					</template>
				</Column>
				<Column
					field="invoices_generated"
					header="# generated"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div class="text-right tabular-nums">
							<span v-if="data.invoices_generated === 0" class="text-(--ui-text-muted)">—</span>
							<span v-else>{{ data.invoices_generated }}</span>
						</div>
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>

		<NewRecurringInvoiceModal v-model:open="newOpen" />
		<RecurringGenerateModal v-model:open="generateOpen" />

		<UModal v-model:open="deleteOpen" :title="`Delete ${pendingDelete?.template_name ?? 'template'}?`">
			<template #body>
				<p class="text-sm">
					This removes the recurring template. Already-generated invoices stay intact —
					they're real documents in your books, independent of the template.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="deleteOpen = false">
						Cancel
					</UButton>
					<UButton color="error" icon="i-lucide-trash-2" @click="confirmDelete">
						Delete template
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
	import type { RecurringFrequency, RecurringInvoiceRow } from "~/stores/recurring_invoices";
	import { useClientsStore } from "~/stores/clients";
	import { useLicenseStore } from "~/stores/license";
	import { useRecurringInvoicesStore } from "~/stores/recurring_invoices";

	definePageMeta({ title: "Recurring invoices" });

	const router = useRouter();
	const toast = useToast();
	const store = useRecurringInvoicesStore();
	const clientsStore = useClientsStore();
	const license = useLicenseStore();
	const locked = computed(() => !license.hasFeature("recurring"));

	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			store.ensureLoaded(),
			clientsStore.ensureLoaded()
		]);
	}));

	type StatusKey = "active" | "paused";
	const STATUSES: StatusKey[] = ["active", "paused"];
	const STATUS_LABEL: Record<StatusKey, string> = {
		active: "Active",
		paused: "Paused"
	};
	const FREQUENCIES: RecurringFrequency[] = ["weekly", "monthly", "quarterly", "yearly"];
	const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
		weekly: "Weekly",
		monthly: "Monthly",
		quarterly: "Quarterly",
		yearly: "Yearly"
	};

	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const statusChipClasses = (s: StatusKey): string => {
		if (!store.statusFilters.includes(s)) return inactiveChip;
		return s === "active"
			? "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)"
			: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text-muted)";
	};
	const frequencyChipClasses = (f: RecurringFrequency): string =>
		store.frequencyFilters.includes(f)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: inactiveChip;

	const clientOptions = computed<{ label: string, value: number | "all" }[]>(() => [
		{ label: "All clients", value: "all" },
		...[...clientsStore.clients]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((c) => ({ label: c.name, value: c.id }))
	]);

	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.statusFilters.length > 0
		|| store.frequencyFilters.length > 0
		|| store.clientFilter !== "all"
	);
	const resetFilters = () => {
		store.search = "";
		store.clearStatusFilters();
		store.clearFrequencyFilters();
		store.clientFilter = "all";
	};

	// View-model wrapping each row with the synthetic `_status` and
	// `_pending` flags so PrimeVue's by-field sort agrees with the
	// rendered cell.
	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};
	interface RecurringRowVM extends RecurringInvoiceRow {
		_status: StatusKey
		_pending: boolean
	}
	const rows = computed<RecurringRowVM[]>(() => {
		const today = todayISO();
		return store.filtered.map((t) => {
			const isPaused = t.is_paused === 1;
			const isPending = !isPaused
				&& t.next_issue_date <= today
				&& (t.end_date === null || t.next_issue_date <= t.end_date);
			return {
				...t,
				_status: isPaused ? "paused" : "active",
				_pending: isPending
			};
		});
	});

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	const newOpen = ref(false);
	const newTemplate = () => {
		newOpen.value = true;
	};
	const generateOpen = ref(false);
	const openGenerate = () => {
		if (store.pendingCount === 0) return;
		generateOpen.value = true;
	};

	const route = useRoute();
	onMounted(() => {
		if (route.query.new === "1") {
			newOpen.value = true;
			void router.replace({ query: { ...route.query, new: undefined } });
		}
	});

	// Row-action handlers. Function declarations so they hoist above
	// itemsFor() — eslint's no-use-before-define catches the
	// alternative arrow-fn order.
	async function onTogglePause(t: RecurringInvoiceRow) {
		try {
			await store.togglePause(t.id);
			toast.add({
				title: t.is_paused === 1 ? `Resumed ${t.template_name}` : `Paused ${t.template_name}`,
				color: "info",
				icon: t.is_paused === 1 ? "i-lucide-play" : "i-lucide-pause"
			});
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	}

	async function onGenerateOne(t: RecurringInvoiceRow) {
		try {
			const invoiceId = await store.generateOne(t.id);
			toast.add({
				title: `Generated draft invoice from ${t.template_name}`,
				description: "Review and mark sent on the invoices page.",
				color: "success",
				icon: "i-lucide-check"
			});
			void router.push(`/invoices/${invoiceId}`);
		} catch (err) {
			toast.add({
				title: "Could not generate",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	}

	// Delete uses a confirmation UModal (not native confirm()) — same
	// pattern the credit-notes detail page uses. Templates have no
	// immutability rules (already-generated invoices stay intact since
	// they're real rows independent of the template), so a typed-name
	// guard would be over-engineered here.
	const deleteOpen = ref(false);
	const pendingDelete = ref<RecurringInvoiceRow | null>(null);
	function onDelete(t: RecurringInvoiceRow) {
		pendingDelete.value = t;
		deleteOpen.value = true;
	}
	async function confirmDelete() {
		const t = pendingDelete.value;
		if (!t) return;
		deleteOpen.value = false;
		try {
			await store.remove(t.id);
			toast.add({ title: "Template deleted", color: "info", icon: "i-lucide-trash-2" });
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			pendingDelete.value = null;
		}
	}

	// Row actions — Edit / Pause-Resume / Generate now / Delete.
	function itemsFor(t: RecurringInvoiceRow) {
		const primary = [
			{
				label: "Edit",
				icon: "i-lucide-pencil",
				onSelect: () => router.push(`/recurring-invoices/${t.id}`)
			},
			{
				label: t.is_paused === 1 ? "Resume" : "Pause",
				icon: t.is_paused === 1 ? "i-lucide-play" : "i-lucide-pause",
				onSelect: () => {
					void onTogglePause(t);
				}
			}
		];
		// "Generate now" only when the template is active. Paused
		// templates have to be resumed first — keeps the user's
		// intent explicit (they specifically paused this for a reason).
		if (t.is_paused === 0) {
			primary.push({
				label: "Generate now",
				icon: "i-lucide-play",
				onSelect: () => {
					void onGenerateOne(t);
				}
			});
		}
		const destructive = [{
			label: "Delete",
			icon: "i-lucide-trash-2",
			onSelect: () => {
				onDelete(t);
			}
		}];
		return [primary, destructive];
	}
</script>
