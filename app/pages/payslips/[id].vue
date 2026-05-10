<template>
	<div>
		<NuxtLink to="/payslips" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1 mb-4">
			<UIcon name="i-lucide-arrow-left" class="size-4" />
			Back to payslips
		</NuxtLink>

		<!-- Header: number + status + employee + period -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div class="min-w-0">
				<div class="flex items-center gap-2 flex-wrap">
					<h1 class="text-2xl font-semibold tabular-nums truncate">
						{{ row?.number }}
					</h1>
					<StatusBadge v-if="row" :status="derived" />
				</div>
				<p class="text-sm text-(--ui-text-muted) mt-1">
					<span class="font-medium text-(--ui-text)">{{ employee?.full_name }}</span>
					<span v-if="employee?.designation">
						· {{ employee.designation }}
					</span>
					<span class="ml-1">
						· {{ row?.period_start }} → {{ row?.period_end }}
					</span>
				</p>
			</div>

			<div class="flex items-center gap-2 flex-wrap">
				<UButton
					v-if="row?.status === 'draft'"
					icon="i-lucide-send"
					:disabled="!canIssue"
					:loading="busy"
					@click="markIssued"
				>
					Mark issued
				</UButton>
				<UButton
					v-if="row?.status === 'issued'"
					icon="i-lucide-banknote"
					color="success"
					@click="recordPayment"
				>
					Record payment
				</UButton>
				<UButton
					v-if="row && row.status !== 'cancelled'"
					icon="i-lucide-circle-x"
					variant="soft"
					color="neutral"
					:disabled="busy"
					@click="cancel"
				>
					Cancel
				</UButton>
				<UButton
					icon="i-lucide-trash-2"
					variant="soft"
					color="error"
					:disabled="busy"
					@click="confirmDelete = true"
				>
					Delete
				</UButton>
			</div>
		</header>

		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- Lines + period -->
			<div class="lg:col-span-2 space-y-6">
				<UCard>
					<template #header>
						<div class="flex items-center justify-between">
							<h2 class="font-semibold">
								Period
							</h2>
							<span class="text-xs text-(--ui-text-muted)">Editable until issued</span>
						</div>
					</template>
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<UFormField label="Period start">
							<DateField v-model="form.period_start" :disabled="locked" />
						</UFormField>
						<UFormField label="Period end">
							<DateField v-model="form.period_end" :disabled="locked" />
						</UFormField>
						<UFormField label="Pay date">
							<DateField v-model="form.pay_date" :disabled="locked" />
						</UFormField>
					</div>
				</UCard>

				<UCard>
					<template #header>
						<div class="flex items-center justify-between">
							<h2 class="font-semibold">
								Earnings & deductions
							</h2>
							<span class="text-xs text-(--ui-text-muted)">
								{{ locked ? `Locked — payslip is ${row?.status}` : "Edit until you mark it issued" }}
							</span>
						</div>
					</template>
					<PayslipLineEditor v-model="form.lines" :disabled="locked" />
				</UCard>

				<UCard>
					<template #header>
						<h2 class="font-semibold">
							Notes
						</h2>
					</template>
					<UFormField>
						<UTextarea
							v-model="form.notes"
							:rows="3"
							placeholder="Optional internal note for this payslip — not printed unless you copy it onto the PDF."
							class="w-full"
						/>
					</UFormField>
				</UCard>
			</div>

			<!-- Side panel: employee snapshot + payments -->
			<div class="space-y-6">
				<UCard>
					<template #header>
						<h2 class="font-semibold">
							Employee
						</h2>
					</template>
					<dl class="text-sm space-y-1.5">
						<div>
							<dt class="text-xs text-(--ui-text-muted)">
								Name
							</dt>
							<dd class="font-medium">
								{{ employee?.full_name }}
							</dd>
						</div>
						<div v-if="employee?.designation">
							<dt class="text-xs text-(--ui-text-muted)">
								Designation
							</dt>
							<dd>{{ employee.designation }}</dd>
						</div>
						<div v-if="employee?.nic">
							<dt class="text-xs text-(--ui-text-muted)">
								NIC
							</dt>
							<dd class="tabular-nums">
								{{ employee.nic }}
							</dd>
						</div>
						<div v-if="employee?.bank_account_number">
							<dt class="text-xs text-(--ui-text-muted)">
								Bank
							</dt>
							<dd>
								{{ [employee.bank_name, employee.bank_branch].filter(Boolean).join(", ") }}<br>
								<span class="tabular-nums text-(--ui-text-muted) text-xs">
									{{ employee.bank_account_number }} · {{ employee.bank_account_name }}
								</span>
							</dd>
						</div>
					</dl>
					<p class="text-xs text-(--ui-text-muted) mt-3 pt-3 border-t border-(--ui-border)">
						Snapshot frozen at create time. Editing the employee record after issuing this payslip does not rewrite history.
					</p>
				</UCard>

				<UCard>
					<template #header>
						<div class="flex items-center justify-between">
							<h2 class="font-semibold">
								Payments
							</h2>
							<UBadge color="neutral" variant="subtle" size="sm">
								{{ payments.length }}
							</UBadge>
						</div>
					</template>
					<div v-if="payments.length === 0" class="text-sm text-(--ui-text-muted) py-2">
						No payments recorded yet.
					</div>
					<ul v-else class="text-sm divide-y divide-(--ui-border)">
						<li
							v-for="v in payments"
							:key="v.id"
							class="py-2 flex items-center justify-between gap-3"
						>
							<NuxtLink
								:to="`/vouchers/${v.id}`"
								class="font-medium tabular-nums hover:text-(--ui-primary)"
							>
								{{ v.number }}
							</NuxtLink>
							<span class="text-xs text-(--ui-text-muted)">{{ v.voucher_date }}</span>
							<span class="font-medium tabular-nums">{{ formatMoney(v.amount_cents) }}</span>
						</li>
					</ul>
					<div v-if="row" class="mt-3 pt-3 border-t border-(--ui-border) text-sm tabular-nums">
						<div class="flex justify-between">
							<span class="text-(--ui-text-muted)">Net pay</span>
							<span>{{ formatMoney(row.net_cents) }}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-(--ui-text-muted)">Paid</span>
							<span class="text-(--ui-success)">{{ formatMoney(paidCents) }}</span>
						</div>
						<div class="flex justify-between font-semibold">
							<span>Balance</span>
							<span :class="balanceCents === 0 ? 'text-(--ui-success)' : ''">
								{{ formatMoney(balanceCents) }}
							</span>
						</div>
					</div>
				</UCard>
			</div>
		</div>

		<!-- Sticky save bar -->
		<div
			class="sticky bottom-0 -mx-2 mt-6 transition-all duration-200"
			:class="dirty
				? 'opacity-100 translate-y-0 pointer-events-auto'
				: 'opacity-0 translate-y-3 pointer-events-none'"
		>
			<div class="rounded-xl backdrop-blur-md bg-(--ui-bg)/90 border border-(--ui-border) shadow-lg px-4 py-3 flex items-center justify-between gap-4">
				<div class="flex items-center gap-2 text-sm">
					<span class="relative flex size-2">
						<span class="absolute inline-flex h-full w-full rounded-full bg-(--ui-warning) opacity-75 animate-ping" />
						<span class="relative inline-flex size-2 rounded-full bg-(--ui-warning)" />
					</span>
					<span>Unsaved changes</span>
				</div>
				<div class="flex items-center gap-2">
					<UButton variant="ghost" color="neutral" :disabled="saving" @click="onDiscard">
						Discard
					</UButton>
					<UButton :loading="saving" :disabled="!dirty || locked" icon="i-lucide-save" @click="onSave">
						Save changes
					</UButton>
				</div>
			</div>
		</div>

		<!-- Delete confirmation -->
		<UModal v-model:open="confirmDelete" title="Delete this payslip?">
			<template #body>
				<div class="space-y-3 text-sm">
					<p>
						This permanently removes payslip <span class="font-medium tabular-nums">{{ row?.number }}</span>.
						Any payment vouchers stay in the books but lose their link
						back to this payslip.
					</p>
					<p v-if="payments.length > 0" class="text-(--ui-warning)">
						Heads up: {{ payments.length }} payment voucher(s) link to this payslip.
					</p>
					<p>Type the payslip number to confirm:</p>
					<UInput v-model="confirmText" :placeholder="row?.number" />
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="ghost" @click="confirmDelete = false">
						Cancel
					</UButton>
					<UButton
						color="error"
						:disabled="confirmText !== row?.number"
						:loading="busy"
						icon="i-lucide-trash-2"
						@click="onDelete"
					>
						Delete payslip
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
	import type { EmployeeSnapshot, PayslipLineDraft, PayslipLineRow, PayslipRow } from "~/stores/payslips";
	import { formatMoney } from "~/lib/money";
	import { usePayslipsStore } from "~/stores/payslips";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Payslip" });

	const route = useRoute();
	const router = useRouter();
	const store = usePayslipsStore();
	const vouchersStore = useVouchersStore();
	const toast = useToast();

	const idParam = String(route.params.id ?? "");
	const payslipId = Number(idParam);
	if (!Number.isFinite(payslipId) || payslipId <= 0) {
		throw createError({ statusCode: 404, statusMessage: "Payslip not found" });
	}

	// Make sure the vouchers store has loaded so derived paid-state
	// works without flicker.
	if (vouchersStore.vouchers.length === 0) await vouchersStore.load();

	const row = ref<PayslipRow | null>(null);
	const employee = computed<EmployeeSnapshot | null>(() => {
		if (!row.value) return null;
		try {
			return JSON.parse(row.value.employee_snapshot) as EmployeeSnapshot;
		} catch {
			return null;
		}
	});

	interface FormState {
		period_start: string | null
		period_end: string | null
		pay_date: string | null
		notes: string
		lines: PayslipLineDraft[]
	}

	const form = reactive<FormState>({
		period_start: null,
		period_end: null,
		pay_date: null,
		notes: "",
		lines: []
	});

	const linesToDrafts = (lines: PayslipLineRow[]): PayslipLineDraft[] =>
		lines.map((l) => ({
			sort_order: l.sort_order,
			kind: l.kind,
			label: l.label,
			amount_cents: l.amount_cents
		}));

	const hydrate = async () => {
		const r = await store.get(payslipId);
		if (!r) throw createError({ statusCode: 404, statusMessage: "Payslip not found" });
		row.value = r;
		form.period_start = r.period_start;
		form.period_end = r.period_end;
		form.pay_date = r.pay_date;
		form.notes = r.notes ?? "";
		const lines = await store.getLines(payslipId);
		form.lines = linesToDrafts(lines);
	};

	await hydrate();

	const formSnapshot = computed(() => JSON.stringify(form));
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};

	const derived = computed(() => row.value ? store.derivedStatus(row.value) : "draft");
	const locked = computed(() => row.value?.status !== "draft");

	const paidCents = computed(() => row.value ? store.paidCentsFor(row.value.id) : 0);
	const balanceCents = computed(() => row.value ? store.balanceCentsFor(row.value) : 0);
	const payments = computed(() => row.value ? store.linkedPayments(row.value.id) : []);

	const canIssue = computed(() => {
		if (!row.value) return false;
		if (row.value.status !== "draft") return false;
		// Need at least one line and a non-zero net pay before issuing.
		const earnings = form.lines.filter((l) => l.kind === "earning").reduce((s, l) => s + l.amount_cents, 0);
		const deductions = form.lines.filter((l) => l.kind === "deduction").reduce((s, l) => s + l.amount_cents, 0);
		return Math.max(0, earnings - deductions) > 0;
	});

	const saving = ref(false);
	const busy = ref(false);
	const confirmDelete = ref(false);
	const confirmText = ref("");

	const onSave = async () => {
		if (!row.value || locked.value) return;
		saving.value = true;
		try {
			const totals = await store.replaceLines(row.value.id, form.lines);
			await store.update(row.value.id, {
				period_start: form.period_start ?? row.value.period_start,
				period_end: form.period_end ?? row.value.period_end,
				pay_date: form.pay_date ?? row.value.pay_date,
				notes: form.notes.trim() || null,
				earnings_cents: totals.earnings_cents,
				deductions_cents: totals.deductions_cents,
				net_cents: totals.net_cents
			});
			await store.load();
			await hydrate();
			refreshBaseline();
			toast.add({ title: "Payslip saved", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Save failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			saving.value = false;
		}
	};

	const onDiscard = async () => {
		await hydrate();
		refreshBaseline();
	};

	const markIssued = async () => {
		if (!row.value) return;
		// Force a save first so the issued payslip carries whatever lines /
		// dates the user has on screen — otherwise we'd issue last-saved
		// state, surprising the user.
		if (dirty.value) await onSave();
		busy.value = true;
		try {
			await store.setStatus(row.value.id, "issued");
			await hydrate();
			refreshBaseline();
			toast.add({ title: "Payslip issued", color: "success", icon: "i-lucide-send" });
		} catch (err) {
			toast.add({
				title: "Could not issue",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			busy.value = false;
		}
	};

	const cancel = async () => {
		if (!row.value) return;
		busy.value = true;
		try {
			await store.setStatus(row.value.id, "cancelled");
			await hydrate();
			refreshBaseline();
			toast.add({ title: "Payslip cancelled", color: "info", icon: "i-lucide-circle-x" });
		} catch (err) {
			toast.add({
				title: "Could not cancel",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			busy.value = false;
		}
	};

	const recordPayment = () => {
		if (!row.value) return;
		router.push(`/vouchers/new?payslip=${row.value.id}`);
	};

	const onDelete = async () => {
		if (!row.value) return;
		busy.value = true;
		try {
			await store.remove(row.value.id);
			toast.add({ title: "Payslip deleted", color: "info", icon: "i-lucide-trash-2" });
			await router.replace("/payslips");
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
			busy.value = false;
		}
	};
</script>
