<template>
	<div class="space-y-3">
		<div v-if="lines.length === 0" class="text-sm text-(--ui-text-muted) py-6 text-center border border-dashed border-(--ui-border) rounded-md">
			No items yet. Add a row to start.
		</div>

		<!-- ───────────────────────── Bundle mode ───────────────────────── -->
		<template v-else-if="mode === 'bundle'">
			<!-- Card-style row at all breakpoints, mirroring the rail
				pattern itemized mode uses below lg: full-height drag
				handle rail on the left, content stack in the middle,
				delete rail on the right. We deliberately don't switch
				to a horizontal grid at xl+ like itemized does — there's
				no benefit (only two content fields: item + description)
				and the previous xl-only grid made the row read
				asymmetric (Description ~2x Item width).

				No 'ITEM N' badge — keeps the visual identical to
				itemized mode's row chrome so the toggle reads as
				"same row, fewer fields" instead of two different
				designs. -->
			<div
				v-for="(line, idx) in lines"
				:key="idx"
				class="flex items-stretch rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated)/40 overflow-hidden"
				:class="rowStateClass(idx)"
				@dragover.prevent="onDragOver(idx)"
				@drop.prevent="onDrop(idx)"
				@dragend="resetDrag"
			>
				<!-- Left rail — drag handle, full row height -->
				<div
					class="flex items-center justify-center w-9 shrink-0 border-r border-(--ui-border) text-(--ui-text-dimmed) transition-colors"
					:class="disabled ? 'opacity-30' : 'cursor-grab active:cursor-grabbing hover:text-(--ui-text) hover:bg-(--ui-bg-elevated)'"
					:draggable="!disabled"
					role="button"
					aria-label="Drag to reorder"
					@dragstart="onDragStart(idx, $event)"
				>
					<UIcon name="i-lucide-grip-vertical" class="size-4" />
				</div>

				<!-- Content column — item input + description textarea stacked -->
				<div class="flex-1 min-w-0 flex flex-col gap-3 p-3">
					<UInput
						:model-value="line.item_label"
						placeholder="e.g. App development"
						:disabled="disabled"
						class="w-full"
						@update:model-value="updateField(idx, 'item_label', String($event))"
					/>
					<UTextarea
						:model-value="line.description"
						placeholder="Scope details. Use line breaks for sub-points."
						:rows="2"
						:disabled="disabled"
						class="w-full"
						@update:model-value="updateField(idx, 'description', String($event))"
					/>
				</div>

				<!-- Right rail — delete, full row height -->
				<div class="flex items-center justify-center w-9 shrink-0 border-l border-(--ui-border)">
					<UButton
						size="xs"
						variant="ghost"
						color="error"
						icon="i-lucide-trash-2"
						:disabled="disabled"
						aria-label="Delete row"
						@click="removeRow(idx)"
					/>
				</div>
			</div>
		</template>

		<!-- ──────────────────────── Itemized mode ───────────────────────── -->
		<template v-else>
			<!-- Column header — only on wide windows -->
			<div class="hidden xl:grid xl:grid-cols-[2.25rem_minmax(12rem,1fr)_7.5rem_6rem_9rem_7.5rem_8rem_2.25rem] xl:gap-x-3 text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border) pb-2">
				<span />
				<span>Item / description</span>
				<span class="text-right">Qty</span>
				<span>Unit</span>
				<span class="text-right">Unit price</span>
				<span class="text-right">VAT %</span>
				<span class="text-right">Total</span>
				<span />
			</div>

			<!-- Itemized row. Card chrome at ALL breakpoints — sub-xl
				stacks item+desc above a 2- or 4-column qty/unit/price/vat
				row; xl flattens into a horizontal grid where everything
				sits on one row. The card border + bg-elevated stays at
				xl too (no `xl:border-0 xl:bg-transparent` strip) so each
				row reads as a discrete card whether you're on a small
				laptop or a 27" desktop. -->
			<div
				v-for="(line, idx) in lines"
				:key="idx"
				class="flex items-stretch rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated)/40 overflow-hidden
					xl:grid xl:grid-cols-[2.25rem_minmax(12rem,1fr)_7.5rem_6rem_9rem_7.5rem_8rem_2.25rem] xl:gap-x-3 xl:items-start xl:py-3"
				:class="rowStateClass(idx)"
				@dragover.prevent="onDragOver(idx)"
				@drop.prevent="onDrop(idx)"
				@dragend="resetDrag"
			>
				<!-- Drag handle rail. Edge-to-edge of the card at all
					breakpoints — the right border separates it from
					content (sub-xl) and the grid gap provides the
					separation at xl. -->
				<div
					class="flex items-center justify-center w-9 shrink-0 border-r border-(--ui-border) text-(--ui-text-dimmed) transition-colors
						xl:w-auto xl:border-r-0 xl:self-stretch"
					:class="disabled ? 'opacity-30' : 'cursor-grab active:cursor-grabbing hover:text-(--ui-text) hover:bg-(--ui-bg-elevated)'"
					:draggable="!disabled"
					role="button"
					aria-label="Drag to reorder"
					@dragstart="onDragStart(idx, $event)"
				>
					<UIcon name="i-lucide-grip-vertical" class="size-4" />
				</div>

				<!-- Content column -->
				<div class="flex-1 min-w-0 flex flex-col gap-3 p-3 xl:contents">
					<!-- Item / description -->
					<div class="flex flex-col gap-2 min-w-0">
						<UInput
							:model-value="line.item_label"
							placeholder="Item name"
							:disabled="disabled"
							class="w-full"
							@update:model-value="updateField(idx, 'item_label', String($event))"
						/>
						<UTextarea
							:model-value="line.description"
							placeholder="Description (optional)"
							:rows="2"
							:disabled="disabled"
							class="w-full"
							@update:model-value="updateField(idx, 'description', String($event))"
						/>
					</div>

					<!-- Numeric fields: 2×2 on a small card, single row of 4 on a wide card, 4 table columns at xl -->
					<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 xl:contents">
						<div class="min-w-0">
							<span class="block xl:hidden text-xs font-medium uppercase tracking-wide text-(--ui-text-muted) mb-1">Qty</span>
							<UInputNumber
								:model-value="qtyNum(idx)"
								:step="1"
								:min="0"
								:format-options="{ maximumFractionDigits: 3 }"
								class="w-full"
								:disabled="disabled"
								@update:model-value="onQty(idx, $event)"
							/>
						</div>
						<div class="min-w-0">
							<span class="block xl:hidden text-xs font-medium uppercase tracking-wide text-(--ui-text-muted) mb-1">Unit</span>
							<UInput
								:model-value="line.unit ?? ''"
								placeholder="pcs"
								class="w-full"
								:disabled="disabled"
								@update:model-value="updateField(idx, 'unit', String($event) || null)"
							/>
						</div>
						<div class="min-w-0">
							<span class="block xl:hidden text-xs font-medium uppercase tracking-wide text-(--ui-text-muted) mb-1">Unit price</span>
							<MoneyInput
								:model-value="line.unit_price_cents"
								:disabled="disabled"
								@update:model-value="updateField(idx, 'unit_price_cents', $event)"
							/>
						</div>
						<div class="min-w-0">
							<span class="block xl:hidden text-xs font-medium uppercase tracking-wide text-(--ui-text-muted) mb-1">VAT %</span>
							<UInputNumber
								:model-value="ratePct(idx)"
								:step="0.01"
								:min="0"
								:max="100"
								class="w-full"
								:disabled="disabled"
								@update:model-value="onRate(idx, $event)"
							/>
						</div>
					</div>

					<!-- Line total -->
					<div class="flex items-baseline justify-between border-t border-(--ui-border)/60 pt-2 xl:block xl:border-0 xl:pt-0 xl:text-right">
						<span class="xl:hidden text-xs font-medium uppercase tracking-wide text-(--ui-text-muted)">Total</span>
						<div class="tabular-nums whitespace-nowrap">
							<div class="font-medium">
								{{ formatLKR(lineTotals(line).line_total_cents) }}
							</div>
							<div v-if="line.tax_rate_basis_points !== 0" class="text-xs text-(--ui-text-muted)">
								{{ formatLKR(lineTotals(line).line_subtotal_cents, { withSymbol: false }) }}
								+ {{ formatRate(line.tax_rate_basis_points) }}
							</div>
						</div>
					</div>
				</div>

				<!-- Delete rail. Edge-to-edge at all breakpoints — same
					rail look whether sub-xl card or xl grid card. -->
				<div class="flex items-center justify-center w-9 shrink-0 border-l border-(--ui-border) xl:w-auto xl:border-l-0 xl:self-stretch">
					<UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" :disabled="disabled" @click="removeRow(idx)" />
				</div>
			</div>
		</template>

		<div class="flex flex-wrap items-center justify-between gap-3">
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
// Layout: each line is a card on narrow windows and reflows into a dense
// table row at the `xl` breakpoint. The drag handle and delete button live
// in full-height rails on the card's left/right edges so the content
// column's fields all share one width. The numeric fields use an
// `xl:contents` wrapper so the same 2×2 narrow grid promotes to four table
// columns when wide — one template, no markup duplication.
//
// Rows reorder by dragging the grip handle (native HTML5 drag-and-drop).
//
// The component owns no data — the parent passes lines via v-model and we
// emit changes back. Totals are recomputed on every change so the parent
// can show live grand totals.

	import { computeLineTotals, formatLKR, formatRate, sumCents } from "~/lib/money";

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

	const updateField = <K extends keyof LineDraft>(idx: number, key: K, value: LineDraft[K]) => {
		const next = lines.value.slice();
		const row = next[idx];
		if (!row) return;
		next[idx] = { ...row, [key]: value };
		emit("update:modelValue", next);
	};

	// ── Drag-to-reorder (native HTML5 DnD, initiated from the grip handle) ──
	// dragIndex  — the row currently being dragged
	// dragOverIndex — the row the pointer is hovering as a drop target
	const dragIndex = ref<number | null>(null);
	const dragOverIndex = ref<number | null>(null);

	const resetDrag = () => {
		dragIndex.value = null;
		dragOverIndex.value = null;
	};

	const onDragStart = (idx: number, e: DragEvent) => {
		if (props.disabled) return;
		dragIndex.value = idx;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
			// Some browsers refuse to start a drag unless data is set.
			e.dataTransfer.setData("text/plain", String(idx));
		}
	};

	const onDragOver = (idx: number) => {
		if (dragIndex.value !== null) dragOverIndex.value = idx;
	};

	const onDrop = (idx: number) => {
		const from = dragIndex.value;
		if (from !== null && from !== idx) {
			const next = lines.value.slice();
			const [moved] = next.splice(from, 1);
			if (moved) {
				next.splice(idx, 0, moved);
				emit("update:modelValue", next);
			}
		}
		resetDrag();
	};

	// Visual state for a row mid-drag: dim the row being dragged, ring the
	// row it would drop onto.
	const rowStateClass = (idx: number) => ({
		"opacity-40": dragIndex.value === idx,
		"ring-2 ring-(--ui-primary) ring-offset-1 ring-offset-(--ui-bg)":
			dragOverIndex.value === idx && dragIndex.value !== null && dragIndex.value !== idx
	});

	// Qty is stored as quantity_milli (qty × 1000, 3 decimal places). The
	// UInputNumber works in plain decimal units; convert on the way in/out.
	const qtyNum = (idx: number) => {
		const row = lines.value[idx];
		return row ? row.quantity_milli / 1000 : 0;
	};
	const onQty = (idx: number, raw: number | string) => {
		const n = typeof raw === "string" ? Number(raw) : raw;
		if (!Number.isFinite(n) || n < 0) return;
		updateField(idx, "quantity_milli", Math.round(n * 1000));
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
