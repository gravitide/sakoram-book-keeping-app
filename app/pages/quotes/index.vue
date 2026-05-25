<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			quotes, not copying cell text out of the table. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold flex items-center gap-3">
					Quotes
					<UIcon
						v-if="isLoading"
						name="i-lucide-loader-circle"
						class="size-4 animate-spin text-(--ui-primary)"
					/>
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					<span v-if="isLoading">Loading…</span>
					<template v-else>
						{{ store.quotes.length }} total · {{ counts.draft }} draft · {{ counts.sent }} sent · {{ counts.accepted }} accepted
					</template>
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newQuote">
				New quote
			</UButton>
		</header>

		<UCard>
			<template #header>
				<!-- Filter strip: two coordinated rows. The first holds the
					quick filters (search / client / status); the second
					holds the less-common date ranges with compact inline
					labels. A single "Reset" pill surfaces on the far right
					of row 2 whenever any filter is active. -->
				<div class="flex flex-col gap-3">
					<!-- Row 1 — quick filters + advanced popover trigger -->
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
						<UPopover>
							<UButton
								color="neutral"
								variant="outline"
								icon="i-lucide-sliders-horizontal"
								class="relative"
							>
								Advanced
								<span
									v-if="store.hasDateFilters"
									class="absolute -top-1 -right-1 size-2 rounded-full bg-(--ui-info)"
								/>
							</UButton>
							<template #content>
								<div class="p-4 w-[420px] space-y-4">
									<div>
										<div class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted) mb-1.5 flex items-center gap-1.5">
											<UIcon name="i-lucide-calendar" class="size-3.5" />
											Issue date
										</div>
										<DateRangeField
											v-model:from="store.issuedFrom"
											v-model:to="store.issuedTo"
										/>
									</div>
									<div>
										<div class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted) mb-1.5 flex items-center gap-1.5">
											<UIcon name="i-lucide-calendar-clock" class="size-3.5" />
											Valid until
										</div>
										<DateRangeField
											v-model:from="store.validFrom"
											v-model:to="store.validTo"
										/>
									</div>
									<div v-if="store.hasDateFilters" class="pt-2 border-t border-(--ui-border) flex justify-end">
										<UButton
											size="xs"
											variant="ghost"
											color="neutral"
											icon="i-lucide-x"
											@click="store.clearDateFilters"
										>
											Clear date filters
										</UButton>
									</div>
								</div>
							</template>
						</UPopover>
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

					<!-- Status + issued-date chip rows. Stack at sm, sit
						side-by-side from md+ so the filter strip stays
						compact on a typical desktop window. items-start
						keeps each column flush with the top of the row
						even when one column wraps to two lines and the
						other stays single — otherwise the shorter
						column floats vertically centered against the
						taller one. -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
						<!-- Multi-select status filter. -->
						<div class="flex items-center gap-1.5 flex-wrap">
							<UIcon name="i-lucide-flag" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
							<button
								v-for="s in QUOTE_STATUSES"
								:key="s"
								type="button"
								class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
								:class="statusChipClasses(s)"
								@click="store.toggleStatusFilter(s)"
							>
								{{ STATUS_LABEL[s] }}
							</button>
						</div>

						<!-- Quick issue-date preset chips. -->
						<div class="flex items-center gap-1.5 flex-wrap">
							<UIcon name="i-lucide-calendar" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
							<span class="text-xs text-(--ui-text-muted) mr-1">Issued:</span>
							<button
								v-for="p in DATE_PRESETS"
								:key="p.key"
								type="button"
								class="text-xs px-2.5 py-1 rounded-full border transition select-none cursor-pointer"
								:class="datePresetClasses(p.key)"
								@click="toggleDatePreset(p.key)"
							>
								{{ p.label }}
							</button>
						</div>
					</div>
				</div>
			</template>

			<!-- Table action bar + filtered-rows summary. Sits just
				below the header divider in the table zone. Auto-fit
				lives on the left (it's a table action, not a filter);
				the summary stays right-aligned. Hidden during loading
				/ error to avoid a confusing 0 readout. -->
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
					<span v-if="hasAnyFilter" class="text-xs text-(--ui-text-muted)">{{ store.filtered.length }} of {{ store.quotes.length }} shown</span>
					<StatChip label="Total" :value="formatLKR(filteredTotal)" />
				</div>
			</div>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading quotes…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-file-text" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.quotes.length === 0">
					No quotes yet. Click <span class="font-medium">New quote</span> to start.
				</div>
				<div v-else>
					No quotes match your filters.
				</div>
			</div>

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="rows"
				state-key="quotes-table"
				:row-actions="itemsFor"
				default-sort-field="issue_date"
				:default-sort-order="-1"
				@row-click="(row) => router.push(`/quotes/${row.id}`)"
			>
				<Column field="number" header="Number" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium tabular-nums">
							{{ data.number }}
						</div>
					</template>
				</Column>
				<Column field="_client" header="Client" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data._client }}
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
						<div class="truncate text-(--ui-text-muted) tabular-nums">
							{{ data.issue_date }}
						</div>
					</template>
				</Column>
				<Column field="valid_until" header="Valid until" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted) tabular-nums">
							{{ data.valid_until }}
						</div>
					</template>
				</Column>
				<Column
					field="total_cents"
					header="Total"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div class="truncate text-right tabular-nums">
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

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:temp-path="pdf.state.tempPath"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Quote PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>

		<!-- New-quote creation lives as a modal (was a standalone page). -->
		<NewQuoteModal v-model:open="newQuoteOpen" :issue-date="newQuoteIssueDate" />
	</div>
