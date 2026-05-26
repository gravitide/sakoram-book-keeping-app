<template>
	<div class="select-none">
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold flex items-center gap-3">
					Credit notes
					<UIcon
						v-if="isLoading"
						name="i-lucide-loader-circle"
						class="size-4 animate-spin text-(--ui-primary)"
					/>
				</h1>
				<p class="text-sm text-(--ui-text-muted) tabular-nums">
					<span v-if="isLoading">Loading…</span>
					<template v-else>
						{{ store.creditNotes.length }} total · {{ formatLKR(store.totalIssuedCents) }} issued
					</template>
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newCreditNote">
				New credit note
			</UButton>
		</header>

		<ListPageSkeleton v-if="isLoading" :chip-count="3" :column-count="5" />

		<UCard v-else>
			<template #header>
				<!-- Filter strip — search + client filter + status chips.
					No Advanced popover yet (credit notes don't have a
					due_date, so the only date-range axis is issue_date —
					inline DateRangeField is enough). -->
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by number, project, or client…"
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

					<!-- Status chips — the only filter axis below the search
						row. Matches StatusBadge colours for visual continuity. -->
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
				</div>
			</template>

			<!-- Table action bar — Auto-fit on the left, filtered total on
				the right. Same shape as the other list pages. -->
			<div
				v-if="!store.loading && !store.error"
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
					<span v-if="hasAnyFilter" class="text-xs text-(--ui-text-muted)">{{ store.filtered.length }} of {{ store.creditNotes.length }} shown</span>
					<StatChip label="Total" :value="formatLKR(filteredTotal)" />
				</div>
			</div>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading credit notes…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-rotate-ccw" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.creditNotes.length === 0">
					No credit notes yet. Click <span class="font-medium">New credit note</span> to start.
				</div>
				<div v-else>
					No credit notes match your filters.
				</div>
			</div>

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="store.filtered"
				state-key="credit-notes-table"
				default-sort-field="issue_date"
				:default-sort-order="-1"
				@row-click="(row) => router.push(`/credit-notes/${row.id}`)"
			>
				<Column field="number" header="Number" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium tabular-nums">
							{{ data.number }}
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
				<Column field="project_title" header="Project" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.project_title || "—" }}
						</div>
					</template>
				</Column>
				<Column field="issue_date" header="Issued" sortable>
					<template #body="{ data }">
						<div class="text-(--ui-text-muted) tabular-nums whitespace-nowrap">
							{{ data.issue_date }}
						</div>
					</template>
				</Column>
				<Column field="total_cents" header="Total" sortable :style="{ textAlign: 'right' }">
					<template #body="{ data }">
						<div class="text-right tabular-nums whitespace-nowrap font-medium">
							{{ formatLKR(data.total_cents) }}
						</div>
					</template>
				</Column>
				<Column field="status" header="Status" sortable>
					<template #body="{ data }">
						<StatusBadge :status="data.status" />
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>

		<NewCreditNoteModal v-model:open="newOpen" :issue-date="newIssueDate" />
	</div>
</template>

<script setup lang="ts">
	import type { CreditNoteStatus } from "~/stores/credit_notes";
	import { formatLKR } from "~/lib/money";
	import { useClientsStore } from "~/stores/clients";
	import { useCreditNotesStore } from "~/stores/credit_notes";

	definePageMeta({ title: "Credit notes" });

	const store = useCreditNotesStore();
	const clientsStore = useClientsStore();
	const router = useRouter();

	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([
			store.ensureLoaded(),
			clientsStore.ensureLoaded()
		]);
	}));

	const STATUSES: CreditNoteStatus[] = ["draft", "issued", "cancelled"];
	const STATUS_LABEL: Record<CreditNoteStatus, string> = {
		draft: "Draft",
		issued: "Issued",
		cancelled: "Cancelled"
	};

	// Active-chip styling per status — matches the StatusBadge tones so
	// the filter chip looks like an active version of the badge it
	// narrows on.
	function statusChipClasses(s: CreditNoteStatus): string {
		const active = store.statusFilters.includes(s);
		if (!active) {
			return "border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-border-accented)";
		}
		if (s === "issued") return "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)";
		// draft + cancelled share the neutral tone.
		return "bg-(--ui-bg-accented) border-(--ui-border-accented) text-(--ui-text)";
	}

	const clientOptions = computed<{ label: string, value: number | "all" }[]>(() => [
		{ label: "All clients", value: "all" },
		...[...clientsStore.clients]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((c) => ({ label: c.name, value: c.id }))
	]);

	const filteredTotal = computed(() =>
		store.filtered.reduce((sum, r) => sum + r.total_cents, 0)
	);

	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.statusFilters.length > 0
		|| store.clientFilter !== "all"
		|| store.hasDateFilters
	);

	function resetFilters() {
		store.search = "";
		store.clearStatusFilters();
		store.clientFilter = "all";
		store.clearDateFilters();
	}

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	// New-modal plumbing. Same `?new=1[&issued=YYYY-MM-DD]` query
	// pattern other list pages use so the dashboard / calendar can
	// open this modal directly.
	const newOpen = ref(false);
	const newIssueDate = ref<string | null>(null);
	const newCreditNote = () => {
		newIssueDate.value = null;
		newOpen.value = true;
	};

	const route = useRoute();
	onMounted(() => {
		if (route.query.new === "1") {
			const issued = typeof route.query.issued === "string" ? route.query.issued : null;
			newIssueDate.value = issued;
			newOpen.value = true;
			void router.replace({ query: { ...route.query, new: undefined, issued: undefined } });
		}
	});
</script>
