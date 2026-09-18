<template>
	<div class="max-w-3xl mx-auto select-none">
		<header class="mb-6">
			<NuxtLink to="/payslips" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to payslips
			</NuxtLink>
			<h1 class="text-2xl font-semibold mt-1">
				Bulk create payslips
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				One pay period, one pay date, one click. Optionally issue and
				record the full payment in the same run — useful when most
				employees just receive their basic salary.
			</p>
		</header>

		<UCard class="mb-6">
			<template #header>
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<h2 class="font-semibold">
						Period
					</h2>
					<div class="flex items-center gap-2">
						<NuxtLink
							to="/settings/payroll"
							class="text-xs text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1"
						>
							<UIcon name="i-lucide-calendar-clock" class="size-3.5" />
							Cycle settings
						</NuxtLink>
						<UButton
							size="xs"
							variant="ghost"
							color="neutral"
							@click="overrideDates = !overrideDates"
						>
							{{ overrideDates ? "Use cycle from settings" : "Override dates" }}
						</UButton>
					</div>
				</div>
			</template>
			<div class="space-y-4">
				<UFormField v-if="!overrideDates" label="Month" required hint="Period and pay date are derived from your payroll cycle settings.">
					<USelectMenu
						v-model="targetMonth"
						:items="monthOptions"
						value-key="value"
						class="md:w-64"
						:search-input="{ placeholder: 'Month…' }"
					/>
				</UFormField>

				<div v-if="!overrideDates" class="text-sm rounded-md border border-(--ui-border) bg-(--ui-bg-muted) px-3 py-2 tabular-nums">
					<span class="text-(--ui-text-muted)">Period</span>
					<span class="font-medium ml-1">{{ periodStart }}</span>
					<span class="text-(--ui-text-muted)">→</span>
					<span class="font-medium">{{ periodEnd }}</span>
					<span class="text-(--ui-text-muted) ml-3">Pay date</span>
					<span class="font-medium ml-1">{{ payDate }}</span>
				</div>

				<template v-else>
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
				</template>
			</div>
		</UCard>

		<UCard class="mb-6">
			<template #header>
				<h2 class="font-semibold">
					Run options
				</h2>
				<p class="text-xs text-(--ui-text-muted)">
					Skip extra clicks per employee by chaining the next steps
					into the same run.
				</p>
			</template>
			<div class="space-y-4">
				<UCheckbox v-model="autoIssue" label="Mark issued after create" />
				<UCheckbox
					v-model="autoPay"
					label="Record full payment"
					:disabled="!autoIssue"
					:hint="autoIssue ? undefined : 'Issuing is required before payment.'"
				/>

				<div v-if="autoPay" class="space-y-4 pl-6 border-l-2 border-(--ui-border)">
					<UFormField label="Payment method">
						<USelect v-model="paymentMethod" :items="methodOptions" value-key="value" class="w-full md:w-1/2" />
					</UFormField>
					<UFormField label="Description">
						<UInput v-model="description" :placeholder="defaultDescription" />
					</UFormField>
					<p class="text-xs text-(--ui-text-muted)">
						One payment voucher per payslip, dated <span class="font-medium tabular-nums">{{ payDate }}</span>,
						amount equal to the payslip's net. Add a per-employee
						transaction reference (cheque #, TXN ID…) on each row
						below.
					</p>
				</div>
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
					<template v-else>
						<UInput
							v-if="autoPay && row.checked"
							v-model="row.reference"
							placeholder="TXN / cheque #"
							size="sm"
							class="w-44 shrink-0"
							:aria-label="`Reference for ${row.employee.full_name}`"
						/>
						<div class="text-sm tabular-nums shrink-0 text-right">
							<div class="font-medium">
								{{ formatMoney(expectedNet(row.employee.basic_salary_cents)) }}
							</div>
							<div class="text-xs text-(--ui-text-muted)">
								{{ runStepsLabel }}
							</div>
						</div>
					</template>
				</li>
			</ul>

			<template #footer>
				<div class="flex items-center justify-between gap-4">
					<div class="text-xs text-(--ui-text-muted)">
						<span v-if="creating">{{ progressMessage }}</span>
						<span v-else-if="selectedCount === 0">Pick at least one employee to continue.</span>
						<span v-else>
							{{ ctaSummary }}
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
							@click="runAll"
						>
							{{ ctaLabel }}
						</UButton>
					</div>
				</div>
			</template>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { EmployeeRow } from "~/stores/employees";
	import type { VoucherMethod } from "~/stores/vouchers";
	import { formatMoney } from "~/lib/money";
	import { formatMonthLabel, nextPayrollCycle, resolvePayrollCycle } from "~/lib/payroll-cycle";
	import { computeStatutory } from "~/lib/statutory";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useEmployeesStore } from "~/stores/employees";
	import { monthBounds, usePayslipsStore } from "~/stores/payslips";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Bulk payslips" });

	const router = useRouter();
	const toast = useToast();
	const store = usePayslipsStore();
	const employeesStore = useEmployeesStore();
	const vouchersStore = useVouchersStore();
	const settingsStore = useSettingsStore();
	const banksStore = useBusinessBanksStore();

	await Promise.all([
		banksStore.ensureLoaded(),
		store.load(),
		employeesStore.employees.length === 0 ? employeesStore.load() : Promise.resolve(),
		vouchersStore.vouchers.length === 0 ? vouchersStore.load() : Promise.resolve(),
		settingsStore.ensureLoaded()
	]);

	const todayISO = (() => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	})();

	// Cycle template from settings — read at mount, doesn't auto-update
	// while the page is open. Defaults model "1st → last, pay last".
	const cycleConfig = computed(() => ({
		payroll_period_start_day: settingsStore.settings?.payroll_period_start_day ?? 1,
		payroll_period_end_day: settingsStore.settings?.payroll_period_end_day ?? 31,
		payroll_pay_day: settingsStore.settings?.payroll_pay_day ?? 31
	}));

	// Target month for the auto-derived cycle. Default = whatever the
	// `nextPayrollCycle` heuristic picks (current month if its pay date
	// hasn't passed; otherwise next month). User can switch via picker.
	const initialTarget = nextPayrollCycle(todayISO, cycleConfig.value);
	const targetMonth = ref<string>(
		`${initialTarget.year}-${String(initialTarget.month).padStart(2, "0")}`
	);

	// Month options: current month plus the next 11 — covers a full
	// year of forward planning. Past months are reachable via the
	// override toggle (manual date pickers).
	const monthOptions = computed(() => {
		const opts: { label: string, value: string }[] = [];
		const today = new Date();
		for (let i = 0; i < 12; i++) {
			const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
			const y = d.getFullYear();
			const m = d.getMonth() + 1;
			opts.push({
				label: formatMonthLabel(y, m),
				value: `${y}-${String(m).padStart(2, "0")}`
			});
		}
		return opts;
	});

	// "Override dates" toggle hides the month picker and re-exposes the
	// three manual date fields. Off by default — manual is the exception.
	const overrideDates = ref(false);

	// Resolve cycle → ISO dates when the month or settings change. When
	// the user flips on override mode we leave the existing values
	// alone so they can hand-tweak from a sane starting point.
	const periodStart = ref<string | null>(initialTarget.cycle.periodStart);
	const periodEnd = ref<string | null>(initialTarget.cycle.periodEnd);
	const payDate = ref<string | null>(initialTarget.cycle.payDate);

	watch([targetMonth, cycleConfig], () => {
		if (overrideDates.value) return;
		const [yStr, mStr] = targetMonth.value.split("-");
		const resolved = resolvePayrollCycle(Number(yStr), Number(mStr), cycleConfig.value);
		periodStart.value = resolved.periodStart;
		periodEnd.value = resolved.periodEnd;
		payDate.value = resolved.payDate;
	}, { deep: true });

	// Manual-override watchers (same auto-snap as /payslips/new) — only
	// active while the user is hand-editing. The override toggle gates
	// these so they don't fight the month-resolver above.
	watch(periodStart, (next, prev) => {
		if (!overrideDates.value) return;
		if (!next || next === prev) return;
		const bounds = monthBounds(next);
		periodEnd.value = bounds.end;
		if (!payDate.value || payDate.value < bounds.start) payDate.value = bounds.end;
		else if (payDate.value > bounds.end) payDate.value = bounds.end;
	});
	watch(periodEnd, (next) => {
		if (!overrideDates.value) return;
		if (!next) return;
		if (payDate.value && payDate.value > next) payDate.value = next;
	});

	// Run options. Auto-pay is only legal when auto-issue is on — recording
	// a payment against a draft is nonsense, and the persisted FSM goes
	// draft → issued → ... so we must issue first.
	const autoIssue = ref(true);
	const autoPay = ref(true);
	watch(autoIssue, (v) => {
		if (!v) autoPay.value = false;
	});

	const paymentMethod = ref<VoucherMethod | null>("bank_transfer");
	const description = ref<string>("");

	const methodOptions: { label: string, value: VoucherMethod | null }[] = [
		{ label: "Bank transfer", value: "bank_transfer" },
		{ label: "Cash", value: "cash" },
		{ label: "Cheque", value: "cheque" },
		{ label: "Card", value: "card" },
		{ label: "Other", value: "other" },
		{ label: "—", value: null }
	];

	// "Salary for May 2026" — used as a placeholder + fallback when the
	// user hasn't typed their own description.
	const defaultDescription = computed(() => {
		if (!periodStart.value) return "Salary";
		const [y, m] = periodStart.value.split("-").map(Number) as [number, number];
		const fmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
		return `Salary for ${fmt.format(new Date(y, m - 1, 1))}`;
	});

	// Expected take-home for the bulk preview: basic minus the EPF that
	// createPayslip will seed when statutory auto-compute is on. Mirrors
	// the actual net so the preview matches what gets paid.
	const expectedNet = (basicCents: number): number => {
		if ((settingsStore.settings?.statutory_auto_compute ?? 1) !== 1) return basicCents;
		const { epfEmployeeCents } = computeStatutory(basicCents, {
			epfEmployeeBp: settingsStore.settings?.epf_employee_rate_bp ?? 800,
			epfEmployerBp: settingsStore.settings?.epf_employer_rate_bp ?? 1200,
			etfBp: settingsStore.settings?.etf_rate_bp ?? 300
		});
		return Math.max(0, basicCents - epfEmployeeCents);
	};

	// Per-employee row state. Re-derived whenever the period changes — an
	// employee that just had a payslip created in another tab shouldn't
	// stay pre-checked.
	interface BulkRow {
		employee: EmployeeRow
		alreadyExists: boolean
		existingId: number | null
		checked: boolean
		// Per-row payment reference (transaction ID, cheque #, etc.).
		// Vouchers in a payroll run rarely share a reference, so we
		// collect this on the row instead of as a bulk default.
		reference: string
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
			// Preserve any reference the user had already typed for this
			// employee — re-deriving rows on period change shouldn't wipe
			// their input.
			const prev = rows.value.find((r) => r.employee.id === e.id);
			next.push({
				employee: e,
				alreadyExists: existing !== null,
				existingId: existing?.id ?? null,
				checked: existing === null,
				reference: prev?.reference ?? ""
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

	const runStepsLabel = computed(() => {
		if (autoPay.value) return "create + issue + pay";
		if (autoIssue.value) return "create + issue";
		return "create draft";
	});

	const ctaLabel = computed(() => {
		const n = selectedCount.value;
		const suffix = n === 1 ? "payslip" : "payslips";
		if (autoPay.value) return `Create, issue & pay ${n} ${suffix}`;
		if (autoIssue.value) return `Create + issue ${n} ${suffix}`;
		return `Create ${n} ${suffix}`;
	});

	const ctaSummary = computed(() => {
		const n = selectedCount.value;
		const what = autoPay.value ? "create + issue + pay" : autoIssue.value ? "create + issue" : "create draft";
		return `${n} payslip${n === 1 ? "" : "s"} will be processed (${what}).`;
	});

	const creating = ref(false);
	const progress = ref(0);
	const progressMessage = ref("");

	const canCreate = computed(() =>
		!creating.value
		&& selectedCount.value > 0
		&& periodStart.value !== null
		&& periodEnd.value !== null
		&& payDate.value !== null
	);

	const runAll = async () => {
		if (!canCreate.value || !periodStart.value || !periodEnd.value || !payDate.value) return;
		creating.value = true;
		progress.value = 0;

		const targets = rows.value.filter((r) => r.checked && !r.alreadyExists);
		let createdCount = 0;
		let issuedCount = 0;
		let paidCount = 0;
		const errors: { name: string, stage: string, message: string }[] = [];

		// Sequential — sqlite-plugin's connection pool can't handle
		// concurrent writes from JS (no transactions), and per-row failures
		// shouldn't roll back earlier successful rows.
		for (const row of targets) {
			progress.value += 1;
			progressMessage.value = `Processing ${row.employee.full_name} (${progress.value} of ${targets.length})…`;

			let payslipId: number | null = null;

			// Step 1: create
			try {
				payslipId = await store.createPayslip({
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
				}, { reload: false });
				createdCount += 1;
			} catch (err) {
				errors.push({
					name: row.employee.full_name,
					stage: "create",
					message: err instanceof Error ? err.message : String(err)
				});
				continue;
			}

			// Step 2 & 3 require a positive net. Read the ACTUAL net back from
			// the created payslip — createPayslip seeds an EPF deduction when
			// statutory auto-compute is on, so net = basic − EPF. Paying gross
			// basic here would overpay every payslip and corrupt the ledger.
			// Basic salary 0 is a likely data-entry oversight — surface as an
			// error so the user knows to set it on the employee record, but
			// don't fail the whole run.
			if (payslipId === null) continue;
			const created = await store.get(payslipId);

			const netCents = created?.net_cents ?? 0;
			if (netCents <= 0) {
				if (autoIssue.value || autoPay.value) {
					errors.push({
						name: row.employee.full_name,
						stage: "issue/pay",
						message: "Net is zero — set a basic salary on the employee record."
					});
				}
				continue;
			}

			// Step 2: issue
			if (autoIssue.value) {
				try {
					await store.setStatus(payslipId, "issued", { reload: false });

					issuedCount += 1;
				} catch (err) {
					errors.push({
						name: row.employee.full_name,
						stage: "issue",
						message: err instanceof Error ? err.message : String(err)
					});
					continue;
				}
			}

			// Step 3: pay
			if (autoPay.value) {
				try {
					await vouchersStore.create({
						voucher_type: "payment",
						voucher_date: payDate.value,
						party_name: row.employee.full_name,
						amount_cents: netCents,
						payment_method: paymentMethod.value,
						// Same default /vouchers/new applies. Without it these
						// vouchers landed with a NULL bank and were invisible to
						// /reconcile, which scopes matching per bank account.
						business_bank_id: paymentMethod.value === "cash" ? null : banksStore.defaultBank?.id ?? null,
						reference: row.reference.trim() || null,
						description: description.value.trim() || defaultDescription.value,
						related_invoice_id: null,
						related_bill_id: null,
						related_payslip_id: payslipId
					}, { reload: false });

					paidCount += 1;
				} catch (err) {
					errors.push({
						name: row.employee.full_name,
						stage: "pay",
						message: err instanceof Error ? err.message : String(err)
					});
				}
			}
		}

		// One reload at the end instead of after every row (each step ran with
		// reload:false) so the /payslips list we navigate to is fresh.
		await Promise.all([store.load(), vouchersStore.load()]);

		creating.value = false;
		progressMessage.value = "";

		// Build a single concise summary toast. Per-row failures get
		// concatenated into the description so the user sees what to fix.
		const summaryParts: string[] = [];
		summaryParts.push(`Created ${createdCount}`);
		if (autoIssue.value) summaryParts.push(`issued ${issuedCount}`);
		if (autoPay.value) summaryParts.push(`paid ${paidCount}`);
		if (errors.length > 0) summaryParts.push(`${errors.length} error${errors.length === 1 ? "" : "s"}`);

		toast.add({
			title: summaryParts.join(" · "),
			description: errors.length > 0
				? errors.map((e) => `${e.name} (${e.stage}): ${e.message}`).join("\n")
				: undefined,
			color: errors.length === 0 ? "success" : "warning",
			icon: errors.length === 0 ? "i-lucide-check" : "i-lucide-triangle-alert"
		});

		// Land the user on the list filtered to the month they just
		// generated.
		if (createdCount > 0) {
			store.periodFrom = periodStart.value;
			store.periodTo = periodEnd.value;
			await router.push("/payslips");
		}
	};
</script>