</template>

<script setup lang="ts">
	import type { ClientSnapshot, QuoteLineRow, QuoteRow, QuoteStatus } from "~/stores/quotes";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { formatLKR } from "~/lib/money";
	import { buildQuotePdfPayload } from "~/lib/quote-pdf";
	import { useClientsStore } from "~/stores/clients";
	import { canTransition, useQuotesStore } from "~/stores/quotes";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Quotes" });

	const router = useRouter();
	const toast = useToast();
	const store = useQuotesStore();
	const clientsStore = useClientsStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	// Data load in onMounted (not top-level await) — see /invoices for
	// the rationale. Page mounts instantly so the user can navigate
	// away mid-load. expireOverdue() runs after the store hydrates.
	const isLoading = ref(true);
	onMounted(async () => {
		try {
			await Promise.all([
				store.ensureLoaded(),
				clientsStore.ensureLoaded(),
				settingsStore.ensureLoaded()
			]);
			// Auto-expire any sent quotes past valid_until — silently
			// non-fatal if it fails.
			await store.expireOverdue().catch(() => { /* */ });
		} finally {
			isLoading.value = false;
		}
	});

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	// Hoisted helper so the row view-model below can close over it.
	function clientName(snap: string): string {
		try {
			return (JSON.parse(snap) as ClientSnapshot).name ?? "—";
		} catch {
			return "—";
		}
	}

	// View-model: PrimeVue's DataTable sorts by top-level fields, so we
	// surface the snapshot-derived client name as `_client`.
	interface QuoteRowVM extends QuoteRow {
		_client: string
	}
	const rows = computed<QuoteRowVM[]>(() =>
		store.filtered.map((q) => ({ ...q, _client: clientName(q.client_snapshot) }))
	);

	// Sum of total_cents across the currently visible (filtered) rows.
	// Reflects whatever the active filters narrow the list to, so the
	// header readout matches the slice the user is looking at.
	const filteredTotal = computed(() =>
		store.filtered.reduce((sum, q) => sum + q.total_cents, 0)
	);

	// Drives <NewQuoteModal>; the New button below opens it. Auto-opens
	// on mount when the route carries ?new=1 (dashboard New > Quote
	// shortcut or calendar Create-on-this-day). Optional ?issued=YYYY-MM-DD
	// carries through to NewQuoteModal as the initial issue_date.
	const newQuoteOpen = ref(false);
	const newQuoteIssueDate = ref<string | null>(null);
	const newQuote = () => {
		newQuoteIssueDate.value = null;
		newQuoteOpen.value = true;
	};
	const route = useRoute();
	onMounted(() => {
		if (route.query.new === "1") {
			const issued = typeof route.query.issued === "string" ? route.query.issued : null;
			newQuoteIssueDate.value = issued;
			newQuoteOpen.value = true;
			void router.replace({ query: { ...route.query, new: undefined, issued: undefined } });
		}
	});
	const open = (q: QuoteRow) => router.push(`/quotes/${q.id}`);

	// Does any filter narrow the list right now? Drives the visibility
	// of the "Reset filters" pill in the toolbar.
	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.statusFilters.length > 0
		|| store.clientFilter !== "all"
		|| store.hasDateFilters
	);

	const resetFilters = () => {
		store.search = "";
		store.clearStatusFilters();
		store.clientFilter = "all";
		store.clearDateFilters();
	};

	// "All clients" sentinel + every loaded client (active or archived,
	// since old quotes against an archived client should still be
	// findable). Sorted by name to match the rest of the app.
	const clientOptions = computed<{ label: string, value: number | "all" }[]>(() => [
		{ label: "All clients", value: "all" },
		...[...clientsStore.clients]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((c) => ({ label: c.name, value: c.id }))
	]);

	// Status chip metadata — display order, label, and the colour family
	// each chip uses when active. Mirrors StatusBadge's colour map so the
	// filter chip and the row badge speak the same visual language.
	const QUOTE_STATUSES: QuoteStatus[] = [
		"draft",
		"sent",
		"accepted",
		"rejected",
		"expired",
		"converted"
	];
	const STATUS_LABEL: Record<QuoteStatus, string> = {
		draft: "Draft",
		sent: "Sent",
		accepted: "Accepted",
		rejected: "Rejected",
		expired: "Expired",
		converted: "Converted"
	};
	const STATUS_ACTIVE_CLASSES: Record<QuoteStatus, string> = {
		draft: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text)",
		sent: "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)",
		accepted: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)",
		rejected: "bg-(--ui-error)/15 border-(--ui-error)/40 text-(--ui-error)",
		expired: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		converted: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)"
	};
	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const statusChipClasses = (s: QuoteStatus): string =>
		store.statusFilters.includes(s) ? STATUS_ACTIVE_CLASSES[s] : inactiveChip;

	// Quick issue-date presets. Each resolves to a concrete ISO bound
	// pair at click time, so "This month" always means the current
	// calendar month — no stale dates if the user leaves the page
	// open across a boundary.
	type DatePresetKey = "today" | "this_week" | "this_month" | "this_year";
	const DATE_PRESETS: { key: DatePresetKey, label: string }[] = [
		{ key: "today", label: "Today" },
		{ key: "this_week", label: "This week" },
		{ key: "this_month", label: "This month" },
		{ key: "this_year", label: "This year" }
	];
	const isoFromDate = (d: Date): string =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const datePresetBounds = (key: DatePresetKey): { from: string, to: string } => {
		const now = new Date();
		if (key === "today") {
			const iso = isoFromDate(now);
			return { from: iso, to: iso };
		}
		if (key === "this_week") {
			const daysSinceMon = (now.getDay() + 6) % 7;
			const monday = new Date(now);
			monday.setDate(now.getDate() - daysSinceMon);
			const sunday = new Date(monday);
			sunday.setDate(monday.getDate() + 6);
			return { from: isoFromDate(monday), to: isoFromDate(sunday) };
		}
		if (key === "this_month") {
			const first = new Date(now.getFullYear(), now.getMonth(), 1);
			const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			return { from: isoFromDate(first), to: isoFromDate(last) };
		}
		const first = new Date(now.getFullYear(), 0, 1);
		const last = new Date(now.getFullYear(), 11, 31);
		return { from: isoFromDate(first), to: isoFromDate(last) };
	};
	const isDatePresetActive = (key: DatePresetKey): boolean => {
		const { from, to } = datePresetBounds(key);
		return store.issuedFrom === from && store.issuedTo === to;
	};
	const toggleDatePreset = (key: DatePresetKey) => {
		if (isDatePresetActive(key)) {
			store.issuedFrom = null;
			store.issuedTo = null;
			return;
		}
		const { from, to } = datePresetBounds(key);
		store.issuedFrom = from;
		store.issuedTo = to;
	};
	const datePresetClasses = (key: DatePresetKey): string =>
		isDatePresetActive(key)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: inactiveChip;

	const counts = computed(() => {
		const c: Record<QuoteStatus, number> = {
			draft: 0,
			sent: 0,
			accepted: 0,
			rejected: 0,
			expired: 0,
			converted: 0
		};
		for (const q of store.quotes) c[q.status]++;
		return c;
	});

	// --- Row actions: PDF preview + transitions + duplicate ------------------

	const currentQuote = ref<QuoteRow | null>(null);
	const currentLines = ref<QuoteLineRow[]>([]);
	const pdf = usePdfPreview({
		command: "export_quote_pdf",
		buildPayload: () => {
			if (!currentQuote.value) return {};
			return buildQuotePdfPayload({
				row: currentQuote.value,
				lines: currentLines.value,
				settings: settingsStore.settings,
				currency: currency.value
			});
		},
		fileName: () => `${currentQuote.value?.number ?? "quote"}.pdf`,
		title: "Quote PDF preview"
	});

	const onPdfClick = async (q: QuoteRow) => {
		currentQuote.value = q;
		try {
			currentLines.value = await store.getLines(q.id);
		} catch (err) {
			toast.add({
				title: "Could not load lines",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		pdf.open();
	};

	// Quick status transition from the row dropdown — saves a click into
	// the detail page when the action is unambiguous. Refused at the
	// store level if the transition is illegal; toast surfaces it.
	const transitionTo = async (q: QuoteRow, target: QuoteStatus) => {
		try {
			await store.setStatus(q.id, target);
			toast.add({ title: `${q.number} marked as ${target}`, color: "info", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Clone a quote into a fresh draft and jump straight into it.
	const onDuplicate = async (q: QuoteRow) => {
		try {
			const newId = await store.duplicate(q.id);
			toast.add({ title: `Duplicated ${q.number}`, color: "success", icon: "i-lucide-copy" });
			router.push(`/quotes/${newId}`);
		} catch (err) {
			toast.add({
				title: "Duplicate failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Three-group row-actions menu: lifecycle (Open + transitions),
	// Duplicate, then Generate PDF. ResizableDataTable inserts a
	// separator between each group.
	function itemsFor(q: QuoteRowVM) {
		const lifecycle: { label: string, icon: string, onSelect: () => void }[] = [
			{ label: "Open", icon: "i-lucide-pencil", onSelect: () => open(q) }
		];
		if (canTransition(q.status, "sent")) {
			lifecycle.push({
				label: "Mark sent",
				icon: "i-lucide-send",
				onSelect: () => {
					void transitionTo(q, "sent");
				}
			});
		}
		if (canTransition(q.status, "draft")) {
			lifecycle.push({
				label: "Reopen as draft",
				icon: "i-lucide-rotate-ccw",
				onSelect: () => {
					void transitionTo(q, "draft");
				}
			});
		}
		const duplicateAction = [{
			label: "Duplicate",
			icon: "i-lucide-copy",
			onSelect: () => {
				void onDuplicate(q);
			}
		}];
		const exports = [{
			label: "Generate PDF & Print",
			icon: "i-lucide-file-down",
			onSelect: () => {
				void onPdfClick(q);
			}
		}];
		return [lifecycle, duplicateAction, exports];
	}
</script>
