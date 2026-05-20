<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			payslips, not copying cell text out of the table. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Payslips
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					{{ store.payslips.length }} total · outstanding balance
					<span class="font-medium tabular-nums">{{ formatMoney(store.outstandingTotal) }}</span>
				</p>
			</div>
			<div class="flex items-center gap-2">
				<UButton
					icon="i-lucide-users"
					variant="soft"
					color="neutral"
					@click="router.push('/payslips/bulk')"
				>
					Bulk for all
				</UButton>
				<UButton icon="i-lucide-plus" @click="router.push('/payslips/new')">
					New payslip
				</UButton>
			</div>
		</header>

		<UCard>
			<template #header>
				<!-- Filter strip — chips + month shortcut + Advanced popover
					for custom date ranges. Month picker stays first-class
					(common payroll question is 'show me April 2026'). -->
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-2 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by number or employee…"
							icon="i-lucide-search"
							size="md"
							class="flex-1 min-w-64"
						/>
						<USelectMenu
							v-model="employeeSelection"
							:items="employeeOptions"
							value-key="value"
							icon="i-lucide-users"
							class="w-56"
							:search-input="{ placeholder: 'Employee…' }"
						/>
						<USelectMenu
							v-model="monthSelection"
							:items="monthOptions"
							value-key="value"
							icon="i-lucide-calendar"
							class="w-48"
							:search-input="{ placeholder: 'Month…' }"
						/>
						<UPopover>
							<UButton color="neutral" variant="outline" icon="i-lucide-sliders-horizontal" class="relative">
								Advanced
								<span
									v-if="customRangeActive"
									class="absolute -top-1 -right-1 size-2 rounded-full bg-(--ui-info)"
								/>
							</UButton>
							<template #content>
								<div class="p-4 w-[420px] space-y-4">
									<div>
										<div class="text-xs font-medium uppercase tracking-wider text-(--ui-text-muted) mb-1.5 flex items-center gap-1.5">
											<UIcon name="i-lucide-calendar" class="size-3.5" />
											Custom period range
										</div>
										<DateRangeField
											v-model:from="store.periodFrom"
											v-model:to="store.periodTo"
										/>
										<p class="text-xs text-(--ui-text-muted) mt-2">
											Use the month picker for a single month; this range
											is for multi-month or partial-month queries.
										</p>
									</div>
									<div v-if="store.hasDateFilters" class="pt-2 border-t border-(--ui-border) flex justify-end">
										<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="store.clearDateFilters">
											Clear date filter
										</UButton>
									</div>
								</div>
							</template>
						</UPopover>
						<UButton
							v-if="anyFilterActive"
							size="md"
							variant="soft"
							color="neutral"
							icon="i-lucide-x"
							class="ml-auto"
							@click="resetFilters"
						>
							Reset
						</UButton>
						<UButton
							size="md"
							variant="soft"
							color="neutral"
							icon="i-lucide-table-columns-split"
							:class="anyFilterActive ? '' : 'ml-auto'"
							title="Auto-size columns to their content"
							@click="autoFitColumns"
						>
							Auto-fit columns
						</UButton>
					</div>

					<div class="flex items-center gap-1.5 flex-wrap">
						<UIcon name="i-lucide-flag" class="size-3.5 text-(--ui-text-muted) shrink-0 mr-1" />
						<button
							v-for="s in PAYSLIP_STATUSES"
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

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading payslips…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-file-spreadsheet" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.payslips.length === 0">
					No payslips yet. Click <span class="font-medium">New payslip</span> to issue the first one.
				</div>
				<div v-else>
					No payslips match your filters.
				</div>
			</div>

			<!-- Selection action bar — renders above the table whenever any
				row is ticked. PrimeVue's selection model lives in
				`selectedRows`; we surface a count + Clear + Generate PDFs. -->
			<div
				v-if="selectedRows.length > 0 && !store.loading && !store.error"
				class="mb-3 flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-(--ui-primary)/30 bg-(--ui-primary)/10 text-sm"
			>
				<div>
					<span class="font-medium">{{ selectedRows.length }} selected</span>
					<span class="text-(--ui-text-muted)"> · across all filters / pages</span>
				</div>
				<div class="flex items-center gap-2">
					<UButton
						size="xs"
						color="neutral"
						variant="ghost"
						@click="selectedRows = []"
					>
						Clear
					</UButton>
					<UButton
						size="xs"
						icon="i-lucide-file-down"
						:loading="bulkPdf.running"
						@click="generateBulkPdfs"
					>
						Generate PDFs
					</UButton>
				</div>
			</div>

			<ResizableDataTable
				v-if="!store.loading && !store.error && store.filtered.length > 0"
				ref="tableRef"
				v-model:selection="selectedRows"
				:rows="rows"
				state-key="payslips-table"
				:row-actions="itemsFor"
				default-sort-field="period_start"
				:default-sort-order="-1"
				selectable
				@row-click="(row) => router.push(`/payslips/${row.id}`)"
			>
				<Column field="number" header="Number" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium tabular-nums">
							{{ data.number }}
						</div>
					</template>
				</Column>
				<Column field="_employee" header="Employee" sortable>
					<template #body="{ data }">
						<div class="truncate">
							{{ data._employee }}
						</div>
					</template>
				</Column>
				<Column field="period_start" header="Period" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted) tabular-nums">
							{{ data.period_start }} → {{ data.period_end }}
						</div>
					</template>
				</Column>
				<Column field="pay_date" header="Pay date" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted) tabular-nums">
							{{ data.pay_date }}
						</div>
					</template>
				</Column>
				<Column field="_status" header="Status" sortable>
					<template #body="{ data }">
						<StatusBadge :status="data._status" />
					</template>
				</Column>
				<Column
					field="net_cents"
					header="Net"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div class="truncate text-right tabular-nums">
							{{ formatMoney(data.net_cents) }}
						</div>
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Payslip PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>

		<!-- Bulk PDF progress modal. We deliberately don't allow closing
			while it's running — only Cancel after the current file
			finishes. close-on-overlay is off for the same reason. -->
		<UModal
			:open="bulkPdf.modalOpen"
			:dismissible="false"
			:close="false"
			title="Generating payslip PDFs"
		>
			<template #body>
				<div class="space-y-3">
					<div class="text-sm">
						<div class="flex justify-between tabular-nums">
							<span>{{ bulkPdf.progress }} of {{ bulkPdf.total }}</span>
							<span class="text-(--ui-text-muted)">{{ bulkPdf.errors.length }} error{{ bulkPdf.errors.length === 1 ? "" : "s" }}</span>
						</div>
						<div class="mt-2 h-2 rounded-full bg-(--ui-bg-muted) overflow-hidden">
							<div
								class="h-full bg-(--ui-primary) transition-all duration-150"
								:style="{ width: bulkPdf.total === 0 ? '0%' : `${Math.round((bulkPdf.progress / bulkPdf.total) * 100)}%` }"
							/>
						</div>
					</div>
					<div v-if="bulkPdf.currentName" class="text-xs text-(--ui-text-muted) truncate">
						Rendering <span class="font-medium">{{ bulkPdf.currentName }}</span>…
					</div>
					<div v-if="bulkPdf.errors.length > 0" class="max-h-32 overflow-auto text-xs space-y-1 rounded-md border border-(--ui-error)/30 bg-(--ui-error)/5 p-2">
						<div v-for="(e, i) in bulkPdf.errors" :key="i">
							<span class="font-medium">{{ e.name }}:</span>
							<span class="text-(--ui-text-muted)"> {{ e.message }}</span>
						</div>
					</div>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton
						v-if="bulkPdf.running"
						color="neutral"
						variant="outline"
						@click="bulkPdf.cancelled = true"
					>
						{{ bulkPdf.cancelled ? "Cancelling…" : "Cancel" }}
					</UButton>
					<UButton
						v-else-if="bulkPdf.outputDir"
						color="neutral"
						variant="outline"
						icon="i-lucide-folder-open"
						@click="openOutputFolder"
					>
						Open folder
					</UButton>
					<UButton
						v-if="!bulkPdf.running"
						@click="bulkPdf.modalOpen = false"
					>
						Done
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
	import type { EmployeeSnapshot, PayslipLineDraft, PayslipRow, PayslipStatus } from "~/stores/payslips";
	import { invoke } from "@tauri-apps/api/core";
	import { join } from "@tauri-apps/api/path";
	import { open as openDialog } from "@tauri-apps/plugin-dialog";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { formatMoney } from "~/lib/money";
	import { buildPayslipPdfPayload } from "~/lib/payslip-pdf";
	import { resolveProtectPassword } from "~/lib/pdf";
	import { useEmployeesStore } from "~/stores/employees";
	import { monthBounds, usePayslipsStore } from "~/stores/payslips";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Payslips" });

	const router = useRouter();
	const route = useRoute();
	const toast = useToast();
	const store = usePayslipsStore();
	const employeesStore = useEmployeesStore();
	const vouchersStore = useVouchersStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();

	await Promise.all([
		store.load(),
		employeesStore.employees.length === 0 ? employeesStore.load() : Promise.resolve(),
		vouchersStore.vouchers.length === 0 ? vouchersStore.load() : Promise.resolve(),
		settingsStore.ensureLoaded()
	]);

	// Optional ?employee=ID query — used by the "View payslips" action on
	// the employees list to land here pre-filtered to that employee.
	{
		const raw = route.query.employee;
		const v = Array.isArray(raw) ? raw[0] : raw;
		const n = v ? Number(v) : Number.NaN;
		if (Number.isFinite(n)) store.employeeFilter = n;
	}

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	// Hoisted helper so the row view-model below can close over it.
	function employeeName(r: PayslipRow): string {
		try {
			return (JSON.parse(r.employee_snapshot) as EmployeeSnapshot).full_name ?? "(unknown)";
		} catch {
			return "(unknown)";
		}
	}

	// View-model: PrimeVue sorts by top-level fields, so derived employee
	// name and status are surfaced as `_employee` and `_status`.
	interface PayslipRowVM extends PayslipRow {
		_employee: string
		_status: PayslipStatus
	}
	const rows = computed<PayslipRowVM[]>(() =>
		store.filtered.map((r) => ({
			...r,
			_employee: employeeName(r),
			_status: store.derivedStatus(r)
		}))
	);

	// PrimeVue's selection model holds row references; the bulk-PDF logic
	// below derives IDs as needed. With `data-key="id"` (set by
	// ResizableDataTable's default), PrimeVue tracks selection by id so
	// the same rows stay ticked across sort / page / filter changes.
	const selectedRows = ref<PayslipRowVM[]>([]);

	const employeeOptions = computed(() => [
		{ label: "All employees", value: "all" as const },
		...employeesStore.employees
			.filter((e) => e.is_archived === 0)
			.map((e) => ({ label: e.full_name, value: e.id }))
	]);

	// USelectMenu wants a single value/label shape; we still bind to the
	// store's number|"all" filter underneath.
	const employeeSelection = computed({
		get: () => store.employeeFilter,
		set: (v: number | "all") => {
			store.employeeFilter = v;
		}
	});

	// Month shortcut. The list spans whatever months are present in the
	// payslip table plus the current month — that way we don't show a
	// year of empty options on a fresh tenant, and we always include
	// the month the user is most likely about to issue a payslip in.
	const monthOptions = computed(() => {
		const months = new Set<string>(); // "YYYY-MM"
		for (const p of store.payslips) {
			months.add(p.period_start.slice(0, 7));
		}
		const today = new Date();
		months.add(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
		const sorted = Array.from(months).sort().reverse();
		const fmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
		return [
			{ label: "All months", value: "all" as const },
			...sorted.map((ym) => {
				const [y, m] = ym.split("-").map(Number) as [number, number];
				return { label: fmt.format(new Date(y, m - 1, 1)), value: ym };
			})
		];
	});

	// v-model on the month picker. Reading: "all" when both range bounds
	// are unset, the matching YYYY-MM when from/to align with that
	// month's bounds, otherwise "all" (custom range — let the
	// DateRangeField alone, the picker just shows All).
	const monthSelection = computed<string>({
		get: () => {
			const from = store.periodFrom;
			const to = store.periodTo;
			if (!from || !to) return "all";
			const ym = from.slice(0, 7);
			const bounds = monthBounds(`${ym}-01`);
			return from === bounds.start && to === bounds.end ? ym : "all";
		},
		set: (v: string) => {
			if (v === "all") {
				store.periodFrom = null;
				store.periodTo = null;
				return;
			}
			const bounds = monthBounds(`${v}-01`);
			store.periodFrom = bounds.start;
			store.periodTo = bounds.end;
		}
	});

	const anyFilterActive = computed(() =>
		store.search.trim() !== ""
		|| store.statusFilters.length > 0
		|| store.employeeFilter !== "all"
		|| store.hasDateFilters
	);

	const resetFilters = () => {
		store.search = "";
		store.clearStatusFilters();
		store.employeeFilter = "all";
		store.clearDateFilters();
	};

	// "Custom range active" = a date filter is set AND it doesn't equal
	// any month's bounds. Used to light up the Advanced button's dot
	// only when the user actually has a custom range applied.
	const customRangeActive = computed(() => {
		if (!store.hasDateFilters) return false;
		return monthSelection.value === "all";
	});

	// Status chips. Mirrors StatusBadge's semantic colours.
	const PAYSLIP_STATUSES: PayslipStatus[] = [
		"draft",
		"unpaid",
		"partial",
		"paid",
		"cancelled"
	];
	const STATUS_LABEL: Record<PayslipStatus, string> = {
		draft: "Draft",
		unpaid: "Unpaid",
		partial: "Partial",
		paid: "Paid",
		cancelled: "Cancelled"
	};
	const STATUS_ACTIVE_CLASSES: Record<PayslipStatus, string> = {
		draft: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text)",
		unpaid: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		partial: "bg-(--ui-warning)/15 border-(--ui-warning)/40 text-(--ui-warning)",
		paid: "bg-(--ui-success)/15 border-(--ui-success)/40 text-(--ui-success)",
		cancelled: "bg-(--ui-bg-muted) border-(--ui-text-muted)/40 text-(--ui-text-muted)"
	};
	const inactiveChip = "bg-transparent border-(--ui-border) text-(--ui-text-muted) hover:bg-(--ui-bg-muted) hover:text-(--ui-text)";
	const statusChipClasses = (s: PayslipStatus): string =>
		store.statusFilters.includes(s) ? STATUS_ACTIVE_CLASSES[s] : inactiveChip;

	// --- Row actions: PDF preview + Mark issued -----------------------------

	const currentPayslip = ref<PayslipRow | null>(null);
	const currentLines = ref<PayslipLineDraft[]>([]);
	const pdf = usePdfPreview({
		command: "export_payslip_pdf",
		buildPayload: () => {
			if (!currentPayslip.value) return {};
			return buildPayslipPdfPayload({
				row: currentPayslip.value,
				lines: currentLines.value,
				settings: settingsStore.settings,
				currency: currency.value,
				paidCents: store.paidCentsFor(currentPayslip.value.id),
				balanceCents: store.balanceCentsFor(currentPayslip.value)
			});
		},
		fileName: () => `${currentPayslip.value?.number ?? "payslip"}.pdf`,
		title: "Payslip PDF preview"
	});

	const onPdfClick = async (r: PayslipRow) => {
		currentPayslip.value = r;
		try {
			const rows = await store.getLines(r.id);
			currentLines.value = rows.map((l) => ({
				sort_order: l.sort_order,
				kind: l.kind,
				label: l.label,
				amount_cents: l.amount_cents
			}));
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

	// Quick 'Mark issued' from the row context menu — saves the user a
	// click into the detail page when the draft is already complete.
	// Refused at the store level if anything's off (zero net, etc.) so
	// worst case is a toast describing the problem.
	const markIssued = async (r: PayslipRow) => {
		try {
			await store.setStatus(r.id, "issued");
			toast.add({ title: `${r.number} issued`, color: "success", icon: "i-lucide-send" });
		} catch (err) {
			toast.add({
				title: "Could not issue",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Two-group row-actions menu: lifecycle (Open + Mark issued when
	// available), then Generate PDF.
	function itemsFor(r: PayslipRowVM) {
		const lifecycle: { label: string, icon: string, onSelect: () => void }[] = [
			{ label: "Open", icon: "i-lucide-pencil", onSelect: () => router.push(`/payslips/${r.id}`) }
		];
		if (r.status === "draft" && r.net_cents > 0) {
			lifecycle.push({
				label: "Mark issued",
				icon: "i-lucide-send",
				onSelect: () => {
					void markIssued(r);
				}
			});
		}
		const exports = [{
			label: "Generate PDF",
			icon: "i-lucide-file-down",
			onSelect: () => {
				void onPdfClick(r);
			}
		}];
		return [lifecycle, exports];
	}

	// --- Bulk PDF generation ----------------------------------------------

	// Bulk-render state. modalOpen drives the progress dialog; running
	// gates the action bar's spinner; cancelled is checked between
	// iterations so the user can abort.
	const bulkPdf = reactive({
		modalOpen: false,
		running: false,
		cancelled: false,
		progress: 0,
		total: 0,
		currentName: "",
		outputDir: "" as string,
		errors: [] as { name: string, message: string }[]
	});

	const openOutputFolder = async () => {
		if (!bulkPdf.outputDir) return;
		try {
			await invoke("open_path", { path: bulkPdf.outputDir });
		} catch (err) {
			toast.add({
				title: "Could not open folder",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Slugify the payslip number for the output filename. Numbers are
	// already filesystem-safe ("PSL-2026-0001") but defensive sanitising
	// doesn't hurt.
	const safeName = (s: string): string => s.replace(/[^\w.-]+/g, "_");

	const generateBulkPdfs = async () => {
		if (bulkPdf.running) return;
		if (selectedRows.value.length === 0) return;

		// Folder picker — directory mode. Tauri's open() returns null on
		// cancel (or string array if multiple, but we don't enable that).
		let folder: string | null = null;
		try {
			const picked = await openDialog({ directory: true, multiple: false });
			folder = Array.isArray(picked) ? picked[0] ?? null : picked;
		} catch (err) {
			toast.add({
				title: "Could not open folder picker",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		if (!folder) return; // cancelled

		// Snapshot the selection — if the user keeps clicking around while
		// it runs, we still process exactly what they kicked off. Resolve
		// from store.payslips by id so we get the canonical row reference
		// (PrimeVue's selection array can hold stale refs across reloads,
		// but `data-key="id"` keeps the IDs accurate).
		const selectedIds = new Set(selectedRows.value.map((r) => r.id));
		const targets: PayslipRow[] = [];
		for (const p of store.payslips) {
			if (selectedIds.has(p.id)) targets.push(p);
		}
		// Sort by number for predictable filename order.
		targets.sort((a, b) => a.number.localeCompare(b.number));

		bulkPdf.modalOpen = true;
		bulkPdf.running = true;
		bulkPdf.cancelled = false;
		bulkPdf.progress = 0;
		bulkPdf.total = targets.length;
		bulkPdf.currentName = "";
		bulkPdf.outputDir = folder;
		bulkPdf.errors = [];

		// Resolve owner-password protection once for the whole run — the
		// preview flow gets this automatically, but the bulk loop invokes
		// the export command directly so it must thread the password too.
		const protectPassword = await resolveProtectPassword("export_payslip_pdf");

		for (const row of targets) {
			if (bulkPdf.cancelled) break;
			bulkPdf.currentName = row.number;

			try {
				const lineRows = await store.getLines(row.id);
				const lines: PayslipLineDraft[] = lineRows.map((l) => ({
					sort_order: l.sort_order,
					kind: l.kind,
					label: l.label,
					amount_cents: l.amount_cents
				}));

				const payload = buildPayslipPdfPayload({
					row,
					lines,
					settings: settingsStore.settings,
					currency: currency.value,
					paidCents: store.paidCentsFor(row.id),
					balanceCents: store.balanceCentsFor(row)
				});

				const outputPath = await join(folder, `${safeName(row.number)}.pdf`);
				await invoke("export_payslip_pdf", { data: payload, outputPath, protectPassword });
			} catch (err) {
				bulkPdf.errors.push({
					name: row.number,
					message: err instanceof Error ? err.message : String(err)
				});
			} finally {
				bulkPdf.progress += 1;
			}
		}

		bulkPdf.running = false;
		bulkPdf.currentName = "";

		const successCount = bulkPdf.progress - bulkPdf.errors.length;
		const cancelledTail = bulkPdf.cancelled ? ` · ${bulkPdf.total - bulkPdf.progress} skipped` : "";
		toast.add({
			title: bulkPdf.cancelled
				? `Cancelled — ${successCount} of ${bulkPdf.total} done${cancelledTail}`
				: `Generated ${successCount} of ${bulkPdf.total} PDFs`,
			description: bulkPdf.errors.length > 0
				? `${bulkPdf.errors.length} error${bulkPdf.errors.length === 1 ? "" : "s"} — see modal for details.`
				: undefined,
			color: bulkPdf.errors.length === 0 && !bulkPdf.cancelled ? "success" : "warning",
			icon: bulkPdf.errors.length === 0 && !bulkPdf.cancelled ? "i-lucide-check" : "i-lucide-triangle-alert"
		});

		// Don't auto-close the modal — let the user click "Open folder"
		// or "Done" themselves so they can read errors.
	};
</script>
