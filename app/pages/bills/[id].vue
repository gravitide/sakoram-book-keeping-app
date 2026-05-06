<template>
	<div v-if="bill">
		<header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
			<div>
				<NuxtLink to="/bills" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
					<UIcon name="i-lucide-arrow-left" class="size-4" />
					Back to bills
				</NuxtLink>
				<h1 class="text-2xl font-semibold mt-1 flex items-center gap-3 flex-wrap">
					<span class="tabular-nums">{{ bill.number }}</span>
					<StatusBadge :status="status" size="md" />
					<span v-if="!editable" class="text-xs text-(--ui-text-muted) font-normal">
						read-only
					</span>
				</h1>
				<p class="text-sm text-(--ui-text-muted) mt-1">
					From {{ formVendor || "(no vendor)" }}
					<span v-if="formVendorInvoiceNumber"> · #{{ formVendorInvoiceNumber }}</span>
				</p>
			</div>
			<div class="flex gap-2 items-center">
				<UButton
					v-if="balanceCents > 0 && !isCancelled"
					color="primary"
					icon="i-lucide-circle-dollar-sign"
					@click="openRecordPayment"
				>
					Record payment
				</UButton>
				<UButton
					v-if="editable"
					:loading="saving"
					:disabled="!dirty"
					icon="i-lucide-save"
					@click="save"
				>
					Save
				</UButton>
				<UButton
					color="neutral"
					variant="outline"
					icon="i-lucide-file-down"
					:loading="pdf.state.rendering"
					:disabled="dirty || pdf.state.rendering"
					:title="dirty ? 'Save first' : 'Preview this bill as a PDF'"
					@click="onPdfClick"
				>
					PDF
				</UButton>
				<UDropdownMenu v-if="transitionItems.length > 0" :items="transitionItems">
					<UButton color="neutral" variant="outline" trailing-icon="i-lucide-chevron-down">
						Status
					</UButton>
				</UDropdownMenu>
				<UButton
					v-if="canDelete"
					color="error"
					variant="ghost"
					icon="i-lucide-trash-2"
					@click="askDelete"
				>
					Delete
				</UButton>
			</div>
		</header>

		<div class="space-y-6">
			<UCard>
				<template #header>
					<div class="font-medium">
						Vendor &amp; reference
					</div>
				</template>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Vendor" required>
						<UInput v-model="formVendor" :disabled="!editable" />
					</UFormField>
					<UFormField label="Vendor tax ID">
						<UInput v-model="formVendorTaxId" :disabled="!editable" />
					</UFormField>
					<UFormField label="Vendor address" class="md:col-span-2">
						<UTextarea v-model="formVendorAddress" :rows="2" :disabled="!editable" />
					</UFormField>
					<UFormField label="Vendor invoice #" hint="The number on THEIR invoice (e.g. INV-2024-9821).">
						<UInput v-model="formVendorInvoiceNumber" :disabled="!editable" />
					</UFormField>
					<UFormField label="Category" hint="e.g. utilities, rent, supplies, services">
						<UInput v-model="formCategory" :disabled="!editable" />
					</UFormField>
					<UFormField label="Issue date">
						<DateField v-model="formIssueDate" :disabled="!editable" />
					</UFormField>
					<UFormField label="Due date">
						<DateField v-model="formDueDate" :disabled="!editable" />
					</UFormField>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="flex items-center justify-between gap-4 flex-wrap">
						<div class="font-medium">
							Items
						</div>
						<div v-if="editable" class="flex border border-(--ui-border) rounded-md overflow-hidden text-xs">
							<button
								type="button"
								class="px-3 py-1.5"
								:class="pricingMode === 'bundle' ? 'bg-(--ui-primary) text-(--ui-bg)' : 'hover:bg-(--ui-bg-muted)'"
								@click="togglePricingMode('bundle')"
							>
								Bundle
							</button>
							<button
								type="button"
								class="px-3 py-1.5 border-l border-(--ui-border)"
								:class="pricingMode === 'itemized' ? 'bg-(--ui-primary) text-(--ui-bg)' : 'hover:bg-(--ui-bg-muted)'"
								@click="togglePricingMode('itemized')"
							>
								Itemized
							</button>
						</div>
					</div>
					<p class="text-xs text-(--ui-text-muted) mt-1">
						<span v-if="pricingMode === 'bundle'">Just record the total below — most bills work this way.</span>
						<span v-else>Break down the vendor's line items.</span>
					</p>
				</template>

				<DocumentLineEditor
					v-if="pricingMode === 'itemized'"
					:model-value="lines"
					mode="itemized"
					:disabled="!editable"
					@update:model-value="onLinesChange"
				/>

				<div v-if="pricingMode === 'bundle'" class="space-y-3">
					<UFormField label="Bill subtotal" hint="Total exclusive of VAT.">
						<UInput
							:model-value="bundleSubtotalDisplay"
							placeholder="0.00"
							:disabled="!editable"
							@update:model-value="onBundleSubtotalInput"
						>
							<template #trailing>
								<span class="text-xs text-(--ui-text-muted) pr-1">LKR</span>
							</template>
						</UInput>
					</UFormField>
					<UFormField label="VAT rate (%)">
						<UInput
							v-model="vatRatePct"
							type="number"
							:step="0.01"
							:min="0"
							:max="100"
							:disabled="!editable"
							class="md:w-32"
						/>
					</UFormField>
				</div>

				<div class="border-t border-(--ui-border) pt-4 mt-4 flex justify-end">
					<div class="text-sm tabular-nums text-right space-y-0.5">
						<div class="text-(--ui-text-muted)">
							Subtotal: <span class="text-(--ui-text)">{{ formatLKR(computedTotals.subtotal) }}</span>
						</div>
						<div v-if="computedTotals.tax !== 0" class="text-(--ui-text-muted)">
							VAT: <span class="text-(--ui-text)">{{ formatLKR(computedTotals.tax) }}</span>
						</div>
						<div class="font-semibold text-base">
							Total: {{ formatLKR(computedTotals.total) }}
						</div>
						<div v-if="paidCents > 0" class="text-(--ui-text-muted) pt-1 border-t border-(--ui-border) mt-1">
							Paid: <span class="text-(--ui-success)">{{ formatLKR(paidCents) }}</span>
						</div>
						<div v-if="paidCents > 0" class="font-semibold" :class="balanceCents === 0 ? 'text-(--ui-success)' : 'text-(--ui-text)'">
							Balance: {{ formatLKR(balanceCents) }}
						</div>
					</div>
				</div>

				<div v-if="paidCents > 0 && !isCancelled" class="mt-4 text-right">
					<UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-rotate-ccw" @click="resetPayments">
						Reset payments to zero
					</UButton>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Notes
					</div>
				</template>
				<UTextarea v-model="formNotes" :rows="4" :disabled="!editable" placeholder="Internal notes about this bill" />
			</UCard>
		</div>

		<UModal v-model:open="showPaymentModal" title="Record payment">
			<template #body>
				<div class="space-y-4">
					<div class="text-sm text-(--ui-text-muted) flex justify-between border-b border-(--ui-border) pb-2">
						<span>Outstanding balance:</span>
						<span class="font-medium tabular-nums text-(--ui-text)">{{ formatLKR(balanceCents) }}</span>
					</div>
					<UFormField label="Amount" required>
						<UInput
							:model-value="paymentAmountDisplay"
							placeholder="0.00"
							@update:model-value="onPaymentInput"
						>
							<template #trailing>
								<span class="text-xs text-(--ui-text-muted) pr-1">LKR</span>
							</template>
						</UInput>
					</UFormField>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showPaymentModal = false">
						Cancel
					</UButton>
					<UButton :disabled="paymentAmountCents <= 0" icon="i-lucide-check" @click="confirmPayment">
						Record payment
					</UButton>
				</div>
			</template>
		</UModal>

		<UModal v-model:open="showDeleteDialog" :title="`Delete ${bill.number}?`">
			<template #body>
				<p class="text-sm text-(--ui-text-muted)">
					This permanently removes the bill and its line items. Only allowed
					when no payments have been recorded — for paid or partially paid
					bills, mark them as Cancelled instead.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showDeleteDialog = false">
						Cancel
					</UButton>
					<UButton color="error" icon="i-lucide-trash-2" @click="confirmDelete">
						Delete bill
					</UButton>
				</div>
			</template>
		</UModal>

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:suggested-file-name="pdf.state.suggestedFileName"
			:saving="pdf.state.saving"
			title="Bill PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Bill editor. Bills come from outside, so the lifecycle is different
