<template>
	<div class="space-y-6">
		<!-- Earnings -->
		<section>
			<header class="flex items-start justify-between gap-3 mb-3">
				<div class="min-w-0">
					<h3 class="font-semibold text-(--ui-success)">
						<UIcon name="i-lucide-arrow-down-to-line" class="size-4 align-text-bottom mr-1" />
						Earnings
					</h3>
					<p class="text-xs text-(--ui-text-muted)">
						Basic, allowances, overtime, bonuses — anything that adds to the gross.
					</p>
				</div>
				<UButton
					size="xs"
					variant="soft"
					color="neutral"
					icon="i-lucide-plus"
					class="shrink-0 whitespace-nowrap"
					:disabled="disabled"
					@click="addLine('earning')"
				>
					Add earning
				</UButton>
			</header>
			<div v-if="earningLines.length === 0" class="text-sm text-(--ui-text-muted) py-2">
				No earning lines yet.
			</div>
			<div v-else class="space-y-2">
				<div
					v-for="(line, idx) in earningLines"
					:key="`earn-${earningIndices[idx]}`"
					class="grid grid-cols-[1fr_auto_180px_auto] gap-2 items-center"
				>
					<UInput
						v-model="line.label"
						placeholder="e.g. Basic, Travel allowance, Overtime"
						:disabled="disabled"
						@input="onChange"
					/>
					<UCheckbox
						:model-value="line.epf_liable === 1"
						:disabled="disabled || !statutoryEnabled"
						label="EPF"
						title="Include this earning in the EPF/ETF base"
						@update:model-value="(v) => setEpfLiable(line, v)"
					/>
					<MoneyInput
						v-model="line.amount_cents"
						:disabled="disabled"
						@update:model-value="onChange"
					/>
					<UButton
						icon="i-lucide-trash-2"
						variant="ghost"
						color="neutral"
						size="xs"
						:disabled="disabled"
						aria-label="Remove line"
						@click="removeAt(earningIndices[idx]!)"
					/>
				</div>
			</div>
			<div class="mt-3 flex justify-end text-sm tabular-nums">
				<span class="text-(--ui-text-muted) mr-3">Earnings subtotal</span>
				<span class="font-semibold text-(--ui-success)">{{ formatMoney(earningsTotal) }}</span>
			</div>
		</section>

		<!-- Deductions -->
		<section>
			<header class="flex items-start justify-between gap-3 mb-3">
				<div class="min-w-0">
					<h3 class="font-semibold text-(--ui-error)">
						<UIcon name="i-lucide-arrow-up-from-line" class="size-4 align-text-bottom mr-1" />
						Deductions
					</h3>
					<p class="text-xs text-(--ui-text-muted)">
						EPF, PAYE, salary advances, no-pay leave — anything that reduces the net.
					</p>
				</div>
				<UButton
					size="xs"
					variant="soft"
					color="neutral"
					icon="i-lucide-plus"
					class="shrink-0 whitespace-nowrap"
					:disabled="disabled"
					@click="addLine('deduction')"
				>
					Add deduction
				</UButton>
			</header>
			<div v-if="deductionLines.length === 0" class="text-sm text-(--ui-text-muted) py-2">
				No deduction lines yet.
			</div>
			<div v-else class="space-y-2">
				<div
					v-for="(line, idx) in deductionLines"
					:key="`ded-${deductionIndices[idx]}`"
					class="grid grid-cols-[1fr_180px_auto] gap-2 items-center"
				>
					<UInput
						v-model="line.label"
						placeholder="e.g. EPF (8%), PAYE, Salary advance"
						:disabled="disabled || line.auto_source === 'epf_employee' || line.auto_source === 'paye'"
						@input="onChange"
					/>
					<MoneyInput
						v-model="line.amount_cents"
						:disabled="disabled || line.auto_source === 'epf_employee' || line.auto_source === 'paye'"
						@update:model-value="onChange"
					/>
					<UButton
						v-if="line.auto_source === 'epf_employee' || line.auto_source === 'paye'"
						icon="i-lucide-lock"
						variant="ghost"
						color="neutral"
						size="xs"
						disabled
						aria-label="Auto-computed — not editable"
						title="Auto-computed from the statutory settings"
					/>
					<UButton
						v-else
						icon="i-lucide-trash-2"
						variant="ghost"
						color="neutral"
						size="xs"
						:disabled="disabled"
						aria-label="Remove line"
						@click="removeAt(deductionIndices[idx]!)"
					/>
				</div>
			</div>
			<div class="mt-3 flex justify-end text-sm tabular-nums">
				<span class="text-(--ui-text-muted) mr-3">Deductions subtotal</span>
				<span class="font-semibold text-(--ui-error)">{{ formatMoney(deductionsTotal) }}</span>
			</div>
		</section>

		<!-- Net -->
		<div class="border-t border-(--ui-border) pt-4 flex justify-between items-baseline">
			<span class="text-base font-semibold">Net pay</span>
			<span class="text-2xl font-bold tabular-nums">{{ formatMoney(net) }}</span>
		</div>

		<!-- Employer contributions — not deducted from net; shown for the
			true cost of employment. -->
		<div
			v-if="statutoryEnabled && (employer.epfEmployerCents > 0 || employer.etfCents > 0)"
			class="border-t border-(--ui-border) pt-4 space-y-1 text-sm tabular-nums"
		>
			<div class="text-xs uppercase tracking-wide text-(--ui-text-muted)">
				Employer contributions (not deducted)
			</div>
			<div class="flex justify-between">
				<span class="text-(--ui-text-muted)">EPF (employer)</span>
				<span>{{ formatMoney(employer.epfEmployerCents) }}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-(--ui-text-muted)">ETF (employer)</span>
				<span>{{ formatMoney(employer.etfCents) }}</span>
			</div>
			<div class="flex justify-between font-medium pt-1">
				<span>Total cost of employment</span>
				<span>{{ formatMoney(earningsTotal + employer.epfEmployerCents + employer.etfCents) }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import type { PayeConfig, StatutoryRates } from "~/lib/statutory";
	import type { PayslipLineDraft } from "~/stores/payslips";
	import { formatMoney, formatRate } from "~/lib/money";
	import { computePaye, computeStatutory } from "~/lib/statutory";

	interface Props {
		modelValue: PayslipLineDraft[]
		disabled?: boolean
		statutoryEnabled?: boolean
		rates?: StatutoryRates
		epfEmployeeRateBp?: number
		payeEnabled?: boolean
		payeConfig?: PayeConfig
		payeDeductEpf?: boolean
		/**
		 * Employer figures FROZEN on the payslip row at issue time. Pass on an
		 * issued / cancelled payslip; when set they are shown verbatim instead
		 * of being recomputed from `rates`.
		 */
		frozenEmployer?: { epfEmployerCents: number, etfCents: number } | null
	}
	const props = withDefaults(defineProps<Props>(), {
		frozenEmployer: null,
		disabled: false,
		statutoryEnabled: false,
		rates: () => ({ epfEmployeeBp: 800, epfEmployerBp: 1200, etfBp: 300 }),
		epfEmployeeRateBp: 800,
		payeEnabled: false,
		payeConfig: () => ({ reliefCents: 15_000_000, brackets: [] }),
		payeDeductEpf: true
	});
	const emit = defineEmits<{ "update:modelValue": [value: PayslipLineDraft[]] }>();

	// Local mutable copy. We re-emit on every change so the parent's
	// dirty-tracker can do its thing. Using reactive() on the array
	// means UInput v-model writes propagate immediately.
	const lines = reactive<PayslipLineDraft[]>(
		props.modelValue.map((l, i) => ({ ...l, sort_order: i, epf_liable: l.epf_liable ?? 1, auto_source: l.auto_source ?? null }))
	);

	// Keep local in sync if the parent resets the model (e.g. on
	// hydrate / discard). Cheap structural compare via JSON.
	watch(() => props.modelValue, (next) => {
		if (JSON.stringify(next) === JSON.stringify(lines)) return;
		lines.splice(0, lines.length, ...next.map((l, i) => ({ ...l, sort_order: i, epf_liable: l.epf_liable ?? 1, auto_source: l.auto_source ?? null })));
	}, { deep: true });

	// EPF-liable earnings base = Σ earning lines flagged epf_liable.
	const liableBase = () =>
		lines
			.filter((l) => l.kind === "earning" && (l.epf_liable ?? 1) === 1)
			.reduce((s, l) => s + (l.amount_cents || 0), 0);

	// Gross = Σ all earning lines (PAYE base, before optional EPF subtraction).
	const grossEarnings = () =>
		lines
			.filter((l) => l.kind === "earning")
			.reduce((s, l) => s + (l.amount_cents || 0), 0);

	// Insert / update / remove the machine-owned deduction lines so they
	// always reflect current earnings. Manual lines are untouched. No-op
	// while disabled (issued/cancelled payslips are immutable). EPF is synced
	// FIRST because the PAYE base may subtract the computed EPF amount.
	const syncManagedLine = () => {
		if (props.disabled) return;

		// --- EPF (employee) managed deduction line ---
		const epfIdx = lines.findIndex((l) => l.auto_source === "epf_employee");
		let epfEmployeeCents = 0;
		if (props.statutoryEnabled) {
			epfEmployeeCents = computeStatutory(liableBase(), props.rates).epfEmployeeCents;
		}
		if (epfEmployeeCents > 0) {
			const label = `EPF (${formatRate(props.epfEmployeeRateBp)})`;
			if (epfIdx === -1) {
				lines.push({ sort_order: lines.length, kind: "deduction", label, amount_cents: epfEmployeeCents, epf_liable: 0, auto_source: "epf_employee" });
			} else {
				lines[epfIdx]!.label = label;
				lines[epfIdx]!.amount_cents = epfEmployeeCents;
			}
		} else if (epfIdx !== -1) {
			lines.splice(epfIdx, 1);
		}

		// --- PAYE (APIT) managed deduction line ---
		const payeIdx = lines.findIndex((l) => l.auto_source === "paye");
		let payeCents = 0;
		if (props.payeEnabled) {
			const payeBase = grossEarnings() - (props.payeDeductEpf ? epfEmployeeCents : 0);
			payeCents = computePaye(payeBase, props.payeConfig);
		}
		if (payeCents > 0) {
			if (payeIdx === -1) {
				lines.push({ sort_order: lines.length, kind: "deduction", label: "PAYE (APIT)", amount_cents: payeCents, epf_liable: 0, auto_source: "paye" });
			} else {
				lines[payeIdx]!.amount_cents = payeCents;
			}
		} else if (payeIdx !== -1) {
			lines.splice(payeIdx, 1);
		}
	};

	// Employer-side figures (display only — not part of net).
	//
	// On an ISSUED payslip these must be the frozen figures, not a recompute:
	// `rates` is the business's LIVE settings, so changing the EPF/ETF rate
	// made every historical payslip show a different employer cost on screen
	// than the PDF (which prints the frozen columns) — and than the P&L.
	const employer = computed(() => {
		if (props.frozenEmployer) {
			return { baseCents: 0, epfEmployeeCents: 0, ...props.frozenEmployer };
		}
		return props.statutoryEnabled
			? computeStatutory(liableBase(), props.rates)
			: { baseCents: 0, epfEmployeeCents: 0, epfEmployerCents: 0, etfCents: 0 };
	});

	const onChange = () => {
		syncManagedLine();
		// Reassign sort_order so the persisted positions match what's on screen.
		lines.forEach((l, i) => {
			l.sort_order = i;
		});
		emit("update:modelValue", lines.map((l) => ({ ...l })));
	};

	// Recompute the managed lines whenever statutory / PAYE inputs change at
	// the parent (toggles, rates, bracket table, deduct-EPF flag).
	watch(
		() => [props.statutoryEnabled, props.rates, props.payeEnabled, props.payeConfig, props.payeDeductEpf] as const,
		() => {
			onChange();
		},
		{ deep: true }
	);

	// UCheckbox models a boolean; we store epf_liable as 0/1 (DB INTEGER
	// convention). Bridge the two here so the flag stays a clean number and
	// the liable-base math (which tests `=== 1`) never sees a stray boolean.
	const setEpfLiable = (line: PayslipLineDraft, value: boolean | "indeterminate") => {
		line.epf_liable = value === true ? 1 : 0;
		onChange();
	};

	const addLine = (kind: "earning" | "deduction") => {
		lines.push({ sort_order: lines.length, kind, label: "", amount_cents: 0, epf_liable: kind === "earning" ? 1 : 0, auto_source: null });
		onChange();
	};

	const removeAt = (idx: number) => {
		lines.splice(idx, 1);
		onChange();
	};

	// Maps from the rendered earning/deduction list back to the index
	// in the shared `lines` array — needed so removeAt acts on the
	// right slot.
	const earningLines = computed(() => lines.filter((l) => l.kind === "earning"));
	const deductionLines = computed(() => lines.filter((l) => l.kind === "deduction"));
	const earningIndices = computed(() =>
		lines.map((l, i) => ({ l, i })).filter((x) => x.l.kind === "earning").map((x) => x.i)
	);
	const deductionIndices = computed(() =>
		lines.map((l, i) => ({ l, i })).filter((x) => x.l.kind === "deduction").map((x) => x.i)
	);

	const earningsTotal = computed(() =>
		earningLines.value.reduce((s, l) => s + (l.amount_cents || 0), 0)
	);
	const deductionsTotal = computed(() =>
		deductionLines.value.reduce((s, l) => s + (l.amount_cents || 0), 0)
	);
	const net = computed(() => Math.max(0, earningsTotal.value - deductionsTotal.value));
</script>
