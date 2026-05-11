<template>
	<div class="max-w-2xl mx-auto">
		<header class="mb-6">
			<NuxtLink to="/payslips" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to payslips
			</NuxtLink>
			<h1 class="text-2xl font-semibold mt-1">
				New payslip
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Pick an employee and the pay period — we'll snapshot their details
				onto the payslip and seed a Basic earning equal to their saved
				salary. You can edit lines and finalise on the next screen.
			</p>
		</header>

		<UCard>
			<div class="space-y-4">
				<UFormField label="Employee" required>
					<EmployeePicker v-model="employeeId" required @select="onPick" />
				</UFormField>
				<p class="text-xs text-(--ui-text-muted)">
					Don't see them? <NuxtLink to="/employees/new" class="text-(--ui-primary) hover:underline">
						Add a new employee
					</NuxtLink> and they'll appear in the picker.
				</p>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Period start" required>
						<DateField v-model="periodStart" />
					</UFormField>
					<UFormField label="Period end" required>
						<DateField
							v-model="periodEnd"
							:min-value="periodStart"
						/>
					</UFormField>
				</div>

				<UFormField label="Pay date" required hint="Must fall within the pay period.">
					<DateField
						v-model="payDate"
						:min-value="periodStart"
						:max-value="periodEnd"
					/>
				</UFormField>

				<div v-if="duplicateExists" class="rounded-md border border-(--ui-warning)/40 bg-(--ui-warning)/10 px-3 py-2 text-xs flex items-start gap-2">
					<UIcon name="i-lucide-triangle-alert" class="size-4 text-(--ui-warning) shrink-0 mt-0.5" />
					<div class="flex-1">
						<div>
							A payslip already exists for this employee for the period starting
							<span class="font-medium tabular-nums">{{ periodStart }}</span>.
							Choose a different period, or open the existing one.
						</div>
						<NuxtLink
							v-if="duplicateId"
							:to="`/payslips/${duplicateId}`"
							class="inline-flex items-center gap-1 mt-1 text-(--ui-primary) hover:underline"
						>
							Open existing payslip
							<UIcon name="i-lucide-arrow-right" class="size-3" />
						</NuxtLink>
					</div>
				</div>
			</div>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton type="button" color="neutral" variant="outline" @click="router.push('/payslips')">
						Cancel
					</UButton>
					<UButton
						:loading="creating"
						:disabled="!canCreate"
						icon="i-lucide-plus"
						@click="create"
					>
						Create payslip
					</UButton>
				</div>
			</template>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { EmployeeRow } from "~/stores/employees";
	import { nextPayrollCycle } from "~/lib/payroll-cycle";
	import { useEmployeesStore } from "~/stores/employees";
	import { monthBounds, usePayslipsStore } from "~/stores/payslips";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "New payslip" });

	const router = useRouter();
	const route = useRoute();
	const toast = useToast();
	const store = usePayslipsStore();
	const employeesStore = useEmployeesStore();
	const settingsStore = useSettingsStore();

	await Promise.all([
		store.load(),
		employeesStore.employees.length === 0 ? employeesStore.load() : Promise.resolve(),
		settingsStore.ensureLoaded()
	]);

	// Optional ?employee=ID query — used by the "Create payslip" action on
	// the employees list to preselect.
	const preselectedId = (() => {
		const raw = route.query.employee;
		const v = Array.isArray(raw) ? raw[0] : raw;
		const n = v ? Number(v) : Number.NaN;
		return Number.isFinite(n) ? n : null;
	})();
	const preselected = preselectedId !== null
		? employeesStore.employees.find((e) => e.id === preselectedId) ?? null
		: null;

	const employeeId = ref<number | null>(preselected?.id ?? null);
	const picked = ref<EmployeeRow | null>(preselected);
	const creating = ref(false);

	// Seed the three date fields from the tenant's payroll cycle for
	// "the next pay cycle relative to today". The user can hand-edit
	// any of them — the watchers below still snap things together for
	// off-template inputs, just like before.
	const todayISO = (() => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	})();
	const cycleConfig = {
		payroll_period_start_day: settingsStore.settings?.payroll_period_start_day ?? 1,
		payroll_period_end_day: settingsStore.settings?.payroll_period_end_day ?? 31,
		payroll_pay_day: settingsStore.settings?.payroll_pay_day ?? 31
	};
	const initialCycle = nextPayrollCycle(todayISO, cycleConfig).cycle;
	const periodStart = ref<string | null>(initialCycle.periodStart);
	const periodEnd = ref<string | null>(initialCycle.periodEnd);
	const payDate = ref<string | null>(initialCycle.payDate);

	// When the user changes period_start, snap period_end to the last
	// day of *that* month and pull pay_date in if it has fallen out of
	// the new range. Saves the user from manually fixing two fields
	// every time they shift the period.
	watch(periodStart, (next, prev) => {
		if (!next || next === prev) return;
		const bounds = monthBounds(next);
		periodEnd.value = bounds.end;
		if (!payDate.value || payDate.value < bounds.start) payDate.value = bounds.end;
		else if (payDate.value > bounds.end) payDate.value = bounds.end;
	});

	// If the user shrinks period_end, drag pay_date back into range.
	watch(periodEnd, (next) => {
		if (!next) return;
		if (payDate.value && payDate.value > next) payDate.value = next;
	});

	const onPick = (e: EmployeeRow) => {
		picked.value = e;
	};

	// Soft pre-flight check against the UNIQUE (employee_id, period_start)
	// constraint. Pure UI hint — the DB still owns the truth.
	const duplicate = computed(() => {
		if (employeeId.value === null || !periodStart.value) return null;
		return store.payslips.find((p) =>
			p.employee_id === employeeId.value
			&& p.period_start === periodStart.value
		) ?? null;
	});
	const duplicateExists = computed(() => duplicate.value !== null);
	const duplicateId = computed(() => duplicate.value?.id ?? null);

	const canCreate = computed(() =>
		employeeId.value !== null
		&& periodStart.value !== null
		&& periodEnd.value !== null
		&& payDate.value !== null
		&& !duplicateExists.value
	);

	const create = async () => {
		if (!canCreate.value || employeeId.value === null) return;
		const e = picked.value
			?? employeesStore.employees.find((x) => x.id === employeeId.value)
			?? null;
		if (!e) {
			toast.add({ title: "Employee not found", color: "error", icon: "i-lucide-circle-alert" });
			return;
		}
		creating.value = true;
		try {
			const id = await store.createPayslip({
				employee: {
					id: e.id,
					full_name: e.full_name,
					employee_number: e.employee_number,
					nic: e.nic,
					designation: e.designation,
					email: e.email,
					phone: e.phone,
					address_line1: e.address_line1,
					address_line2: e.address_line2,
					city: e.city,
					postal_code: e.postal_code,
					country: e.country,
					joining_date: e.joining_date,
					basic_salary_cents: e.basic_salary_cents,
					bank_name: e.bank_name,
					bank_branch: e.bank_branch,
					bank_account_number: e.bank_account_number,
					bank_account_name: e.bank_account_name
				},
				periodStart: periodStart.value!,
				periodEnd: periodEnd.value!,
				payDate: payDate.value!
			});
			toast.add({ title: "Payslip created", color: "success", icon: "i-lucide-check" });
			await router.replace(`/payslips/${id}`);
		} catch (err) {
			toast.add({
				title: "Could not create payslip",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			creating.value = false;
		}
	};
</script>