// from quotes/invoices: there's no "draft" state, the editor is always
// open, and payments are tracked at the bill level (no ledger).
//
// Pricing modes mirror our other documents — bundle (default, header-
// only totals) or itemized (with the line editor). Most bills are
// bundle: just total, due date, vendor invoice number, attachment.

	import type { LineDraft } from "~/components/DocumentLineEditor.vue";
	import type { BillLineRow, BillRow, BillStatus } from "~/stores/bills";
	import type { PricingMode } from "~/stores/quotes";
	import { computeLineTotals, formatLKR, formatQty, formatRate, sumCents, toCents } from "~/lib/money";
	import { themeHex } from "~/lib/theme";
	import { canTransition, useBillsStore } from "~/stores/bills";
	import { useSettingsStore } from "~/stores/settings";

	definePageMeta({ title: "Bill" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const store = useBillsStore();
	const settingsStore = useSettingsStore();
	settingsStore.ensureLoaded().catch(() => { /* surfaced elsewhere */ });

	const billId = Number(route.params.id);
	if (!Number.isFinite(billId)) {
		throw createError({ statusCode: 404, statusMessage: "Bill not found" });
	}

	const bill = ref<BillRow | null>(null);
	const lines = ref<LineDraft[]>([]);
	const saving = ref(false);
	const dirty = ref(false);

	const bundleSubtotalCents = ref<number>(0);
	const bundleSubtotalDisplay = ref<string>("");
	const vatRatePct = ref<number>(0);

	const formVendor = ref("");
	const formVendorTaxId = ref("");
	const formVendorAddress = ref("");
	const formVendorInvoiceNumber = ref("");
	const formIssueDate = ref("");
	const formDueDate = ref("");
	const formCategory = ref("");
	const formNotes = ref("");

	const pricingMode = computed<PricingMode>(() => bill.value?.pricing_mode ?? "bundle");
	const status = computed<BillStatus>(() => bill.value?.status ?? "unpaid");
	const isCancelled = computed(() => status.value === "cancelled");
	const editable = computed(() => !isCancelled.value);
	const totalCents = computed(() => bill.value?.total_cents ?? 0);
	const paidCents = computed(() => bill.value?.paid_cents ?? 0);
	const balanceCents = computed(() => Math.max(0, totalCents.value - paidCents.value));

	const hydrate = async () => {
		const row = await store.get(billId);
		if (!row) {
			throw createError({ statusCode: 404, statusMessage: "Bill not found" });
		}
		bill.value = row;
		formVendor.value = row.vendor_name;
		formVendorTaxId.value = row.vendor_tax_id ?? "";
		formVendorAddress.value = row.vendor_address ?? "";
		formVendorInvoiceNumber.value = row.vendor_invoice_number ?? "";
		formIssueDate.value = row.issue_date;
		formDueDate.value = row.due_date;
		formCategory.value = row.category ?? "";
		formNotes.value = row.notes ?? "";
		vatRatePct.value = row.vat_rate_basis_points / 100;
		bundleSubtotalCents.value = row.subtotal_cents;
		bundleSubtotalDisplay.value = centsToRupees(row.subtotal_cents);

		const lineRows: BillLineRow[] = await store.getLines(billId);
		lines.value = lineRows.map((l) => ({
			item_label: l.item_label,
			description: l.description,
			quantity_milli: l.quantity_milli,
			unit: l.unit,
			unit_price_cents: l.unit_price_cents,
			tax_rate_basis_points: l.tax_rate_basis_points
		}));
		dirty.value = false;
	};

	await hydrate();

	function centsToRupees(c: number): string {
		if (!Number.isInteger(c) || c === 0) return "";
		const r = Math.floor(Math.abs(c) / 100);
		const cs = Math.abs(c) % 100;
		const sign = c < 0 ? "-" : "";
		return `${sign}${r}.${cs.toString().padStart(2, "0")}`;
	}

	const onBundleSubtotalInput = (raw: string | number) => {
		bundleSubtotalDisplay.value = String(raw);
		try {
			bundleSubtotalCents.value = toCents(String(raw));
			dirty.value = true;
		} catch { /* ignore */ }
	};

	const computedTotals = computed(() => {
		if (pricingMode.value === "itemized") {
			const lts = lines.value.map((l) => computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points));
			return {
				subtotal: sumCents(...lts.map((l) => l.line_subtotal_cents)),
				tax: sumCents(...lts.map((l) => l.line_tax_cents)),
				total: sumCents(...lts.map((l) => l.line_total_cents))
			};
		}
		const sub = bundleSubtotalCents.value;
		const tax = Math.round((sub * Math.round(vatRatePct.value * 100)) / 10000);
		return { subtotal: sub, tax, total: sub + tax };
	});

	const togglePricingMode = (mode: PricingMode) => {
		if (!bill.value || bill.value.pricing_mode === mode || !editable.value) return;
		bill.value = { ...bill.value, pricing_mode: mode };
		dirty.value = true;
	};

	const onLinesChange = (next: LineDraft[]) => {
		lines.value = next;
		dirty.value = true;
	};

	const save = async () => {
		if (!bill.value || !editable.value) return;
		saving.value = true;
		try {
			const totalsFromLines = await store.replaceLines(billId, lines.value);
			const bp = Math.round(vatRatePct.value * 100);
			const subtotal = pricingMode.value === "itemized"
				? totalsFromLines.subtotal_cents
				: bundleSubtotalCents.value;
			const tax = pricingMode.value === "itemized"
				? totalsFromLines.tax_cents
				: Math.round((subtotal * bp) / 10000);
			const total = pricingMode.value === "itemized"
				? totalsFromLines.total_cents
				: subtotal + tax;

			await store.update(billId, {
				pricing_mode: bill.value.pricing_mode,
				vendor_name: formVendor.value.trim(),
				vendor_tax_id: formVendorTaxId.value.trim() || null,
				vendor_address: formVendorAddress.value.trim() || null,
				vendor_invoice_number: formVendorInvoiceNumber.value.trim() || null,
				issue_date: formIssueDate.value,
				due_date: formDueDate.value,
				vat_rate_basis_points: bp,
				subtotal_cents: subtotal,
				tax_cents: tax,
				total_cents: total,
				category: formCategory.value.trim() || null,
				notes: formNotes.value || null
			});
			await store.load();
			await hydrate();
			toast.add({ title: "Bill saved", color: "success", icon: "i-lucide-check" });
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

	// Payment recording. Bills don't have a per-payment ledger — we just
	// bump paid_cents.
	const showPaymentModal = ref(false);
	const paymentAmountDisplay = ref("");
	const paymentAmountCents = ref(0);
	const openRecordPayment = () => {
		paymentAmountCents.value = balanceCents.value;
		paymentAmountDisplay.value = balanceCents.value === 0
			? ""
			: `${Math.floor(balanceCents.value / 100)}.${String(balanceCents.value % 100).padStart(2, "0")}`;
		showPaymentModal.value = true;
	};
	const onPaymentInput = (raw: string | number) => {
		paymentAmountDisplay.value = String(raw);
		try {
			paymentAmountCents.value = toCents(String(raw));
		} catch { /* ignore */ }
	};
	const confirmPayment = async () => {
		showPaymentModal.value = false;
		if (paymentAmountCents.value <= 0) return;
		try {
			await store.recordPayment(billId, paymentAmountCents.value);
			await hydrate();
			toast.add({ title: "Payment recorded", color: "success", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Could not record payment",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Reset paid_cents (e.g. correcting a mistake).
	const resetPayments = async () => {
		try {
			await store.setPaidAmount(billId, 0);
			await hydrate();
			toast.add({ title: "Payments reset", color: "info", icon: "i-lucide-rotate-ccw" });
		} catch (err) {
			toast.add({
				title: "Reset failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const transition = async (target: BillStatus) => {
		if (!bill.value) return;
		if (!canTransition(bill.value.status, target)) return;
		if (dirty.value) {
			toast.add({ title: "Save your changes first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		try {
			await store.setStatus(billId, target);
			await hydrate();
			toast.add({ title: `Marked as ${target}`, color: "info", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const transitionItems = computed(() => {
		const cur = status.value;
		const items: { label: string, icon: string, onSelect: () => void }[] = [];
		if (canTransition(cur, "cancelled")) items.push({ label: "Mark as Cancelled", icon: "i-lucide-ban", onSelect: () => transition("cancelled") });
		return items.length > 0 ? [items] : [];
	});

	const showDeleteDialog = ref(false);
	const askDelete = () => {
		showDeleteDialog.value = true;
	};
	const confirmDelete = async () => {
		showDeleteDialog.value = false;
		if (!bill.value) return;
		try {
			await store.deleteBill(billId);
			toast.add({ title: "Bill deleted", color: "info", icon: "i-lucide-trash-2" });
			await router.replace("/bills");
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};
	const canDelete = computed(() => bill.value?.paid_cents === 0 && bill.value?.status !== "cancelled");

	// ---- PDF export ----------------------------------------------------------
	// Bills are an internal record of vendor invoices we received. The PDF is
	// for our own filing — the vendor block becomes the "Bill from" party.
	// We don't render bank details or a "Prepared by" sign-off here (those
	// belong on outbound documents).
	const buildPdfPayload = (lineRows: BillLineRow[]) => {
		const b = bill.value!;
		const addressLines = (b.vendor_address ?? "")
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);
		const hasVat = (b.tax_cents ?? 0) !== 0;

		const fmt = (cents: number) => formatLKR(cents);
		const fmtNoSym = (cents: number) => formatLKR(cents, { withSymbol: false });

		const balanceCentsValue = Math.max(0, b.total_cents - b.paid_cents);

		return {
			kind: "bill",
			number: b.number,
			title: "BILL",
			theme_color: themeHex(settingsStore.settings?.theme_color),
			primary_label: "Bill",
			date_label: "Date",
			date_value: b.issue_date,
			secondary_label: "Due date",
			secondary_value: b.due_date,
			vendor_invoice_label: b.vendor_invoice_number ? "Vendor inv #" : null,
			vendor_invoice_value: b.vendor_invoice_number ?? null,
			party_label: "Bill from",
			party: {
				name: b.vendor_name,
				tax_id: b.vendor_tax_id ?? null,
				address_lines: addressLines
			},
			project_title: b.category ? `Category: ${b.category}` : "",
			pricing_mode: b.pricing_mode,
			has_vat: hasVat,
			notes: b.notes ?? "",
			notes_paragraphs: (b.notes ?? "").split(/\n\s*\n/).filter((p) => p.trim().length > 0),
			prepared_by: "",
			paid_cents: b.paid_cents > 0 ? b.paid_cents : null,
			paid_display: b.paid_cents > 0 ? fmtNoSym(b.paid_cents) : null,
			balance_display: b.paid_cents > 0 ? fmtNoSym(balanceCentsValue) : null,
			business_name: settingsStore.settings?.business_name ?? null,
			website: settingsStore.settings?.website ?? null,
			phone: settingsStore.settings?.phone ?? null,
			address_line1: settingsStore.settings?.address_line1 ?? null,
			city: settingsStore.settings?.city ?? null,
			logo_path: settingsStore.settings?.logo_path ?? null,
			bank: null,
			lines: lineRows.map((l) => ({
				item_label: l.item_label,
				description: l.description,
				qty_display: formatQty(l.quantity_milli) + (l.unit ? ` ${l.unit}` : ""),
				unit_price_display: fmtNoSym(l.unit_price_cents),
				vat_display: formatRate(l.tax_rate_basis_points),
				total_display: fmtNoSym(l.line_total_cents)
			})),
			formatted: {
				subtotal: fmt(b.subtotal_cents),
				subtotal_no_symbol: fmtNoSym(b.subtotal_cents),
				tax: fmt(b.tax_cents),
				tax_no_symbol: fmtNoSym(b.tax_cents),
				total: fmt(b.total_cents),
				total_no_symbol: fmtNoSym(b.total_cents)
			}
		};
	};

	const linesForPreview = ref<BillLineRow[]>([]);
	watch([() => billId, () => bill.value?.updated_at], async () => {
		try {
			linesForPreview.value = await store.getLines(billId);
		} catch { /* surfaced when user clicks PDF */ }
	}, { immediate: true });

	const pdf = usePdfPreview({
		command: "export_bill_pdf",
		buildPayload: () => buildPdfPayload(linesForPreview.value),
		fileName: () => `${bill.value?.number ?? "bill"}.pdf`,
		title: "Bill PDF preview"
	});

	const onPdfClick = () => {
		if (!bill.value || dirty.value) return;
		pdf.open();
	};
</script>
