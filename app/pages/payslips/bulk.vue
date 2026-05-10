<template>
	<div class="max-w-3xl mx-auto">
		<header class="mb-6">
			<NuxtLink to="/payslips" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to payslips
			</NuxtLink>
			<h1 class="text-2xl font-semibold mt-1">
				Bulk create payslips
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				One pay period, one pay date, one click — we'll create a draft
				payslip for each selected employee, seeded with their saved
				basic salary. Review and issue each one individually after.
			</p>
		</header>

		<UCard class="mb-6">
			<template #header>
				<h2 class="font-semibold">
					Period
				</h2>
			</template>
			<div class="space-y-4">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Period start" required>
						<DateField v-model="periodStart" />
					</UFormField>
					<UFormField label="Period end" required>
						<DateField v-model="periodEnd" :min-value="periodStart" />
					</UFormField>
				</div>
				<UFormField label="Pay date" required hint="Must fall within the pay period.">
					<DateField
						v-model="payDate"
						:min-value="periodStart"
						:max-value="periodEnd"
					/>
				</UFormField>
			</div>
		</UCard>

		<UCard>
			<template #header>
				<div class="flex items-center justify-between gap-4">
					<div>
						<h2 class="font-semibold">
							Employees
						</h2>
						<p class="text-xs text-(--ui-text-muted)">
							{{ selectableCount }} eligible · {{ selectedCount }} selected · {{ alreadyExistsCount }} already have a payslip for this period
						</p>
					</div>
					<div class="flex items-center gap-2">
						<UButton
							size="xs"
							variant="soft"
							color="neutral"
							:disabled="selectableCount === 0 || selectedCount === selectableCount"
							@click="selectAll"
						>
							Select all
						</UButton>
						<UButton
							size="xs"
							variant="soft"
							color="neutral"
							:disabled="selectedCount === 0"
							@click="deselectAll"
						>
							Deselect all
						</UButton>
					</div>
				</div>
			</template>

			<div v-if="rows.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-users-round" class="size-10 mx-auto mb-2 opacity-50" />
				No active employees yet.
				<NuxtLink to="/employees/new" class="text-(--ui-primary) hover:underline">
					Add the first one
				</NuxtLink>.
			</div>

			<ul v-else class="divide-y divide-(--ui-border)">
				<li
					v-for="row in rows"
					:key="row.employee.id"
					class="py-2.5 flex items-center gap-3"
					:class="row.alreadyExists ? 'opacity-60' : ''"
				>
					<UCheckbox
						v-model="row.checked"
						:disabled="row.alreadyExists"
						:aria-label="`Include ${row.employee.full_name}`"
					/>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2">
							<span class="font-medium truncate">
								{{ row.employee.full_name }}
							</span>
							<UBadge
								v-if="row.alreadyExists"
								color="neutral"
								variant="subtle"
								size="sm"
							>
								Already exists
							</UBadge>
						</div>
						<div v-if="row.employee.designation" class="text-xs text-(--ui-text-muted) truncate">
							{{ row.employee.designation }}
						</div>
					</div>
					<NuxtLink
						v-if="row.alreadyExists && row.existingId"
						:to="`/payslips/${row.existingId}`"
						class="text-xs text-(--ui-primary) hover:underline shrink-0"
					>
						Open
					</NuxtLink>
					<div v-else class="text-sm tabular-nums shrink-0 text-right">
						<div class="font-medium">
							{{ formatMoney(row.employee.basic_salary_cents) }}
						</div>
						<div class="text-xs text-(--ui-text-muted)">
							basic
						</div>
					</div>
				</li>
			</ul>

			<template #footer>
				<div class="flex items-center justify-between gap-4">
					<div class="text-xs text-(--ui-text-muted)">
						<span v-if="creating">Creating {{ progress }} of {{ selectedCount }}…</span>
						<span v-else-if="selectedCount === 0">Pick at least one employee to continue.</span>
						<span v-else>
							{{ selectedCount }} draft payslip{{ selectedCount === 1 ? "" : "s" }} will be created.
						</span>
					</div>
					<div class="flex gap-2">
						<UButton
							color="neutral"
							variant="outline"
							:disabled="creating"
							@click="router.push('/payslips')"
						>
							Cancel
						</UButton>
						<UButton
							:loading="creating"
							:disabled="!canCreate"
							icon="i-lucide-plus"
							@click="createAll"
						>
							Create {{ selectedCount }} payslip{{ selectedCount === 1 ? "" : "s" }}
						</UButton>
					</div>
				</div>
			</template>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { EmployeeRow } from "~/stores/employees";
	import { formatMoney } from "~/lib/money";
	import { useEmployeesStore } from "~/stores/employees";
	import { monthBounds, usePayslipsStore } from "~/stores/payslips";

	definePageMeta({ title: "Bulk payslips" });

	const router = useRouter();
	const toast = useToast();
	const store = usePayslipsStore();
	const employeesStore = useEmployeesStore();

	await Promise.all([
		store.load(),
		employeesStore.employees.length === 0 ? employeesStore.load() : Promise.resolve()
	]);

	// Default to the current calendar month — the most common case.
	const todayISO = (() => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	})();
	const initialBounds = monthBounds(todayISO);
	const periodStart = ref<string | null>(initialBounds.start);
	const periodEnd = ref<string | null>(initialBounds.end);
	const payDate = ref<string | null>(initialBounds.end);

	// Same auto-snap as /payslips/new — change period_start, period_end
	// follows; pay_date is dragged into range.
	watch(periodStart, (next, prev) => {
		if (!next || next === prev) return;
		const bounds = monthBounds(next);
		periodEnd.value = bounds.end;
		if (!payDate.value || payDate.value < bounds.start) payDate.value = bounds.end;
		else if (payDate.value > bounds.end) payDate.value = bounds.end;
	});
	watch(periodEnd, (next) => {
		if (!next) return;
		if (payDate.value && payDate.value > next) payDate.value = next;
	});

	// Per-employee row state. We back this with a reactive object so the
	// checkboxes are independent per row and we can mutate them in
	// selectAll / deselectAll. Re-derived whenever the period changes —
	// otherwise an employee that just had a payslip created in another
	// tab would still appear pre-checked here.
	interface BulkRow {
		employee: EmployeeRow
		alreadyExists: boolean
		existingId: number | null
		checked: boolean
	}

	const rows = ref<BulkRow[]>([]);

	const buildRows = () => {
		const start = periodStart.value;
		const next: BulkRow[] = [];
		for (const e of employeesStore.employees) {
			if (e.is_archived === 1) continue;
			const existing = start
				? store.payslips.find((p) => p.employee_id === e.id && p.period_start === start) ?? null
				: null;
			next.push({
				employee: e,
				alreadyExists: existing !== null,
				existingId: existing?.id ?? null,
				checked: existing === null
			});
		}
		rows.value = next;
	};

	buildRows();
	watch([periodStart, () => employeesStore.employees, () => store.payslips], () => buildRows(), { deep: true });

	const selectableCount = computed(() => rows.value.filter((r) => !r.alreadyExists).length);
	const selectedCount = computed(() => rows.value.filter((r) => r.checked && !r.alreadyExists).length);
	const alreadyExistsCount = computed(() => rows.value.filter((r) => r.alreadyExists).length);

	const selectAll = () => {
		for (const r of rows.value) {
			if (!r.alreadyExists) r.checked = true;
		}
	};
	const deselectAll = () => {
		for (const r of rows.value) r.checked = false;
	};

	const creating = ref(false);
	const progress = ref(0);

	const canCreate = computed(() =>
		!creating.value
		&& selectedCount.value > 0
		&& periodStart.value !== null
		&& periodEnd.value !== null
		&& payDate.value !== null
	);

	const createAll = async () => {
		if (!canCreate.value || !periodStart.value || !periodEnd.value || !payDate.value) return;
		creating.value = true;
		progress.value = 0;

		const targets = rows.value.filter((r) => r.checked && !r.alreadyExists);
		let created = 0;
		const errors: { name: string, message: string }[] = [];

		// Sequential — sqlite-plugin's connection pool means we can't run
		// these concurrently anyway (no client-side transactions). For a
		// realistic SL business head-count this is fine.
		for (const row of targets) {
			progress.value += 1;
			try {
				await store.createPayslip({
					employee: {
						id: row.employee.id,
						full_name: row.employee.full_name,
						employee_number: row.employee.employee_number,
						nic: row.employee.nic,
						designation: row.employee.designation,
						email: row.employee.email,
						phone: row.employee.phone,
						address_line1: row.employee.address_line1,
						address_line2: row.employee.address_line2,
						city: row.employee.city,
						postal_code: row.employee.postal_code,
						country: row.employee.country,
						joining_date: row.employee.joining_date,
						basic_salary_cents: row.employee.basic_salary_cents,
						bank_name: row.employee.bank_name,
						bank_branch: row.employee.bank_branch,
						bank_account_number: row.employee.bank_account_number,
						bank_account_name: row.employee.bank_account_name
					},
					periodStart: periodStart.value,
					periodEnd: periodEnd.value,
					payDate: payDate.value
				});
				created += 1;
			} catch (err) {
				errors.push({
					name: row.employee.full_name,
					message: err instanceof Error ? err.message : String(err)
				});
			}
		}

		creating.value = false;

		if (created > 0) {
			toast.add({
				title: errors.length === 0
					? `Created ${created} draft payslip${created === 1 ? "" : "s"}`
					: `Created ${created}, ${errors.length} failed`,
				description: errors.length > 0
					? errors.map((e) => `${e.name}: ${e.message}`).join("\n")
					: undefined,
				color: errors.length === 0 ? "success" : "warning",
				icon: errors.length === 0 ? "i-lucide-check" : "i-lucide-triangle-alert"
			});
		} else {
			toast.add({
				title: "No payslips created",
				description: errors.length > 0
					? errors.map((e) => `${e.name}: ${e.message}`).join("\n")
					: "Nothing was selected.",
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}

		// Land the user on the list filtered to the month they just
		// generated — they can scan what was created and click into any
		// one to edit.
		if (created > 0) {
			store.periodFrom = periodStart.value;
			store.periodTo = periodEnd.value;
			await router.push("/payslips");
		}
	};
</script>
