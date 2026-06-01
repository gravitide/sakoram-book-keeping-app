<template>
	<div v-if="bill" class="select-none">
		<!-- Top toolbar row: back link on the left, action cluster on the
			right. Pinned above the title block so the buttons can't
			collide with the number / status / subtitle as the viewport
			narrows. flex-wrap on the row lets the cluster spill onto a
			second toolbar row at very narrow widths instead of crashing
			into the title; the cluster itself stays inline (no dropdown
			collapse — bills has fewer header actions than quotes /
			invoices, so a dropdown would be overkill). -->
		<div class="mb-4 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
			<NuxtLink to="/bills" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to bills
			</NuxtLink>
			<div class="flex gap-2 items-center flex-wrap shrink-0">
				<!-- Paid bills go read-only by default (mirrors the
					voucher detail page) — a fully-paid bill is essentially
					a settled record, so a stray click shouldn't introduce
					unintended changes. Click Edit to flip into mutate
					mode; Discard re-hydrates and snaps back to
					read-only. -->
				<UButton
					v-if="isPaid && !isCancelled && !editing"
					size="sm"
					icon="i-lucide-pencil"
					variant="soft"
					color="neutral"
					@click="editing = true"
				>
					Edit
				</UButton>
				<UButton
					v-if="balanceCents > 0 && !isCancelled"
					size="sm"
					color="primary"
					icon="i-lucide-circle-dollar-sign"
					@click="goRecordPayment"
				>
					Record payment
				</UButton>
				<UButton
					size="sm"
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
					size="sm"
					color="neutral"
					variant="outline"
					:icon="isCancelled ? 'i-lucide-rotate-ccw' : 'i-lucide-ban'"
					@click="toggleCancelled"
				>
					{{ isCancelled ? "Reopen bill" : "Mark cancelled" }}
				</UButton>

				<!-- Visual separator before the destructive action so a
					stray click on Cancel doesn't land on Delete. -->
				<div class="h-6 w-px bg-(--ui-border-accented) mx-1" />

				<UButton
					size="sm"
					color="error"
					variant="soft"
					icon="i-lucide-trash-2"
					@click="askDelete"
				>
					Delete
				</UButton>
			</div>
		</div>

		<header class="mb-6">
			<h1 class="text-2xl font-semibold flex items-center gap-3 flex-wrap">
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
		</header>

		<div class="space-y-6">
			<!-- Two cards side-by-side at lg+: Reference (form fields) on
				the left wider, Bill-from snapshot on the right narrower.
				At md they stack with Bill from on TOP — the snapshot
				identifies who the bill is from, so it leads the page
				when there's only one column. DOM order matches that
				(Bill from first); at lg+ we explicitly place Bill from
				in col 3 via `lg:col-start-3` so it visually moves to
				the right while Reference auto-flows into cols 1-2.

				We're trialling this split on bills first — if it reads
				well, we'll mirror it on quote / invoice detail pages too. -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<UCard class="lg:col-span-1 lg:col-start-3">
					<template #header>
						<div class="app-chrome flex items-center justify-between gap-2">
							<div class="app-chrome font-medium">
								Bill from
							</div>
							<!-- Re-snapshot the vendor's current row data
								(address moved, tax ID updated, etc.).
								Editable-state only; sent / paid bills
								keep their frozen snapshot. -->
							<!-- Icon-only because the Bill-from card sits at
								col-span-1 (~340px wide) at lg+ and the
								full "Refresh vendor snapshot" label wraps
								and squeezes the card title. Hover gives
								the full description via title. -->
							<UButton
								v-if="editable"
								size="xs"
								variant="ghost"
								color="neutral"
								icon="i-lucide-refresh-ccw"
								title="Refresh vendor snapshot — pull the latest details from the vendor record"
								aria-label="Refresh vendor snapshot"
								@click="refreshVendorSnapshot"
							/>
						</div>
					</template>
					<div class="text-sm">
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
					<!-- Cross-doc shortcuts. Open vendor routes to the
						vendor detail page; View all bills pre-filters
						the bills list to this vendor. Same pattern the
						address-book hero uses (clients / vendors /
						employees detail pages). -->
					<div class="mt-4 pt-3 border-t border-(--ui-border) flex flex-wrap gap-2">
						<UButton
							size="xs"
							variant="soft"
							color="neutral"
							icon="i-lucide-external-link"
							@click="openVendor"
						>
							Open vendor
						</UButton>
						<UButton
							size="xs"
							variant="soft"
							color="neutral"
							icon="i-lucide-file-text"
							@click="viewVendorBills"
						>
							View all bills
						</UButton>
					</div>
				</UCard>

				<UCard class="lg:col-span-2 lg:row-start-1">
					<template #header>
						<div class="app-chrome font-medium">
							Reference
						</div>
					</template>
					<!-- 2-col inner grid; max-w-3xl keeps inputs from
						stretching when the card is wide. -->
					<div class="grid grid-cols-2 gap-3 max-w-3xl">
						<UFormField label="PDF header">
							<UInput
								v-model="formTitleOverride"
								:disabled="!editable"
								placeholder="BILL"
							/>
						</UFormField>
						<UFormField label="Vendor invoice #">
							<UInput v-model="formVendorInvoiceNumber" :disabled="!editable" placeholder="The number on THEIR invoice" />
						</UFormField>
						<UFormField label="Category">
							<CategoryPicker v-model="formCategoryId" :disabled="!editable" />
							<template #help>
								Manage the list under Contacts → Bill categories.
							</template>
						</UFormField>
						<!-- Empty cell: keeps Issue+Due paired on the next
							row instead of Issue auto-flowing next to
							Category. -->
						<div />
						<UFormField label="Issue date">
							<DateField v-model="formIssueDate" :disabled="!editable" />
						</UFormField>
						<UFormField label="Due date">
							<DateField v-model="formDueDate" :min-value="formIssueDate || undefined" :disabled="!editable" />
						</UFormField>
					</div>
				</UCard>
			</div>

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

				<div v-if="pricingMode === 'bundle'" class="space-y-3">
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-(--ui-text-muted) select-none">Amount entered is</span>
						<div class="flex gap-1">
							<UButton
								size="xs"
								:variant="vatMode === 'exclusive' ? 'solid' : 'ghost'"
								:color="vatMode === 'exclusive' ? 'primary' : 'neutral'"
								:disabled="!editable"
								@click="vatMode = 'exclusive'"
							>
								Before VAT
							</UButton>
							<UButton
								size="xs"
								:variant="vatMode === 'inclusive' ? 'solid' : 'ghost'"
								:color="vatMode === 'inclusive' ? 'primary' : 'neutral'"
								:disabled="!editable"
								@click="vatMode = 'inclusive'"
							>
								VAT-inclusive
							</UButton>
						</div>
					</div>
					<UFormField v-if="vatMode === 'exclusive'" label="Bill subtotal" help="Total exclusive of VAT.">
						<MoneyInput
							v-model="bundleSubtotalCents"
							:disabled="!editable"
							class="w-full"
						/>
					</UFormField>
					<UFormField v-else label="Grand total (incl. VAT)" help="We split out the subtotal and VAT below.">
						<MoneyInput
							v-model="grandTotalCents"
							:disabled="!editable"
							class="w-full"
						/>
					</UFormField>
					<div class="ml-auto max-w-[12rem] space-y-2">
						<div class="flex justify-end">
							<UCheckbox
								:model-value="vatEnabled"
								label="Charge VAT"
								:disabled="!editable"
								@update:model-value="(v) => setVatEnabled(v === true)"
							/>
						</div>
						<UFormField
							v-if="vatEnabled"
							label="VAT rate (%)"
							:ui="{ labelWrapper: 'justify-end', label: 'text-right' }"
						>
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
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { buildBillPdfPayload } from "~/lib/bill-pdf";
	import { computeLineTotals, formatLKR, sumCents } from "~/lib/money";
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
	const categoriesStore = useBillCategoriesStore();
	const vendorsStore = useVendorsStore();
	const vouchersStore = useVouchersStore();
	const currency = useActiveCurrency();
	settingsStore.ensureLoaded().catch(() => { /* surfaced elsewhere */ });
	// Vendors / categories / vouchers might not be loaded yet if the
	// user lands here via deep link. Vouchers are essential — the
	// Payments panel reads them and the derived "paid" / "balance" /
	// status all fall out of the voucher ledger. Vendors backs the
	// Refresh-snapshot button on the Bill-from card.
	// Fire-and-forget — payments panel + vendor refresh + category
	// picker hydrate as these arrive. ensureLoaded dedupes concurrent
	// calls and skips when the store's already cached (subsequent
	// visits to /bills/[id] are instant).
	vendorsStore.ensureLoaded().catch(() => { /* surfaced elsewhere */ });
	categoriesStore.ensureLoaded().catch(() => { /* surfaced via picker empty state */ });
	vouchersStore.ensureLoaded().catch(() => { /* non-fatal — payments panel just stays empty */ });

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
	// "Charge VAT" toggle + VAT entry mode — mirrors the invoice totals card.
	// Persisted source of truth stays the net subtotal_cents + rate, so these
	// derive on hydrate and need no columns of their own.
	const vatEnabled = ref<boolean>(false);
	const lastVatPct = ref<number>(18);
	const setVatEnabled = (on: boolean) => {
		vatEnabled.value = on;
		if (on) {
			vatRatePct.value = lastVatPct.value > 0 ? lastVatPct.value : 18;
		} else {
			if (vatRatePct.value > 0) lastVatPct.value = vatRatePct.value;
			vatRatePct.value = 0;
		}
	};
	// 'exclusive' = type the net subtotal (default); 'inclusive' = type the
	// gross grand total and split out the net + VAT from the rate.
	const vatMode = ref<"exclusive" | "inclusive">("exclusive");
	const grandTotalCents = computed<number>({
		get: () => {
			const bp = Math.round(vatRatePct.value * 100);
			return bundleSubtotalCents.value + Math.round((bundleSubtotalCents.value * bp) / 10000);
		},
		set: (total) => {
			const bp = Math.round(vatRatePct.value * 100);
			const tax = Math.round((total * bp) / (10000 + bp));
			bundleSubtotalCents.value = Math.max(0, total - tax);
		}
	});

	const formVendorInvoiceNumber = ref("");
	const formIssueDate = ref("");
	const formDueDate = ref("");
	const formCategoryId = ref<number | null>(null);
	const formNotes = ref("");
	// PDF big-header override. Empty = "BILL" default in the PDF
	// builder (see app/lib/bill-pdf.ts). Stored as-is; the builder
	// upper-cases at render time.
	const formTitleOverride = ref("");

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
	// `editing` is the user's explicit "I want to edit a paid bill" toggle.
	// Cancelled bills are terminal — no override. Other persisted-open
	// bills are editable as usual unless they're fully paid; once paid,
	// the page goes read-only by default and shows an Edit button that
	// flips this ref. Mirrors the voucher detail page's pattern.
	const editing = ref(false);
	const isPaid = computed(() => bill.value ? store.derivedStatus(bill.value) === "paid" : false);
	const editable = computed(() => {
		if (!bill.value) return false;
		if (isCancelled.value) return false;
		if (isPaid.value && !editing.value) return false;
		return true;
	});
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
		formTitleOverride.value = row.title_override ?? "";
		vatRatePct.value = row.vat_rate_basis_points / 100;
		vatEnabled.value = vatRatePct.value > 0;
		if (vatRatePct.value > 0) lastVatPct.value = vatRatePct.value;
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
		[formVendorInvoiceNumber, formIssueDate, formDueDate, formCategoryId, formNotes, formTitleOverride, vatRatePct, bundleSubtotalCents],
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

	// Vendor on a bill is locked at create time (matches the
	// client-on-quote / client-on-invoice pattern) — there's no picker
	// on the detail page so the user can't re-link a bill to a
	// different vendor. To fix a mis-tagged bill, delete + re-create.
	//
	// The snapshot, however, IS user-refreshable while the bill is
	// editable. When the vendor's row changes (they moved, new tax ID,
	// etc.), the Refresh button on the Bill-from card pulls the
	// current vendor row into the bill's frozen snapshot. Sent / paid
	// bills (non-editable) stay frozen as before.
	// Cross-doc shortcuts on the Bill-from card. Same pattern as the
	// vendors detail page's "View bills" action — set the destination
	// list's vendorFilter (Pinia state survives navigation), clear other
	// filters, then route. `openVendor` is the plain-navigation variant
	// so the user can jump to the vendor profile from inside a bill.
	const openVendor = () => {
		if (!bill.value) return;
		void router.push(`/vendors/${bill.value.vendor_id}`);
	};
	const viewVendorBills = () => {
		if (!bill.value) return;
		store.search = "";
		store.clearStatusFilters();
		store.clearDateFilters();
		store.vendorFilter = bill.value.vendor_id;
		void router.push("/bills");
	};

	const refreshVendorSnapshot = () => {
		if (!editable.value || !bill.value) return;
		const v = vendorsStore.vendors.find((x) => x.id === bill.value!.vendor_id);
		if (!v) {
			toast.add({ title: "Vendor not found", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
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

			// vendor_id stays locked (no picker on the detail page);
			// vendor_snapshot is updatable via the Refresh button on
			// the Bill-from card, so we include it in the update.
			await store.update(billId, {
				pricing_mode: bill.value.pricing_mode,
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
				notes: formNotes.value || null,
				title_override: formTitleOverride.value.trim() || null
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
	// resets the form refs and clears `dirty`. Also exits the
	// paid-bill edit override — discarding a paid-bill edit should
	// snap straight back to read-only, not leave the fields enabled.
	const onDiscard = async () => {
		if (saving.value) return;
		await hydrate();
		if (isPaid.value) editing.value = false;
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
	// Bills are an internal record of vendor invoices we received. Payload
	// shape lives in `app/lib/bill-pdf.ts` so the list page can render
	// from the same builder for its row action + bulk export.
	const buildPdfPayload = (lineRows: BillLineRow[]) =>
		buildBillPdfPayload({
			row: bill.value!,
			lines: lineRows,
			settings: settingsStore.settings,
			currency: currency.value,
			paidCents: store.paidCentsFor(bill.value!.id)
		});

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
