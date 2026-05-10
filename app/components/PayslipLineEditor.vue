<template>
	<div class="space-y-6">
		<!-- Earnings -->
		<section>
			<header class="flex items-center justify-between mb-3">
				<div>
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
					class="grid grid-cols-[1fr_180px_auto] gap-2 items-center"
				>
					<UInput
						v-model="line.label"
						placeholder="e.g. Basic, Travel allowance, Overtime"
						:disabled="disabled"
						@input="onChange"
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
			<header class="flex items-center justify-between mb-3">
				<div>
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
						:disabled="disabled"
						@input="onChange"
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
	</div>
</template>

<script setup lang="ts">
	import type { PayslipLineDraft } from "~/stores/payslips";
	import { formatMoney } from "~/lib/money";

	interface Props {
		modelValue: PayslipLineDraft[]
		disabled?: boolean
	}
	const props = withDefaults(defineProps<Props>(), { disabled: false });
	const emit = defineEmits<{ "update:modelValue": [value: PayslipLineDraft[]] }>();

	// Local mutable copy. We re-emit on every change so the parent's
	// dirty-tracker can do its thing. Using reactive() on the array
	// means UInput v-model writes propagate immediately.
	const lines = reactive<PayslipLineDraft[]>(
		props.modelValue.map((l, i) => ({ ...l, sort_order: i }))
	);

	// Keep local in sync if the parent resets the model (e.g. on
	// hydrate / discard). Cheap structural compare via JSON.
	watch(() => props.modelValue, (next) => {
		if (JSON.stringify(next) === JSON.stringify(lines)) return;
		lines.splice(0, lines.length, ...next.map((l, i) => ({ ...l, sort_order: i })));
	}, { deep: true });

	const onChange = () => {
		// Reassign sort_order so the persisted positions match what's on screen.
		lines.forEach((l, i) => {
			l.sort_order = i;
		});
		emit("update:modelValue", lines.map((l) => ({ ...l })));
	};

	const addLine = (kind: "earning" | "deduction") => {
		lines.push({ sort_order: lines.length, kind, label: "", amount_cents: 0 });
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
