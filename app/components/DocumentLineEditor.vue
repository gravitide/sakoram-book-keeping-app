<template>
	<div class="space-y-3">
		<div v-if="lines.length === 0" class="text-sm text-(--ui-text-muted) py-6 text-center border border-dashed border-(--ui-border) rounded-md">
			No items yet. Add a row to start.
		</div>

		<!-- Bundle mode: just label + description -->
		<table v-else-if="mode === 'bundle'" class="w-full text-sm">
			<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
				<tr>
					<th class="py-2 pr-2 font-medium w-8" />
					<th class="py-2 pr-2 font-medium w-1/4">
						Item
					</th>
					<th class="py-2 pr-2 font-medium">
						Description
					</th>
					<th class="py-2 pr-2 font-medium w-8" />
				</tr>
			</thead>
			<tbody>
				<tr v-for="(line, idx) in lines" :key="idx" class="align-top border-b border-(--ui-border)/60 last:border-0">
					<td class="py-2 pr-2">
						<div class="flex flex-col gap-0.5">
							<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-arrow-up" :disabled="idx === 0 || disabled" @click="moveRow(idx, -1)" />
							<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-arrow-down" :disabled="idx === lines.length - 1 || disabled" @click="moveRow(idx, 1)" />
						</div>
					</td>
					<td class="py-2 pr-2">
						<UInput
							:model-value="line.item_label"
							placeholder="e.g. App development"
							:disabled="disabled"
							@update:model-value="updateField(idx, 'item_label', String($event))"
						/>
					</td>
					<td class="py-2 pr-2">
						<UTextarea
							:model-value="line.description"
							placeholder="Scope details. Use line breaks for sub-points."
							:rows="3"
							:disabled="disabled"
							@update:model-value="updateField(idx, 'description', String($event))"
						/>
					</td>
					<td class="py-2 pr-2">
						<UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" :disabled="disabled" @click="removeRow(idx)" />
					</td>
				</tr>
			</tbody>
		</table>

		<!-- Itemized mode: full pricing columns -->
		<table v-else class="w-full text-sm">
			<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
				<tr>
					<th class="py-2 pr-2 font-medium w-8" />
					<th class="py-2 pr-2 font-medium w-1/4">
						Item / description
					</th>
					<th class="py-2 pr-2 font-medium text-right w-20">
						Qty
					</th>
					<th class="py-2 pr-2 font-medium w-20">
						Unit
					</th>
					<th class="py-2 pr-2 font-medium text-right w-32">
						Unit price
					</th>
					<th class="py-2 pr-2 font-medium text-right w-32">
						VAT %
					</th>
					<th class="py-2 pr-2 font-medium text-right w-32">
						Total
					</th>
					<th class="py-2 pr-2 font-medium w-8" />
				</tr>
			</thead>
			<tbody>
				<tr v-for="(line, idx) in lines" :key="idx" class="align-top border-b border-(--ui-border)/60 last:border-0">
					<td class="py-2 pr-2">
						<div class="flex flex-col gap-0.5">
							<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-arrow-up" :disabled="idx === 0 || disabled" @click="moveRow(idx, -1)" />
							<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-arrow-down" :disabled="idx === lines.length - 1 || disabled" @click="moveRow(idx, 1)" />
						</div>
					</td>
					<td class="py-2 pr-2">
						<UInput
							:model-value="line.item_label"
							placeholder="Item name"
							:disabled="disabled"
							class="mb-1"
							@update:model-value="updateField(idx, 'item_label', String($event))"
						/>
						<UTextarea
							:model-value="line.description"
							placeholder="Description (optional)"
							:rows="2"
							:disabled="disabled"
							@update:model-value="updateField(idx, 'description', String($event))"
						/>
					</td>
					<td class="py-2 pr-2">
						<UInput
							:model-value="qtyDisplay(idx)"
							placeholder="1"
							class="text-right"
							:disabled="disabled"
							@update:model-value="onQty(idx, String($event))"
						/>
					</td>
					<td class="py-2 pr-2">
						<UInput
							:model-value="line.unit ?? ''"
							placeholder="pcs"
							:disabled="disabled"
							@update:model-value="updateField(idx, 'unit', String($event) || null)"
						/>
					</td>
					<td class="py-2 pr-2">
						<MoneyInput
							:model-value="line.unit_price_cents"
							:disabled="disabled"
							@update:model-value="updateField(idx, 'unit_price_cents', $event)"
						/>
					</td>
					<td class="py-2 pr-2">
						<UInputNumber
							:model-value="ratePct(idx)"
							:step="0.01"
							:min="0"
							:max="100"
							:disabled="disabled"
							@update:model-value="onRate(idx, $event)"
						/>
					</td>
					<td class="py-2 pr-2 text-right tabular-nums whitespace-nowrap">
						<div>{{ formatLKR(lineTotals(line).line_total_cents) }}</div>
						<div v-if="line.tax_rate_basis_points !== 0" class="text-xs text-(--ui-text-muted)">
							{{ formatLKR(lineTotals(line).line_subtotal_cents, { withSymbol: false }) }}
							+ {{ formatRate(line.tax_rate_basis_points) }}
						</div>
					</td>
					<td class="py-2 pr-2">
						<UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" :disabled="disabled" @click="removeRow(idx)" />
					</td>
				</tr>
			</tbody>
		</table>

		<div class="flex items-center justify-between">
			<UButton variant="outline" icon="i-lucide-plus" size="sm" :disabled="disabled" @click="addRow">
				Add row
			</UButton>

			<div v-if="mode === 'itemized' && lines.length > 0" class="text-sm tabular-nums text-right">
				<div class="text-(--ui-text-muted)">
					Subtotal: <span class="text-(--ui-text)">{{ formatLKR(itemizedTotals.subtotal) }}</span>
				</div>
				<div class="text-(--ui-text-muted)">
					VAT: <span class="text-(--ui-text)">{{ formatLKR(itemizedTotals.tax) }}</span>
				</div>
				<div class="font-semibold">
					Total: {{ formatLKR(itemizedTotals.total) }}
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Reusable line-items editor for quotes / invoices / bills.
//
// Two modes:
//
//   bundle    — lines are scope-only (item_label + description). The
//               document's subtotal is entered separately by the parent.
//               Use this for quotes/invoices that bill a single fee for a
//               package of work.
//
//   itemized  — each line carries qty / unit / unit_price / tax %. Line
//               totals + the document subtotal are computed live below.
//
// The component owns no data — the parent passes lines via v-model and we
// emit changes back. Totals are recomputed on every change so the parent
// can show live grand totals.

	import { computeLineTotals, formatLKR, formatRate, sumCents, toMilli } from "~/lib/money";

	export interface LineDraft {
		item_label: string
		description: string
		quantity_milli: number
		unit: string | null
		unit_price_cents: number
		tax_rate_basis_points: number
	}

	interface Props {
		modelValue: LineDraft[]
		mode: "bundle" | "itemized"
		disabled?: boolean
	}
	const props = withDefaults(defineProps<Props>(), { disabled: false });
	const emit = defineEmits<{ "update:modelValue": [lines: LineDraft[]] }>();

	const lines = computed<LineDraft[]>({
		get: () => props.modelValue,
		set: (v) => emit("update:modelValue", v)
	});

	const blank = (): LineDraft => ({
		item_label: "",
		description: "",
		quantity_milli: 1000,
		unit: null,
		unit_price_cents: 0,
		tax_rate_basis_points: 0
	});

	const addRow = () => {
		emit("update:modelValue", [...lines.value, blank()]);
	};

	const removeRow = (idx: number) => {
		emit("update:modelValue", lines.value.filter((_, i) => i !== idx));
	};

	const moveRow = (idx: number, dir: -1 | 1) => {
		const target = idx + dir;
		if (target < 0 || target >= lines.value.length) return;
		const next = lines.value.slice();
		const a = next[idx];
		const b = next[target];
		if (!a || !b) return;
		next[idx] = b;
		next[target] = a;
		emit("update:modelValue", next);
	};

	const updateField = <K extends keyof LineDraft>(idx: number, key: K, value: LineDraft[K]) => {
		const next = lines.value.slice();
		const row = next[idx];
		if (!row) return;
		next[idx] = { ...row, [key]: value };
		emit("update:modelValue", next);
	};

	// String mirrors so the user can type freely. We push to integer state on
	// change. (For qty: type "2.5" or "0.125" — converted via toMilli.)
	const qtyDisplay = (idx: number) => {
		const row = lines.value[idx];
		if (!row) return "";
		const m = row.quantity_milli;
		if (m === 0) return "";
		const intPart = Math.floor(m / 1000);
		const frac = m % 1000;
		if (frac === 0) return intPart.toString();
		return `${intPart}.${frac.toString().padStart(3, "0").replace(/0+$/, "")}`;
	};
	const onQty = (idx: number, raw: string) => {
		try {
			updateField(idx, "quantity_milli", toMilli(raw));
		} catch { /* invalid in-flight, ignore */ }
	};

	const ratePct = (idx: number) => {
		const row = lines.value[idx];
		if (!row) return 0;
		return row.tax_rate_basis_points / 100;
	};
	const onRate = (idx: number, raw: number | string) => {
		const n = typeof raw === "string" ? Number(raw) : raw;
		if (!Number.isFinite(n)) return;
		updateField(idx, "tax_rate_basis_points", Math.round(n * 100));
	};

	const lineTotals = (l: LineDraft) =>
		computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points);

	const itemizedTotals = computed(() => {
		const subs = lines.value.map((l) => lineTotals(l).line_subtotal_cents);
		const tax = lines.value.map((l) => lineTotals(l).line_tax_cents);
		const total = lines.value.map((l) => lineTotals(l).line_total_cents);
		return {
			subtotal: sumCents(...subs),
			tax: sumCents(...tax),
			total: sumCents(...total)
		};
	});

	defineExpose({ itemizedTotals });
</script>
