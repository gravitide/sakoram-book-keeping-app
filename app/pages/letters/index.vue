<template>
	<div class="select-none">
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold flex items-center gap-3">
					Letters
					<UIcon
						v-if="isLoading"
						name="i-lucide-loader-circle"
						class="size-4 animate-spin text-(--ui-primary)"
					/>
				</h1>
				<p class="text-sm text-(--ui-text-muted) tabular-nums">
					<span v-if="isLoading">Loading…</span>
					<template v-else>
						{{ store.letters.length }} letter{{ store.letters.length === 1 ? "" : "s" }}
					</template>
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="showNew = true">
				New letter
			</UButton>
		</header>

		<ListPageSkeleton v-if="isLoading" :chip-count="4" :column-count="5" />

		<UCard v-else>
			<template #header>
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by reference, subject, or recipient…"
							icon="i-lucide-search"
							size="md"
							class="flex-1 min-w-64"
						/>
						<USelectMenu
							v-model="store.categoryFilter"
							:items="categoryOptions"
							value-key="value"
							label-key="label"
							icon="i-lucide-tag"
							class="w-56"
							:search-input="{ placeholder: 'Filter categories…' }"
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
											Letter date
										</div>
										<DateRangeField
											v-model:from="store.dateFrom"
											v-model:to="store.dateTo"
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

					<!-- Quick letter-date preset chips. -->
					<div class="flex items-center gap-1.5 flex-wrap">
						<UIcon name="i-lucide-calendar" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
						<span class="text-xs text-(--ui-text-muted) mr-1">Dated:</span>
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
			</template>

			<!-- Table action bar + filtered-rows summary. Sits just below the
				header divider. Auto-fit lives on the left (a table action, not
				a filter); the count stays right-aligned. Hidden when there's
				no table rendered. -->
			<div
				v-if="!isLoading && store.filtered.length > 0"
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
					<span v-if="hasAnyFilter" class="text-xs text-(--ui-text-muted)">{{ store.filtered.length }} of {{ store.letters.length }} shown</span>
					<StatChip label="Letters" :value="String(store.filtered.length)" color="neutral" />
				</div>
			</div>

			<div v-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-mail" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.letters.length === 0">
					No letters yet. Click <span class="font-medium">New letter</span> to compose your first one.
				</div>
				<div v-else>
					No letters match your filters.
				</div>
			</div>

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="store.filtered"
				state-key="letters-list"
				:row-actions="itemsFor"
				default-sort-field="letter_date"
				:default-sort-order="-1"
				@row-click="(row) => router.push(`/letters/${row.id}`)"
			>
				<Column field="number" header="Reference" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium tabular-nums">
							{{ data.number || "—" }}
						</div>
					</template>
				</Column>
				<Column field="letter_date" header="Date" sortable>
					<template #body="{ data }">
						<div class="text-(--ui-text-muted) tabular-nums whitespace-nowrap">
							{{ data.letter_date }}
						</div>
					</template>
				</Column>
				<Column field="category" header="Category" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data.category || "—" }}
						</div>
					</template>
				</Column>
				<Column field="recipient_name" header="Recipient" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data.recipient_name || "—" }}
						</div>
					</template>
				</Column>
				<Column field="subject" header="Subject" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.subject || "—" }}
						</div>
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>

		<NewLetterModal v-model:open="showNew" />
		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:temp-path="pdf.state.tempPath"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			:title="pdf.title"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Letters list — client-mode ResizableDataTable (letter volume is low). Shares
// the standard app list-page shell: header + stats, filter strip inside a
// UCard #header (search + category + Advanced date range + date-preset chips),
// a table action bar, and an in-card empty state. Row actions surface View /
// PDF & Print / Duplicate / Delete via the shared context-menu pattern; PDF
// generation for a row builds the payload from that row + settings and previews
// through usePdfPreview.
	import type { LetterRow } from "~/stores/letters";
	import { buildLetterPdfPayload } from "~/lib/letter-pdf";
	import { useLettersStore } from "~/stores/letters";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Letters" });

	const router = useRouter();
	const toast = useToast();
	const store = useLettersStore();
	const settings = useSettingsStore();

	const { isLoading, runLoad } = usePageLoading();
	onMounted(() => runLoad(async () => {
		await Promise.all([store.ensureLoaded(), settings.ensureLoaded()]);
	}));

	const showNew = ref(false);

	const categoryOptions = computed<{ label: string, value: string }[]>(() => [
		{ label: "All categories", value: "all" },
		...store.categories.map((c) => ({ label: c, value: c }))
	]);

	// --- Date-preset chips ---------------------------------------------------
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
		return store.dateFrom === from && store.dateTo === to;
	};
	const toggleDatePreset = (key: DatePresetKey) => {
		if (isDatePresetActive(key)) {
			store.dateFrom = null;
			store.dateTo = null;
			return;
		}
		const { from, to } = datePresetBounds(key);
		store.dateFrom = from;
		store.dateTo = to;
	};
	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const datePresetClasses = (key: DatePresetKey): string =>
		isDatePresetActive(key)
			? "bg-(--ui-info)/15 border-(--ui-info)/40 text-(--ui-info)"
			: inactiveChip;

	const hasAnyFilter = computed(() =>
		store.search.trim() !== ""
		|| store.categoryFilter !== "all"
		|| store.hasDateFilters
	);
	const resetFilters = () => {
		store.search = "";
		store.categoryFilter = "all";
		store.clearDateFilters();
	};

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	// One preview instance reused per row; the buildPayload closure reads the
	// currently-targeted row.
	const pdfRow = ref<LetterRow | null>(null);
	const pdf = usePdfPreview({
		command: "export_letter_pdf",
		buildPayload: () => buildLetterPdfPayload({ row: pdfRow.value!, settings: settings.settings }),
		fileName: () => `${pdfRow.value?.number || "letter"}.pdf`,
		title: "Letter PDF"
	});

	const generatePdf = async (row: LetterRow) => {
		pdfRow.value = row;
		await pdf.open();
	};

	const duplicate = async (row: LetterRow) => {
		try {
			const id = await store.duplicate(row.id);
			toast.add({ title: "Letter duplicated", color: "success", icon: "i-lucide-copy" });
			await router.push(`/letters/${id}`);
		} catch (err) {
			toast.add({ title: "Could not duplicate", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	const remove = async (row: LetterRow) => {
		try {
			await store.remove(row.id);
			toast.add({ title: "Letter deleted", color: "success", icon: "i-lucide-trash-2" });
		} catch (err) {
			toast.add({ title: "Could not delete", description: err instanceof Error ? err.message : String(err), color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	function itemsFor(letter: LetterRow) {
		return [
			[
				{ label: "View", icon: "i-lucide-eye", onSelect: () => router.push(`/letters/${letter.id}`) },
				{ label: "PDF & Print", icon: "i-lucide-file-text", onSelect: () => {
					void generatePdf(letter);
				} },
				{ label: "Duplicate", icon: "i-lucide-copy", onSelect: () => {
					void duplicate(letter);
				} }
			],
			[
				{ label: "Delete", icon: "i-lucide-trash-2", onSelect: () => {
					void remove(letter);
				} }
			]
		];
	}
</script>
