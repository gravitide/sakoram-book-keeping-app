<template>
	<div class="space-y-3">
		<div v-if="lines.length === 0" class="text-sm text-(--ui-text-muted) py-6 text-center border border-dashed border-(--ui-border) rounded-md">
			No items yet. Add a row to start.
		</div>

		<template v-else>
			<!-- One row template for BOTH modes. The card chrome and the
				drag / delete rails are identical everywhere — only the middle
				content column differs (bundle: item + description; itemized:
				the same two text fields plus a numerics row). The rails stay
				flush flex columns so the toggle reads as "same row, different
				fields", never two different designs. -->
			<div
				v-for="(line, idx) in lines"
				:key="idx"
				class="group/row flex items-stretch rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated)/40 overflow-hidden transition-shadow"
				:class="rowStateClass(idx)"
				@dragover.prevent="onDragOver(idx)"
				@drop.prevent="onDrop(idx)"
				@dragend="resetDrag"
			>
				<!-- Left rail — drag handle, full row height. -->
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

				<!-- Middle — bundle: item + description stacked. -->
				<div v-if="mode === 'bundle'" class="flex-1 min-w-0 flex flex-col gap-3 p-3">
					<UInput
						:model-value="line.item_label"
						placeholder="Item or service"
						:disabled="disabled"
						class="w-full"
						@update:model-value="updateField(idx, 'item_label', String($event))"
					/>
					<UTextarea
						:model-value="line.description"
						placeholder="Details (optional). Use line breaks for sub-points."
						:rows="2"
						autoresize
						:disabled="disabled"
						class="w-full"
						@update:model-value="updateField(idx, 'description', String($event))"
					/>
				</div>

				<!-- Middle — itemized. Item name + description take the full
					width (they hold the most content); below them a numerics
					row groups qty / unit / unit price / VAT at sensible fixed
					widths on the left and pushes the live line total to the
					right edge. One card layout at every width — it wraps
					gracefully on a narrow card and uses the freed horizontal
					space on a wide one. No separate xl table. -->
				<div v-else class="flex-1 min-w-0 flex flex-col gap-3 p-3">
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
						autoresize
						:disabled="disabled"
						class="w-full"
						@update:model-value="updateField(idx, 'description', String($event))"
					/>

					<!-- Numerics: inputs grouped left, line total pushed right.
						items-start keeps every field label on one baseline; the
						total's subtotal+rate sub-line hangs below without
						nudging the inputs. -->
					<div class="flex flex-wrap items-start gap-x-4 gap-y-3 pt-1">
						<div class="flex-1 min-w-[6rem]">
							<span class="block text-xs font-medium uppercase tracking-wide text-(--ui-text-muted) mb-1">Qty</span>
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
						<div class="flex-1 min-w-[5rem]">
							<span class="block text-xs font-medium uppercase tracking-wide text-(--ui-text-muted) mb-1">Unit</span>
							<UInput
								:model-value="line.unit ?? ''"
								placeholder="pcs"
								class="w-full"
								:disabled="disabled"
								@update:model-value="updateField(idx, 'unit', String($event) || null)"
							/>
						</div>
						<div class="flex-[1.5] min-w-[9rem]">
							<span class="block text-xs font-medium uppercase tracking-wide text-(--ui-text-muted) mb-1">Unit price</span>
							<MoneyInput
								:model-value="line.unit_price_cents"
								:disabled="disabled"
								@update:model-value="updateField(idx, 'unit_price_cents', $event)"
							/>
						</div>
						<div class="flex-1 min-w-[6rem]">
							<span class="block text-xs font-medium uppercase tracking-wide text-(--ui-text-muted) mb-1">VAT %</span>
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

						<!-- Total is a full-width flex item, so it always wraps to
							its own row below the four inputs (which then span the
							width) — consistent regardless of window width. -->
						<div class="w-full text-right tabular-nums mt-1">
							<span class="text-xs font-medium uppercase tracking-wide text-(--ui-text-muted) mr-2">Total</span>
							<span class="font-semibold text-base">{{ formatLKR(lineTotals(line).line_total_cents) }}</span>
							<div v-if="line.tax_rate_basis_points !== 0" class="text-xs text-(--ui-text-muted) mt-0.5">
								{{ formatLKR(lineTotals(line).line_subtotal_cents, { withSymbol: false }) }} + {{ formatRate(line.tax_rate_basis_points) }}
							</div>
						</div>
					</div>
				</div>

				<!-- Right rail — delete. The whole rail is the button, so the
					hit target spans the full row height and tints red on hover
					(matches the grip rail's full-height affordance). -->
				<button
					type="button"
					class="flex items-center justify-center w-9 shrink-0 border-l border-(--ui-border) text-(--ui-text-dimmed) transition-colors disabled:opacity-30 disabled:cursor-not-allowed enabled:cursor-pointer enabled:hover:text-(--ui-error) enabled:hover:bg-(--ui-error)/10"
					:disabled="disabled"
					aria-label="Delete row"
					@click="removeRow(idx)"
				>
					<UIcon name="i-lucide-trash-2" class="size-4" />
				</button>
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
// Layout: ONE row template serves both modes. Every row is a flex card with
// full-height drag / delete rails on its left/right edges — pixel-identical
// in bundle and itemized, at every breakpoint. Only the middle content
// column differs. In itemized mode the middle is a single full-width card:
// item name + description span the whole width (they carry the most content),
// then a wrap-friendly numerics row groups qty / unit / unit price / VAT on
// the left and pushes the live line total to the right edge. No separate
// wide-screen table — the one card layout uses the available width at every
// breakpoint, so the rails always read as flush flex columns shared by both
// modes.
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
