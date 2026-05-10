<template>
	<div>
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
				<!-- Filter strip — same shape as bills / invoices. -->
				<div class="space-y-3">
					<div class="flex items-center gap-3 flex-wrap">
						<UInput
							v-model="store.search"
							placeholder="Search by number or employee…"
							icon="i-lucide-search"
							class="md:w-72"
						/>
						<USelectMenu
							v-model="employeeSelection"
							:items="employeeOptions"
							value-key="value"
							class="md:w-56"
							:search-input="{ placeholder: 'Employee…' }"
						/>
						<USelect
							v-model="store.statusFilter"
							:items="statusOptions"
							value-key="value"
							class="md:w-40"
						/>
						<UButton
							v-if="anyFilterActive"
							size="xs"
							variant="soft"
							color="neutral"
							icon="i-lucide-rotate-ccw"
							@click="resetFilters"
						>
							Reset filters
						</UButton>
					</div>
					<div class="flex items-center gap-3 flex-wrap">
						<!-- Month / year shortcut: 90% of the time the user is
							asking 'show me April 2026' — picking from a single
							list is much faster than two date fields. The
							underlying period_from / period_to filters still
							drive the query; this just sets them to the chosen
							month's bounds. The custom-range fields below stay
							for the rarer multi-month or partial-month case. -->
						<USelectMenu
							v-model="monthSelection"
							:items="monthOptions"
							value-key="value"
							class="md:w-48"
							:search-input="{ placeholder: 'Month…' }"
						/>
						<DateRangeField
							v-model:from="store.periodFrom"
							v-model:to="store.periodTo"
							from-label="Custom from"
							to-label="Custom to"
						/>
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

			<table v-else class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
					<tr>
						<SortableTh
							th-class="py-2 pl-3 pr-2 font-medium"
							:active="list.sortKey === 'number'"
							:dir="list.sortDir"
							@sort="list.toggleSort('number')"
						>
							Number
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'employee'"
							:dir="list.sortDir"
							@sort="list.toggleSort('employee')"
						>
							Employee
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'period_start'"
							:dir="list.sortDir"
							@sort="list.toggleSort('period_start')"
						>
							Period
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'pay_date'"
							:dir="list.sortDir"
							@sort="list.toggleSort('pay_date')"
						>
							Pay date
						</SortableTh>
						<th class="py-2 px-2 font-medium">
							Status
						</th>
						<SortableTh
							th-class="py-2 px-2 font-medium text-right"
							:active="list.sortKey === 'net'"
							:dir="list.sortDir"
							@sort="list.toggleSort('net')"
						>
							Net
						</SortableTh>
						<th class="py-2 pl-2 pr-3 w-10" />
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="r in list.paged"
						:key="r.id"
						class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
						@click="open(r)"
					>
						<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
							{{ r.number }}
						</td>
						<td class="py-2 px-2">
							{{ employeeName(r) }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
							{{ r.period_start }} → {{ r.period_end }}
						</td>
						<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
							{{ r.pay_date }}
						</td>
						<td class="py-2 px-2">
							<StatusBadge :status="store.derivedStatus(r)" />
						</td>
						<td class="py-2 px-2 text-right tabular-nums">
							{{ formatMoney(r.net_cents) }}
						</td>
						<td class="py-2 pl-2 pr-3 text-right" @click.stop>
							<UDropdownMenu :items="itemsFor(r)">
								<UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
							</UDropdownMenu>
						</td>
					</tr>
				</tbody>
			</table>

			<ListPagination
				v-model:page="list.page"
				v-model:page-size="list.pageSize"
				:total="list.total"
				:total-pages="list.totalPages"
				:range-start="list.rangeStart"
				:range-end="list.rangeEnd"
			/>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { EmployeeSnapshot, PayslipRow, PayslipStatus } from "~/stores/payslips";
	import { useListView } from "~/composables/useListView";
	import { formatMoney } from "~/lib/money";
	import { useEmployeesStore } from "~/stores/employees";
	import { monthBounds, usePayslipsStore } from "~/stores/payslips";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Payslips" });

	const router = useRouter();
	const store = usePayslipsStore();
	const employeesStore = useEmployeesStore();
	const vouchersStore = useVouchersStore();

	await Promise.all([
		store.load(),
		employeesStore.employees.length === 0 ? employeesStore.load() : Promise.resolve(),
		vouchersStore.vouchers.length === 0 ? vouchersStore.load() : Promise.resolve()
	]);

	const employeeName = (r: PayslipRow): string => {
		try {
			return (JSON.parse(r.employee_snapshot) as EmployeeSnapshot).full_name ?? "(unknown)";
		} catch {
			return "(unknown)";
		}
	};

	const list = useListView<PayslipRow>(
		() => store.filtered,
		[
			{ key: "number", getValue: (r) => r.number },
			{ key: "employee", getValue: (r) => employeeName(r) },
			{ key: "period_start", getValue: (r) => r.period_start },
			{ key: "pay_date", getValue: (r) => r.pay_date },
			{ key: "net", getValue: (r) => r.net_cents }
		],
		{ defaultSortKey: "period_start", defaultDir: "desc" }
	);

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

	const statusOptions: { label: string, value: PayslipStatus | "all" | "outstanding" }[] = [
		{ label: "All statuses", value: "all" },
		{ label: "Outstanding", value: "outstanding" },
		{ label: "Draft", value: "draft" },
		{ label: "Unpaid", value: "unpaid" },
		{ label: "Partial", value: "partial" },
		{ label: "Paid", value: "paid" },
		{ label: "Cancelled", value: "cancelled" }
	];

	const anyFilterActive = computed(() =>
		store.search.trim() !== ""
		|| store.statusFilter !== "all"
		|| store.employeeFilter !== "all"
		|| store.hasDateFilters
	);

	const resetFilters = () => {
		store.search = "";
		store.statusFilter = "all";
		store.employeeFilter = "all";
		store.clearDateFilters();
	};

	const open = (r: PayslipRow) => router.push(`/payslips/${r.id}`);

	const itemsFor = (r: PayslipRow) => [[
		{ label: "Open", icon: "i-lucide-pencil", onSelect: () => open(r) }
	]];
</script>
