<template>
	<div class="select-none">
		<FeatureLock v-if="licLocked" title="Payslips" tier-label="Premium" feature="payroll" />
		<!-- Top toolbar row: back link on the left, action cluster on
			the right. Pinned above the title block so buttons can't
			collide with the number / status / employee meta as the
			viewport narrows — same shape as the invoice / quote / bill
			detail pages. -->
		<div class="mb-4 flex items-center justify-between gap-4">
			<NuxtLink to="/payslips" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to payslips
			</NuxtLink>

			<!-- md+ inline cluster. Below md this collapses into a single
				⋯ dropdown so the toolbar stays a tidy two-element row on
				narrow windows; both paths share the same handlers. -->
			<div class="hidden md:flex gap-2 items-center shrink-0">
				<UButton
					v-if="row?.status === 'issued'"
					size="sm"
					color="primary"
					icon="i-lucide-banknote"
					:disabled="licLocked"
					@click="recordPayment"
				>
					Record payment
				</UButton>
				<UButton
					size="sm"
					color="neutral"
					variant="outline"
					icon="i-lucide-file-down"
					:disabled="!row || dirty || pdf.state.rendering"
					:loading="pdf.state.rendering"
					:title="dirty ? 'Save first' : 'Preview this payslip as a PDF'"
					@click="onPdfClick"
				>
					PDF & Print
				</UButton>
				<UButton
					v-if="row?.status === 'draft'"
					size="sm"
					color="neutral"
					variant="outline"
					icon="i-lucide-send"
					:disabled="!canIssue || licLocked"
					:loading="busy"
					@click="markIssued"
				>
					Mark issued
				</UButton>
				<UButton
					v-if="canRevert"
					size="sm"
					color="neutral"
					variant="outline"
					icon="i-lucide-rotate-ccw"
					:disabled="busy || licLocked"
					@click="revertToDraft"
				>
					Revert to draft
				</UButton>
				<UButton
					v-if="canCancel"
					size="sm"
					color="neutral"
					variant="outline"
					icon="i-lucide-circle-x"
					:disabled="busy || licLocked"
					@click="cancel"
				>
					Cancel
				</UButton>

				<!-- Visual separator before the destructive action so the
					delete button doesn't sit shoulder-to-shoulder with the
					everyday actions and get accidentally clicked. -->
				<div class="h-6 w-px bg-(--ui-border-accented) mx-1" />

				<UButton
					size="sm"
					color="error"
					variant="soft"
					icon="i-lucide-trash-2"
					:disabled="busy"
					@click="confirmDelete = true"
				>
					Delete
				</UButton>
			</div>

			<div class="md:hidden shrink-0">
				<UDropdownMenu :items="actionMenuItems">
					<UButton
						size="sm"
						color="neutral"
						variant="outline"
						icon="i-lucide-ellipsis-vertical"
						title="Actions"
						aria-label="Actions"
					/>
				</UDropdownMenu>
			</div>
		</div>

		<!-- Header: number + status + employee + period -->
		<header class="mb-6">
			<h1 class="text-2xl font-semibold flex items-center gap-3 flex-wrap">
				<span class="tabular-nums">{{ row?.number }}</span>
				<StatusBadge v-if="row" :status="derived" size="md" />
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				<span class="font-medium text-(--ui-text)">{{ employee?.full_name }}</span>
				<span v-if="employee?.designation">
					· {{ employee.designation }}
				</span>
				<span class="ml-1">
					· {{ row?.period_start }} → {{ row?.period_end }}
				</span>
			</p>
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
					<!-- Grouped, not evenly distributed: period start + end are ONE
						concept (a range), so they sit tight together at gap-4 and wrap
						as a unit. Pay date is independent — a wider gap-x-8 separates
						it, and it drops to its own row when the column can't take all
						three. It usually can't: inside the card the lg:col-span-2
						column measures 436px against the 543px three-across needs, so
						pay date wraps at lg and rejoins the row at 2xl.

						Sized to content (w-fit) rather than to a share of the row, so
						the fields don't stretch into the even three-way split this
						replaces. Safe because tauri.conf pins minWidth to 1024, so the
						column never drops near the ~165px a field actually needs. -->
					<div class="flex flex-wrap items-start gap-x-8 gap-y-4">
						<div class="flex flex-wrap items-start gap-4">
							<UFormField label="Period start" class="w-fit shrink-0">
								<DateField v-model="form.period_start" :disabled="locked" />
							</UFormField>
							<UFormField label="Period end" class="w-fit shrink-0">
								<DateField v-model="form.period_end" :disabled="locked" />
							</UFormField>
						</div>
						<UFormField label="Pay date" class="w-fit shrink-0">
							<DateField v-model="form.pay_date" :disabled="locked" />
						</UFormField>
					</div>
				</UCard>

				<UCard>
					<template #header>
						<!-- Wraps rather than compressing: title + two switches + the
							lock hint don't fit one line in the lg column, and without
							flex-wrap the title was breaking mid-phrase while the
							controls crushed together. shrink-0 keeps each switch label
							on one line once they do wrap. -->
						<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
							<h2 class="font-semibold">
								Earnings & deductions
							</h2>
							<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
								<label v-if="!locked" class="flex items-center gap-2 text-xs text-(--ui-text-muted) shrink-0">
									Apply EPF / ETF
									<USwitch v-model="statutoryEnabled" />
								</label>
								<label v-if="!locked" class="flex items-center gap-2 text-xs text-(--ui-text-muted) shrink-0">
									Apply PAYE
									<USwitch v-model="payeEnabled" />
								</label>
								<span class="text-xs text-(--ui-text-muted)">
									{{ locked ? `Locked — payslip is ${row?.status}` : "Edit until you mark it issued" }}
								</span>
							</div>
						</div>
					</template>
					<PayslipLineEditor
						v-model="form.lines"
						:disabled="locked"
						:statutory-enabled="statutoryEnabled"
						:rates="statRates"
						:epf-employee-rate-bp="statRates.epfEmployeeBp"
						:paye-enabled="payeEnabled"
						:paye-config="payeConfig"
						:paye-deduct-epf="payeDeductEpf"
					/>
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
						<div class="flex items-center justify-between gap-2">
							<h2 class="font-semibold">
								Employee
							</h2>
							<NuxtLink
								v-if="row?.employee_id"
								:to="`/employees/${row.employee_id}`"
								class="text-xs text-(--ui-primary) hover:underline inline-flex items-center gap-1"
							>
								<UIcon name="i-lucide-external-link" class="size-3" />
								Open record
							</NuxtLink>
						</div>
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
						<div v-if="employee?.employee_number">
							<dt class="text-xs text-(--ui-text-muted)">
								Employee #
							</dt>
							<dd class="tabular-nums">
								{{ employee.employee_number }}
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
						<!-- Two-line row: voucher number + amount on the
							top line, secondary metadata (date · method)
							muted underneath. Amount is right-aligned and
							gets the visual weight; the date no longer
							floats awkwardly between two strong fields. -->
						<li
							v-for="v in payments"
							:key="v.id"
							class="py-2.5"
						>
							<div class="flex items-center justify-between gap-3">
								<NuxtLink
									:to="`/vouchers/${v.id}`"
									class="font-medium tabular-nums hover:text-(--ui-primary)"
								>
									{{ v.number }}
								</NuxtLink>
								<span class="font-medium tabular-nums">{{ formatMoney(v.amount_cents) }}</span>
							</div>
							<div class="text-xs text-(--ui-text-muted) mt-0.5 tabular-nums">
								{{ v.voucher_date }}<template v-if="paymentMethodLabel(v.payment_method)">
									· {{ paymentMethodLabel(v.payment_method) }}
								</template>
							</div>
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
					<UButton :loading="saving" :disabled="!dirty || licLocked" icon="i-lucide-save" @click="onSave">
						{{ locked ? "Save notes" : "Save changes" }}
					</UButton>
				</div>
			</div>
		</div>

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:temp-path="pdf.state.tempPath"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Payslip PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>

		<!-- Delete confirmation. Plain double-confirm — no typed-name
			gate; payslips are easy to recreate from the bulk page if a
			delete was accidental, and the gate just slowed the user
			down for the common case. -->
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
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="ghost" @click="confirmDelete = false">
						Cancel
					</UButton>
					<UButton
						color="error"
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
	import type { PayeBracket, PayeConfig } from "~/lib/statutory";
	import type { EmployeeSnapshot, PayslipLineDraft, PayslipLineRow, PayslipRow } from "~/stores/payslips";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { usePdfPreview } from "~/composables/usePdfPreview";
	import { formatMoney } from "~/lib/money";
	import { buildPayslipPdfPayload } from "~/lib/payslip-pdf";
	import { computePaye, computeStatutory } from "~/lib/statutory";
	import { useLicenseStore } from "~/stores/license";
	import { usePayslipsStore } from "~/stores/payslips";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Payslip" });

	const route = useRoute();
	const router = useRouter();
	const store = usePayslipsStore();
	const vouchersStore = useVouchersStore();
	const settingsStore = useSettingsStore();
	const currency = useActiveCurrency();
	const toast = useToast();
	const license = useLicenseStore();
	const licLocked = computed(() => !license.hasFeature("payroll"));

	const idParam = String(route.params.id ?? "");
	const payslipId = Number(idParam);
	if (!Number.isFinite(payslipId) || payslipId <= 0) {
		throw createError({ statusCode: 404, statusMessage: "Payslip not found" });
	}

	// Make sure the vouchers store has loaded so derived paid-state
	// works without flicker. ensureLoaded dedupes concurrent calls
	// and is a no-op on subsequent visits — only the first /payslips/[id]
	// open per session cold-starts the vouchers store.
	await vouchersStore.ensureLoaded();
	// Settings drive theme color, PDF font, business name, header logo.
	await settingsStore.ensureLoaded();

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
			amount_cents: l.amount_cents,
			epf_liable: l.epf_liable,
			auto_source: l.auto_source
		}));

	// Declared before hydrate() so the async hydrate() call can write to it.
	// Per-payslip toggle, defaulting to the row value (seeded from settings
	// at create). A local ref so the editor toggle can flip it live.
	const statutoryEnabled = ref<boolean>(false);
	const payeEnabled = ref<boolean>(false);

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
		statutoryEnabled.value = (r.statutory_enabled ?? 0) === 1;
		payeEnabled.value = (r.paye_enabled ?? 0) === 1;
	};

	await hydrate();

	const formSnapshot = computed(() => JSON.stringify({ ...form, statutoryEnabled: statutoryEnabled.value, payeEnabled: payeEnabled.value }));
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};

	// Kept-alive page: setup (and the hydrate above) runs once, so re-hydrate
	// on every re-activation — see useRehydrateOnActivate for what goes stale.
	// (Below `dirty` because that's a computed declared after hydrate; and it
	// re-baselines, exactly like every other hydrate call on this page.)
	useRehydrateOnActivate({
		isDirty: () => dirty.value,
		exists: async () => (await store.get(payslipId)) != null,
		rehydrate: async () => {
			await hydrate();
			refreshBaseline();
		},
		noun: "payslip",
		listRoute: "/payslips"
	});

	const derived = computed(() => row.value ? store.derivedStatus(row.value) : "draft");
	const locked = computed(() => row.value?.status !== "draft");

	const statRates = computed(() => ({
		epfEmployeeBp: settingsStore.settings?.epf_employee_rate_bp ?? 800,
		epfEmployerBp: settingsStore.settings?.epf_employer_rate_bp ?? 1200,
		etfBp: settingsStore.settings?.etf_rate_bp ?? 300
	}));

	// PAYE config from settings (parsed once per settings change).
	const payeConfig = computed<PayeConfig>(() => {
		let brackets: PayeBracket[] = [];
		try {
			brackets = JSON.parse(settingsStore.settings?.paye_brackets ?? "[]") as PayeBracket[];
		} catch {
			brackets = [];
		}
		return { reliefCents: settingsStore.settings?.paye_relief_cents ?? 15_000_000, brackets };
	});
	const payeDeductEpf = computed(() => (settingsStore.settings?.paye_deduct_epf ?? 1) === 1);

	const paidCents = computed(() => row.value ? store.paidCentsFor(row.value.id) : 0);
	const balanceCents = computed(() => row.value ? store.balanceCentsFor(row.value) : 0);
	const payments = computed(() => row.value ? store.linkedPayments(row.value.id) : []);

	// Cancel is offered only when the store would actually allow it.
	// The store FSM refuses cancel on an issued payslip with linked
	// payments (caller must delete the vouchers first); reflecting
	// that here keeps the button from being a dead-end click.
	const canCancel = computed(() => {
		if (!row.value || row.value.status === "cancelled") return false;
		if (row.value.status === "issued" && paidCents.value > 0) return false;
		return true;
	});

	// Revert-to-draft mirrors the same store guard: issued needs zero
	// payments; cancelled always qualifies (cancel already required
	// deleting any payments).
	const canRevert = computed(() => {
		if (!row.value) return false;
		if (row.value.status === "issued") return paidCents.value === 0;
		return row.value.status === "cancelled";
	});

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

	const onSave = async () => {
		if (!row.value) return;
		saving.value = true;
		try {
			if (locked.value) {
				// Issued / cancelled payslips are immutable except for the
				// notes field — we persist that and nothing else, even if
				// the form's other slots somehow ended up dirty.
				await store.update(row.value.id, {
					notes: form.notes.trim() || null
				});
			} else {
				const totals = await store.replaceLines(row.value.id, form.lines);
				const liableBase = form.lines
					.filter((l) => l.kind === "earning" && (l.epf_liable ?? 1) === 1)
					.reduce((s, l) => s + l.amount_cents, 0);
				const stat = statutoryEnabled.value
					? computeStatutory(liableBase, statRates.value)
					: { baseCents: 0, epfEmployeeCents: 0, epfEmployerCents: 0, etfCents: 0 };
				const grossEarnings = form.lines
					.filter((l) => l.kind === "earning")
					.reduce((s, l) => s + l.amount_cents, 0);
				const payeBase = grossEarnings - (payeDeductEpf.value ? stat.epfEmployeeCents : 0);
				const payeCents = payeEnabled.value ? computePaye(payeBase, payeConfig.value) : 0;
				await store.update(row.value.id, {
					period_start: form.period_start ?? row.value.period_start,
					period_end: form.period_end ?? row.value.period_end,
					pay_date: form.pay_date ?? row.value.pay_date,
					notes: form.notes.trim() || null,
					earnings_cents: totals.earnings_cents,
					deductions_cents: totals.deductions_cents,
					net_cents: totals.net_cents,
					epf_employee_cents: stat.epfEmployeeCents,
					epf_employer_cents: stat.epfEmployerCents,
					etf_cents: stat.etfCents,
					statutory_enabled: statutoryEnabled.value ? 1 : 0,
					paye_cents: payeCents,
					paye_enabled: payeEnabled.value ? 1 : 0
				});
			}
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

	// Revert to draft — unlocks the form for a full re-edit. Offered on
	// issued-with-no-payments and cancelled; the store refuses with
	// payments as the backstop (delete the vouchers first).
	const revertToDraft = async () => {
		if (!row.value) return;
		busy.value = true;
		try {
			await store.setStatus(row.value.id, "draft");
			await hydrate();
			refreshBaseline();
			toast.add({ title: "Reverted to draft", color: "info", icon: "i-lucide-rotate-ccw" });
		} catch (err) {
			toast.add({
				title: "Could not revert",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			busy.value = false;
		}
	};

	// Friendly label for a voucher's payment_method, used as the
	// muted secondary line in the Payments panel.
	const paymentMethodLabel = (m: string | null): string | null => {
		if (!m) return null;
		const map: Record<string, string> = {
			bank_transfer: "Bank transfer",
			cash: "Cash",
			cheque: "Cheque",
			card: "Card",
			other: "Other"
		};
		return map[m] ?? m;
	};

	const recordPayment = () => {
		if (!row.value) return;
		router.push(`/vouchers/new?payslip=${row.value.id}`);
	};

	// PDF rendering. The detail page passes the *editor's* lines (so an
	// unsaved tweak is reflected in the preview) rather than re-fetching
	// from the DB; the shared builder accepts whatever line list we hand
	// it. The list page uses the same builder with DB-fetched lines.
	const buildPdfPayload = () => {
		if (!row.value) return {};
		return buildPayslipPdfPayload({
			row: row.value,
			lines: form.lines,
			settings: settingsStore.settings,
			currency: currency.value,
			paidCents: paidCents.value,
			balanceCents: balanceCents.value,
			entitledToTemplates: license.hasFeature("pdf_templates")
		});
	};

	const pdf = usePdfPreview({
		command: "export_payslip_pdf",
		buildPayload: () => buildPdfPayload(),
		fileName: () => `${row.value?.number ?? "payslip"}.pdf`,
		title: "Payslip PDF preview"
	});

	const onPdfClick = () => {
		if (!row.value || dirty.value) return;
		pdf.open();
	};

	// Navigating away does NOT tear this page down — app.vue renders
	// <NuxtPage keepalive>, so the component is cached and every ref survives.
	// Anything left set here comes back the next time the page activates, which
	// is why the confirm modal has to be closed and `busy` cleared explicitly
	// rather than relying on unmount. Leaving them set reopened the dialog with
	// a spinning Delete button on the next payslip the user viewed.
	const onDelete = async () => {
		if (!row.value) return;
		busy.value = true;
		try {
			await store.remove(row.value.id);
			confirmDelete.value = false;
			toast.add({ title: "Payslip deleted", color: "info", icon: "i-lucide-trash-2" });
			await router.replace("/payslips");
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			busy.value = false;
		}
	};

	// Items rendered into the responsive UDropdownMenu shown below md
	// (the inline cluster above is hidden at that width). Grouped so
	// the dropdown draws separators between Record-payment + PDF,
	// transitions (Mark issued / Cancel), and Delete. Declared at the
	// end so the handlers it references are already in scope.
	interface ActionItem {
		label: string
		icon: string
		disabled?: boolean
		class?: string
		onSelect: () => void
	}
	const actionMenuItems = computed(() => {
		const primary: ActionItem[] = [];
		if (row.value?.status === "issued") {
			primary.push({
				label: "Record payment",
				icon: "i-lucide-banknote",
				disabled: licLocked.value,
				onSelect: recordPayment
			});
		}
		primary.push({
			label: "PDF & Print",
			icon: "i-lucide-file-down",
			disabled: !row.value || dirty.value || pdf.state.rendering,
			onSelect: onPdfClick
		});

		const transitions: ActionItem[] = [];
		if (row.value?.status === "draft") {
			transitions.push({
				label: "Mark issued",
				icon: "i-lucide-send",
				disabled: !canIssue.value || busy.value || licLocked.value,
				onSelect: markIssued
			});
		}
		if (canCancel.value) {
			transitions.push({
				label: "Cancel",
				icon: "i-lucide-circle-x",
				disabled: busy.value || licLocked.value,
				onSelect: cancel
			});
		}

		const destructive: ActionItem[] = [{
			label: "Delete",
			icon: "i-lucide-trash-2",
			disabled: busy.value,
			class: "text-(--ui-error) hover:bg-(--ui-error)/10 [&>span>span:first-child]:text-(--ui-error)",
			onSelect: () => {
				confirmDelete.value = true;
			}
		}];

		return [primary, transitions, destructive].filter((g) => g.length > 0);
	});
</script>
