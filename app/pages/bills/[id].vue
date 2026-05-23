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
					<span v-if="!editable" class="app-chrome text-xs text-(--ui-text-muted) font-normal">
						read-only
					</span>
				</h1>
				<p class="app-chrome text-sm text-(--ui-text-muted) mt-1">
					From {{ vendorSnapshot?.name || "(no vendor)" }}
					<span v-if="formVendorInvoiceNumber"> · #{{ formVendorInvoiceNumber }}</span>
				</p>
			</div>
			<div class="flex gap-2 items-center">
				<UButton
					v-if="balanceCents > 0 && !isCancelled"
					color="primary"
					icon="i-lucide-circle-dollar-sign"
					@click="goRecordPayment"
				>
					Record payment
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
					PDF & Print
				</UButton>
				<!-- Cancellation is only legal while there's still a balance
					owed. Once the bill is fully paid (paidCents covers
					total), cancellation would orphan the payment vouchers
					and leave the books in an inconsistent state — the
					user should delete the vouchers first. -->
				<UButton
					v-if="isCancelled || balanceCents > 0"
					color="neutral"
					variant="outline"
					:icon="isCancelled ? 'i-lucide-rotate-ccw' : 'i-lucide-ban'"
					@click="toggleCancelled"
				>
					{{ isCancelled ? "Reopen bill" : "Mark cancelled" }}
				</UButton>

				<!-- Visual separator before the destructive action so a
					stray click on Cancel doesn't land on Delete. -->
				<div class="h-6 w-px bg-(--ui-border) mx-1" />

				<UButton
					color="error"
					variant="soft"
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
					<div class="app-chrome flex items-center justify-between">
						<div class="app-chrome font-medium">
							Vendor &amp; reference
						</div>
						<UButton
							v-if="editable"
							size="xs"
							variant="ghost"
							color="neutral"
							icon="i-lucide-refresh-ccw"
							@click="refreshVendorSnapshot"
						>
							Refresh vendor snapshot
						</UButton>
					</div>
				</template>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div class="space-y-3">
						<UFormField label="Vendor" required>
							<VendorPicker
								v-model="formVendorId"
								:disabled="!editable"
								required
								@select="onVendorPicked"
							/>
						</UFormField>
						<div class="text-sm">
							<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) mb-1">
								Bill from (snapshot)
							</div>
							<div class="font-medium">
								{{ vendorSnapshot?.name || "(no vendor)" }}
							</div>
							<div v-if="vendorSnapshot?.address_line1" class="text-(--ui-text-muted)">
								{{ vendorSnapshot.address_line1 }}
							</div>
							<div v-if="vendorSnapshot?.address_line2" class="text-(--ui-text-muted)">
								{{ vendorSnapshot.address_line2 }}
							</div>
							<div v-if="vendorSnapshot?.city || vendorSnapshot?.country" class="text-(--ui-text-muted)">
								{{ [vendorSnapshot.city, vendorSnapshot.postal_code, vendorSnapshot.country].filter(Boolean).join(", ") }}
							</div>
							<div v-if="vendorSnapshot?.tax_id" class="text-(--ui-text-muted) mt-1 text-xs">
								Tax ID: {{ vendorSnapshot.tax_id }}
							</div>
						</div>
					</div>
					<div class="space-y-3">
						<UFormField label="Vendor invoice #" hint="The number on THEIR invoice (e.g. INV-2024-9821).">
							<UInput v-model="formVendorInvoiceNumber" :disabled="!editable" />
						</UFormField>
						<UFormField label="Category" hint="Manage the list under Contacts → Bill categories.">
							<CategoryPicker v-model="formCategoryId" :disabled="!editable" />
						</UFormField>
						<div class="grid grid-cols-2 gap-3">
							<UFormField label="Issue date">
								<DateField v-model="formIssueDate" :disabled="!editable" />
							</UFormField>
							<UFormField label="Due date">
								<DateField v-model="formDueDate" :min-value="formIssueDate || undefined" :disabled="!editable" />
							</UFormField>
						</div>
					</div>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="app-chrome flex items-center justify-between gap-4 flex-wrap">
						<div class="app-chrome font-medium">
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

				<div v-if="pricingMode === 'bundle'" class="flex flex-col items-end gap-3">
					<UFormField label="Bill subtotal" hint="Total exclusive of VAT." class="w-72">
						<MoneyInput
							v-model="bundleSubtotalCents"
							:disabled="!editable"
							class="w-full"
						/>
					</UFormField>
					<UFormField label="VAT rate (%)" class="w-36">
						<UInputNumber
							v-model="vatRatePct"
							:step="0.01"
							:min="0"
							:max="100"
							:disabled="!editable"
							class="w-full"
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
						<div v-if="paidCents > 0 && !overpaid" class="font-semibold" :class="balanceCents === 0 ? 'text-(--ui-success)' : 'text-(--ui-text)'">
							Balance: {{ formatLKR(balanceCents) }}
						</div>
						<!-- Overpaid pill: linked vouchers sum to more than
							the bill total. Soft warning — the user might
							have legitimate reasons (refund, deliberate
							over-payment) but it should still be visible. -->
						<div v-if="overpaid" class="font-semibold text-(--ui-warning) pt-0.5">
							Overpaid by {{ formatLKR(overpaymentCents) }}
						</div>
					</div>
				</div>
			</UCard>

			<!-- Payment vouchers linked to this bill. Vouchers are the
				single source of truth for cash flow — the "paid" / "balance"
				numbers above are sums of these rows. Click a row to open
				the voucher; click the header button to create a new
				payment voucher pre-filled against this bill. -->
			<UCard>
				<template #header>
					<div class="app-chrome flex items-center justify-between">
						<div>
							<div class="app-chrome font-medium">
								Payments
							</div>
							<div class="text-xs text-(--ui-text-muted) mt-0.5">
								<span v-if="payments.length === 0">No payments recorded yet — each "Record payment" creates a voucher in the cash ledger.</span>
								<span v-else>{{ payments.length }} payment voucher{{ payments.length === 1 ? "" : "s" }} · {{ formatLKR(paidCents) }} of {{ formatLKR(totalCents) }} paid.</span>
							</div>
						</div>
						<UButton
							v-if="balanceCents > 0 && !isCancelled"
							size="xs"
							variant="soft"
							icon="i-lucide-plus"
							@click="goRecordPayment"
						>
							Record payment
						</UButton>
					</div>
				</template>

				<div v-if="payments.length === 0" class="py-6 text-center text-sm text-(--ui-text-muted)">
					<UIcon name="i-lucide-ticket" class="size-8 mx-auto mb-2 opacity-50" />
					<div>Recording a payment opens a pre-filled voucher form.</div>
				</div>
				<table v-else class="w-full text-sm">
					<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
						<tr>
							<th class="py-2 pl-3 pr-2 font-medium">
								Voucher
							</th>
							<th class="py-2 px-2 font-medium">
								Date
							</th>
							<th class="py-2 px-2 font-medium">
								Method
							</th>
							<th class="py-2 px-2 font-medium">
								Reference
							</th>
							<th class="py-2 pl-2 pr-3 font-medium text-right">
								Amount
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="v in payments"
							:key="v.id"
							class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
							@click="router.push(`/vouchers/${v.id}`)"
						>
							<td class="py-2 pl-3 pr-2 font-medium tabular-nums">
								{{ v.number }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted) tabular-nums">
								{{ v.voucher_date }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted)">
								{{ methodLabel(v.payment_method) }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted)">
								{{ v.reference || "—" }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right tabular-nums whitespace-nowrap font-medium text-(--ui-error)">
								− {{ formatLKR(v.amount_cents) }}
							</td>
						</tr>
					</tbody>
				</table>
			</UCard>

			<UCard>
				<template #header>
					<div class="app-chrome font-medium">
						Notes
					</div>
				</template>
				<UTextarea v-model="formNotes" :rows="4" :disabled="!editable" placeholder="Internal notes about this bill" />
			</UCard>

			<!-- Attachments — scans / photos of the vendor's bill. Shared
				card, same as the quote / invoice / voucher detail pages. -->
			<AttachmentsCard document-type="bill" :document-id="billId" />

			<!-- Sticky save bar — matches the quote / invoice variant. -->
			<div
				v-if="editable"
				class="sticky bottom-0 -mx-2 mt-6 transition-all duration-200"
				:class="dirty
					? 'opacity-100 translate-y-0 pointer-events-auto'
					: 'opacity-0 translate-y-3 pointer-events-none'"
			>
				<div class="rounded-xl backdrop-blur-md bg-(--ui-bg)/90 border-2 border-(--ui-primary)/50 shadow-2xl px-4 py-3 flex items-center justify-between gap-4">
					<div class="flex items-center gap-2 text-sm">
						<span class="relative flex size-2">
							<span class="absolute inline-flex h-full w-full rounded-full bg-(--ui-warning) opacity-75 animate-ping" />
							<span class="relative inline-flex size-2 rounded-full bg-(--ui-warning)" />
						</span>
						<span class="text-(--ui-text)">Unsaved changes</span>
					</div>
					<div class="flex items-center gap-2">
						<UButton
							variant="ghost"
							color="neutral"
							:disabled="saving"
							@click="onDiscard"
						>
							Discard
						</UButton>
						<UButton
							:loading="saving"
							:disabled="!dirty"
							icon="i-lucide-save"
							@click="save"
						>
							Save changes
						</UButton>
					</div>
				</div>
			</div>
		</div>

		<UModal v-model:open="showDeleteDialog" :title="`Delete ${bill.number}?`">
			<template #body>
				<div class="space-y-3 text-sm">
					<p class="text-(--ui-text-muted)">
						This permanently removes the bill and its line items. The
						number {{ bill.number }} will not be reused — it'll show as a
						gap in your sequence.
					</p>
					<div v-if="needsTypedConfirm" class="rounded-md border border-(--ui-warning)/40 bg-(--ui-warning)/10 p-3 space-y-2">
						<p class="font-medium text-(--ui-text)">
							This bill has {{ formatLKR(paidCents) }} in recorded payments.
						</p>
						<p class="text-(--ui-text-muted)">
							Deleting it removes that payment history from your books.
							Vouchers that reference this bill will be kept but
							unlinked. Consider marking it Cancelled instead.
						</p>
						<UFormField :label="`Type ${bill.number} to confirm`">
							<UInput v-model="deleteConfirmInput" :placeholder="bill.number" autofocus />
						</UFormField>
					</div>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showDeleteDialog = false">
						Cancel
					</UButton>
					<UButton
						color="error"
						icon="i-lucide-trash-2"
						:disabled="!canConfirmDelete"
						@click="confirmDelete"
					>
						{{ needsTypedConfirm ? "Delete anyway" : "Delete bill" }}
					</UButton>
				</div>
			</template>
		</UModal>

		<PdfPreviewModal
			v-model:open="pdf.state.open"
			:asset-url="pdf.state.assetUrl"
			:temp-path="pdf.state.tempPath"
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
	import type { BillLineRow, BillPersistedStatus, BillRow, BillStatus, VendorSnapshot } from "~/stores/bills";
	import type { PricingMode } from "~/stores/quotes";
	import type { VendorRow } from "~/stores/vendors";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { computeLineTotals, formatLKR, formatQty, formatRate, sumCents } from "~/lib/money";
	import { themeHex } from "~/lib/theme";
	import { buildCategorySnapshot, useBillCategoriesStore } from "~/stores/bill_categories";
	import { useBillsStore } from "~/stores/bills";
	import { useSettingsStore } from "~/stores/settings";
	import { useVendorsStore } from "~/stores/vendors";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Bill" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const store = useBillsStore();
	const settingsStore = useSettingsStore();
	const vendorsStore = useVendorsStore();
	const categoriesStore = useBillCategoriesStore();
	const vouchersStore = useVouchersStore();
	const currency = useActiveCurrency();
	settingsStore.ensureLoaded().catch(() => { /* surfaced elsewhere */ });
	// Vendors / categories / vouchers might not be loaded yet if the user
	// lands here via deep link. Vouchers are essential — the Payments
	// panel reads them and the derived "paid" / "balance" / status all
	// fall out of the voucher ledger.
	if (vendorsStore.vendors.length === 0) {
		vendorsStore.load().catch(() => { /* surfaced via picker empty state */ });
	}
	if (categoriesStore.categories.length === 0) {
		categoriesStore.load().catch(() => { /* surfaced via picker empty state */ });
	}
	if (vouchersStore.vouchers.length === 0) {
		vouchersStore.load().catch(() => { /* non-fatal — payments panel just stays empty */ });
	}

	const billId = Number(route.params.id);
	if (!Number.isFinite(billId)) {
		throw createError({ statusCode: 404, statusMessage: "Bill not found" });
	}

	const bill = ref<BillRow | null>(null);
	const lines = ref<LineDraft[]>([]);
	const saving = ref(false);
	const dirty = ref(false);
	const hydrating = ref(false);

	const bundleSubtotalCents = ref<number>(0);
	const vatRatePct = ref<number>(0);

	const formVendorId = ref<number | null>(null);
	const formVendorInvoiceNumber = ref("");
	const formIssueDate = ref("");
	const formDueDate = ref("");
	const formCategoryId = ref<number | null>(null);
	const formNotes = ref("");

	// The frozen-at-creation snapshot. Edited indirectly: picking a different
	// vendor swaps in a fresh copy, the "Refresh vendor snapshot" button
	// re-snapshots from the live vendors row.
	const vendorSnapshot = ref<VendorSnapshot | null>(null);

	const pricingMode = computed<PricingMode>(() => bill.value?.pricing_mode ?? "bundle");
	// `status` is the user-visible derived state (unpaid/partial/paid/
	// overdue/cancelled). It collapses the persisted `status` column
	// (open|cancelled) with the sum of linked payment vouchers and the
	// due_date. `isCancelled` is the persisted bit alone — used to gate
	// the editor's read-only behaviour.
	const status = computed<BillStatus>(() =>
		bill.value ? store.derivedStatus(bill.value) : "unpaid"
	);
	const isCancelled = computed(() => bill.value?.status === "cancelled");
	const editable = computed(() => !isCancelled.value);
	const totalCents = computed(() => bill.value?.total_cents ?? 0);
	const paidCents = computed(() => (bill.value ? store.paidCentsFor(bill.value.id) : 0));
	const balanceCents = computed(() => Math.max(0, totalCents.value - paidCents.value));
	// Overpayment surface: when sum-of-payment-vouchers > total, show
	// the overrun in the totals card. derivedStatus() still reads
	// 'paid' (capped) — this is purely informational.
	const overpaymentCents = computed(() => Math.max(0, paidCents.value - totalCents.value));
	const overpaid = computed(() => overpaymentCents.value > 0);

	// Payment vouchers linked to this bill, most-recent first. Reactive
	// against the vouchers store, so creating/editing/deleting a
	// payment voucher elsewhere reflects here immediately.
	const payments = computed(() =>
		bill.value ? store.linkedPayments(bill.value.id) : []
	);

	const methodLabel = (m: string | null): string => {
		if (!m) return "—";
		return ({
			bank_transfer: "Bank transfer",
			cash: "Cash",
			cheque: "Cheque",
			card: "Card",
			other: "Other"
		} as Record<string, string>)[m] ?? m;
	};

	const hydrate = async () => {
		hydrating.value = true;
		const row = await store.get(billId);
		if (!row) {
			hydrating.value = false;
			throw createError({ statusCode: 404, statusMessage: "Bill not found" });
		}
		bill.value = row;
		formVendorId.value = row.vendor_id;
		try {
			vendorSnapshot.value = JSON.parse(row.vendor_snapshot) as VendorSnapshot;
		} catch {
			vendorSnapshot.value = null;
		}
		formVendorInvoiceNumber.value = row.vendor_invoice_number ?? "";
		formIssueDate.value = row.issue_date;
		formDueDate.value = row.due_date;
		formCategoryId.value = row.category_id;
		formNotes.value = row.notes ?? "";
		vatRatePct.value = row.vat_rate_basis_points / 100;
		bundleSubtotalCents.value = row.subtotal_cents;

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
		await nextTick();
		hydrating.value = false;
	};

	await hydrate();

	// Mark dirty when any directly v-model'd form field changes. Registered
	// after the initial hydrate; hydrating-flag guards re-hydrate paths.
	watch(
		[formVendorInvoiceNumber, formIssueDate, formDueDate, formCategoryId, formNotes, vatRatePct, bundleSubtotalCents],
		() => {
			if (editable.value && !hydrating.value) dirty.value = true;
		}
	);

	// Keep due_date >= issue_date. min-value on the DateField blocks
	// picking an earlier date directly; this watcher handles the
	// reverse direction (pushing issue forward past due).
	watch(formIssueDate, (next) => {
		if (!editable.value || hydrating.value || !next) return;
		if (formDueDate.value && formDueDate.value < next) {
			formDueDate.value = next;
		}
	});

	function snapshotForSelectedCategory(): string | null {
		if (formCategoryId.value === null) return null;
		const c = categoriesStore.categories.find((row) => row.id === formCategoryId.value);
		return c ? buildCategorySnapshot(c) : null;
	}

	function categoryNameFromSnapshot(json: string | null): string {
		if (!json) return "";
		try {
			return (JSON.parse(json) as { name?: string }).name ?? "";
		} catch {
			return "";
		}
	}

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

	// VendorPicker emits the freshly-picked row — snapshot it on the spot
	// so the displayed "Bill from" block updates immediately. Persisted
	// when the user clicks Save.
	const onVendorPicked = (v: VendorRow) => {
		if (!editable.value) return;
		vendorSnapshot.value = {
			name: v.name,
			contact_person: v.contact_person,
			email: v.email,
			phone: v.phone,
			address_line1: v.address_line1,
			address_line2: v.address_line2,
			city: v.city,
			postal_code: v.postal_code,
			country: v.country,
			tax_id: v.tax_id
		};
		dirty.value = true;
	};

	// If the user has updated the linked vendor record (address change,
	// new tax ID, etc.), this refreshes the snapshot from the current
	// vendors row. Doesn't run automatically — historical bills should
	// keep their original snapshot unless the user explicitly opts in.
	const refreshVendorSnapshot = () => {
		if (!editable.value || formVendorId.value === null) return;
		const v = vendorsStore.vendors.find((x) => x.id === formVendorId.value);
		if (!v) {
			toast.add({ title: "Vendor not found", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		onVendorPicked(v);
		toast.add({ title: "Vendor snapshot refreshed", color: "info", icon: "i-lucide-refresh-ccw" });
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

			if (formVendorId.value === null) {
				throw new Error("A vendor is required");
			}
			await store.update(billId, {
				pricing_mode: bill.value.pricing_mode,
				vendor_id: formVendorId.value,
				vendor_snapshot: vendorSnapshot.value ? JSON.stringify(vendorSnapshot.value) : bill.value.vendor_snapshot,
				vendor_invoice_number: formVendorInvoiceNumber.value.trim() || null,
				issue_date: formIssueDate.value,
				due_date: formDueDate.value,
				vat_rate_basis_points: bp,
				subtotal_cents: subtotal,
				tax_cents: tax,
				total_cents: total,
				category_id: formCategoryId.value,
				category_snapshot: snapshotForSelectedCategory(),
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

	// Sticky save bar's Discard action: re-hydrate from the DB which
	// resets the form refs and clears `dirty`.
	const onDiscard = async () => {
		if (saving.value) return;
		await hydrate();
		toast.add({ title: "Changes discarded", color: "neutral", icon: "i-lucide-rotate-ccw" });
	};

	// Recording a payment is now creating a payment voucher pre-filled
	// against this bill. The New Voucher page reads ?bill=N from the
	// query string and seeds voucher_type=payment, the vendor name,
	// related_bill_id, and the outstanding balance as the amount.
	const goRecordPayment = () => {
		if (dirty.value) {
			toast.add({
				title: "Save your changes first",
				description: "Otherwise the bill's outstanding balance might not match.",
				color: "warning",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		router.push(`/vouchers/new?bill=${billId}`);
	};

	// Cancel / re-open is the only persisted status transition now — every
	// other state (unpaid/partial/paid/overdue) is derived from the voucher
	// ledger and the due date.
	const toggleCancelled = async () => {
		if (!bill.value) return;
		if (dirty.value) {
			toast.add({ title: "Save your changes first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		const next: BillPersistedStatus = bill.value.status === "cancelled" ? "open" : "cancelled";
		try {
			await store.setCancelled(billId, next === "cancelled");
			await hydrate();
			toast.add({
				title: next === "cancelled" ? "Bill cancelled" : "Bill reopened",
				color: "info",
				icon: next === "cancelled" ? "i-lucide-ban" : "i-lucide-rotate-ccw"
			});
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const showDeleteDialog = ref(false);
	const deleteConfirmInput = ref("");
	const askDelete = () => {
		deleteConfirmInput.value = "";
		showDeleteDialog.value = true;
	};
	// Bills with recorded payments require typed-name confirmation, since
	// removing them strips the link from the (kept) payment vouchers and
	// loses the bill's record. Unpaid bills delete on a single click —
	// there's nothing destructive about it.
	const needsTypedConfirm = computed(() => paidCents.value > 0);
	const canConfirmDelete = computed(() => {
		if (!bill.value) return false;
		if (!needsTypedConfirm.value) return true;
		return deleteConfirmInput.value.trim() === bill.value.number;
	});
	const confirmDelete = async () => {
		if (!bill.value || !canConfirmDelete.value) return;
		showDeleteDialog.value = false;
		try {
			await store.remove(billId);
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

	// ---- PDF export ----------------------------------------------------------
	// Bills are an internal record of vendor invoices we received. The PDF is
	// for our own filing — the vendor block becomes the "Bill from" party.
	// We don't render bank details or a "Prepared by" sign-off here (those
	// belong on outbound documents).
	const buildPdfPayload = (lineRows: BillLineRow[]) => {
		const b = bill.value!;
		const snap = vendorSnapshot.value;
		const cityLine = [snap?.city, snap?.postal_code].filter(Boolean).join(" ").trim();
		const addressLines = [snap?.address_line1, snap?.address_line2, cityLine || null, snap?.country]
			.filter((s): s is string => Boolean(s && s.trim()));
		const hasVat = (b.tax_cents ?? 0) !== 0;

		const fmt = (cents: number) => formatLKR(cents);
		const fmtNoSym = (cents: number) => formatLKR(cents, { withSymbol: false });

		const paid = store.paidCentsFor(b.id);
		const balanceCentsValue = Math.max(0, b.total_cents - paid);

		return {
			kind: "bill",
			number: b.number,
			title: "BILL",
			theme_color: themeHex(settingsStore.settings?.theme_color),
			font_family: settingsStore.settings?.pdf_font ?? "Inter",
			currency_code: currency.value.code,
			currency_symbol: currency.value.symbol,
			primary_label: "Bill",
			date_label: "Date",
			date_value: b.issue_date,
			secondary_label: "Due date",
			secondary_value: b.due_date,
			vendor_invoice_label: b.vendor_invoice_number ? "Vendor inv #" : null,
			vendor_invoice_value: b.vendor_invoice_number ?? null,
			party_label: "Bill from",
			party: snap
				? {
					name: snap.name,
					tax_id: snap.tax_id ?? null,
					address_lines: addressLines
				}
				: { name: "(no vendor)", tax_id: null, address_lines: [] },
			project_title: categoryNameFromSnapshot(b.category_snapshot)
				? `Category: ${categoryNameFromSnapshot(b.category_snapshot)}`
				: "",
			pricing_mode: b.pricing_mode,
			has_vat: hasVat,
			notes: b.notes ?? "",
			notes_paragraphs: (b.notes ?? "").split(/\n\s*\n/).filter((p) => p.trim().length > 0),
			prepared_by: "",
			paid_cents: paid > 0 ? paid : null,
			paid_display: paid > 0 ? fmtNoSym(paid) : null,
			balance_display: paid > 0 ? fmtNoSym(balanceCentsValue) : null,
			business_name: settingsStore.settings?.business_name ?? null,
			website: settingsStore.settings?.website ?? null,
			phone: settingsStore.settings?.phone ?? null,
			address_line1: settingsStore.settings?.address_line1 ?? null,
			city: settingsStore.settings?.city ?? null,
			logo_path: settingsStore.settings?.pdf_header_logo_path ?? null,
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
