<template>
	<div v-if="invoice" class="select-none">
		<!-- select-none on the page root: labels, totals, and other static
			copy aren't drag-selectable; form fields stay selectable via the
			input rule in main.css, so editing a draft invoice still works. -->
		<!-- Top toolbar row: back link on the left, action cluster on the
			right. Pinned above the title block so the buttons can't
			collide with the number / status / subtitle as the viewport
			narrows — same shape as the address-book detail pages. -->
		<div class="mb-4 flex items-center justify-between gap-4">
			<NuxtLink to="/invoices" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to invoices
			</NuxtLink>

			<!-- md+ inline cluster. Below md this collapses into a single
				⋯ dropdown so the toolbar stays a tidy two-element row on
				narrow windows; both paths share the same handlers. -->
			<div class="hidden md:flex gap-2 items-center shrink-0">
				<UButton
					v-if="canRecordPayments"
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
					:title="dirty ? 'Save first' : 'Preview this invoice as a PDF'"
					@click="onPdfClick"
				>
					PDF & Print
				</UButton>
				<!-- Legal next-state transitions as individual buttons —
					replaces an opaque 'Status' dropdown so the available
					moves are visible at a glance. Same pattern as quotes. -->
				<UButton
					v-for="a in transitionActions"
					:key="a.label"
					size="sm"
					color="neutral"
					variant="outline"
					:icon="a.icon"
					@click="a.onSelect"
				>
					{{ a.label }}
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
					@click="askDelete"
				>
					{{ isDraft ? "Delete draft" : "Delete" }}
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

		<header class="mb-6">
			<h1 class="text-2xl font-semibold flex items-center gap-3 flex-wrap">
				<span class="tabular-nums">{{ invoice.number }}</span>
				<StatusBadge :status="status" size="md" />
				<span v-if="!editable" class="app-chrome text-xs text-(--ui-text-muted) font-normal">
					read-only after issue
				</span>
			</h1>
			<NuxtLink
				v-if="invoice.source_quote_id"
				:to="`/quotes/${invoice.source_quote_id}`"
				class="text-xs text-(--ui-primary) hover:underline mt-1 inline-flex items-center gap-1"
			>
				<UIcon name="i-lucide-link" class="size-3" />
				Converted from quote
			</NuxtLink>
		</header>

		<div class="space-y-6">
			<UCard>
				<template #header>
					<div class="app-chrome flex items-center justify-between">
						<div class="app-chrome font-medium">
							Client &amp; project
						</div>
						<UButton
							v-if="editable"
							size="xs"
							variant="ghost"
							color="neutral"
							icon="i-lucide-refresh-ccw"
							@click="refreshClientSnapshot"
						>
							Refresh client snapshot
						</UButton>
					</div>
				</template>
				<!-- 1:3 split at md+: see quote detail page for rationale. -->
				<div class="grid grid-cols-1 md:grid-cols-4 gap-6">
					<div class="md:col-span-1">
						<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) mb-1">
							Bill to
						</div>
						<div class="text-sm">
							<div class="font-medium">
								{{ clientSnapshot?.name }}
							</div>
							<div v-if="clientSnapshot?.address_line1" class="text-(--ui-text-muted)">
								{{ clientSnapshot.address_line1 }}
							</div>
							<div v-if="clientSnapshot?.address_line2" class="text-(--ui-text-muted)">
								{{ clientSnapshot.address_line2 }}
							</div>
							<div v-if="clientSnapshot?.city || clientSnapshot?.country" class="text-(--ui-text-muted)">
								{{ [clientSnapshot.city, clientSnapshot.postal_code, clientSnapshot.country].filter(Boolean).join(", ") }}
							</div>
							<div v-if="clientSnapshot?.tax_id" class="text-(--ui-text-muted) mt-1 text-xs">
								Tax ID: {{ clientSnapshot.tax_id }}
							</div>
						</div>
					</div>
					<!-- Right column uses a 2-col inner grid — see quote
						detail page for the rationale. md:col-span-3 ties
						to the 1:3 outer split. -->
					<div class="md:col-span-3 grid grid-cols-2 gap-3">
						<UFormField label="PDF header">
							<UInput
								v-model="formTitleOverride"
								:disabled="!editable"
								placeholder="INVOICE"
							/>
							<template #help>
								Big PDF header. Blank = INVOICE.
							</template>
						</UFormField>
						<UFormField label="Project title">
							<UInput v-model="formProjectTitle" :disabled="!editable" />
							<template #help>
								Centered subtitle on the PDF.
							</template>
						</UFormField>
						<UFormField label="Issue date">
							<DateField v-model="formIssueDate" :disabled="!editable" />
						</UFormField>
						<UFormField label="Due date">
							<DateField v-model="formDueDate" :min-value="formIssueDate || undefined" :disabled="!editable" />
						</UFormField>
						<UFormField label="Bank account" class="col-span-2">
							<USelect
								v-model="formBankId"
								:items="bankPickerOptions"
								value-key="value"
								class="w-full"
								:disabled="!editable"
							/>
							<template #help>
								Printed on the PDF so the client knows where to pay.
							</template>
						</UFormField>
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
				</template>
				<DocumentLineEditor
					:model-value="lines"
					:mode="pricingMode"
					:disabled="!editable"
					@update:model-value="onLinesChange"
				/>
			</UCard>

			<!-- Totals + Notes share a row on large screens: Totals is a
				compact money summary (~2/5), Notes & sign-off takes the
				wider ~3/5. items-start so the shorter Totals card doesn't
				stretch. The Payments table sits full-width below. -->
			<div class="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
				<UCard class="lg:col-span-2">
					<template #header>
						<div class="app-chrome font-medium">
							Totals &amp; payments
						</div>
					</template>

					<div v-if="pricingMode === 'bundle' && editable" class="space-y-3">
						<UFormField label="Invoice subtotal" help="Total exclusive of VAT.">
							<MoneyInput v-model="bundleSubtotalCents" />
						</UFormField>
						<UFormField label="VAT rate (%)" help="Set to 0 for a tax-free invoice.">
							<UInputNumber
								v-model="vatRatePct"
								:step="0.01"
								:min="0"
								:max="100"
								class="md:w-32"
							/>
						</UFormField>
					</div>

					<div class="flex justify-end" :class="{ 'border-t border-(--ui-border) pt-4 mt-4': pricingMode === 'bundle' && editable }">
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
							<!-- Overpaid pill: linked receipts sum to more than the
							invoice total. Soft warning — the user might have
							a legitimate reason (refund correction, advance)
							but the discrepancy should be visible. -->
							<div v-if="overpaid" class="font-semibold text-(--ui-warning) pt-0.5">
								Overpaid by {{ formatLKR(overpaymentCents) }}
							</div>
						</div>
					</div>
				</UCard>
				<UCard class="lg:col-span-3">
					<template #header>
						<div class="app-chrome font-medium">
							Notes &amp; sign-off
						</div>
					</template>
					<div class="grid grid-cols-1 gap-4">
						<UFormField label="Notes">
							<UTextarea v-model="formNotes" :rows="6" :disabled="!editable" />
						</UFormField>
						<UFormField label="Terms">
							<UTextarea v-model="formTerms" :rows="3" :disabled="!editable" />
						</UFormField>
						<UFormField label="Prepared by">
							<UInput v-model="formPreparedBy" :disabled="!editable" />
						</UFormField>
					</div>
				</UCard>
			</div>

			<!-- Receipt vouchers linked to this invoice. Vouchers are the
				single source of truth for cash flow — the "paid" /
				"balance" numbers above are sums of these rows. Click a row
				to open the voucher; click the header button to create a
				new receipt voucher pre-filled against this invoice. -->
			<UCard v-if="!isDraft">
				<template #header>
					<div class="app-chrome flex items-center justify-between">
						<div>
							<div class="app-chrome font-medium">
								Payments
							</div>
							<div class="text-xs text-(--ui-text-muted) mt-0.5">
								<span v-if="payments.length === 0">No payments recorded yet — each "Record payment" creates a voucher in the cash ledger.</span>
								<span v-else>{{ payments.length }} receipt voucher{{ payments.length === 1 ? "" : "s" }} · {{ formatLKR(paidCents) }} of {{ formatLKR(totalCents) }} received.</span>
							</div>
						</div>
						<UButton
							v-if="canRecordPayments"
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
							<td class="py-2 pl-2 pr-3 text-right tabular-nums whitespace-nowrap font-medium text-(--ui-success)">
								+ {{ formatLKR(v.amount_cents) }}
							</td>
						</tr>
					</tbody>
				</table>
			</UCard>

			<!-- Attachments — scans / photos of the invoice. Local file
				picker + phone-upload flow, shared with the other document
				detail pages via AttachmentsCard. -->
			<AttachmentsCard document-type="invoice" :document-id="invoiceId" />

			<!-- Sticky save bar — same accented variant the quote / client /
				employee pages use. Only visible while the invoice is still
				editable (draft) and the form is dirty. -->
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

		<UModal v-model:open="showDeleteDialog" :title="`Delete ${invoice.number}?`">
			<template #body>
				<div class="space-y-3 text-sm">
					<p class="text-(--ui-text-muted)">
						This permanently removes the invoice and its line items. The
						number {{ invoice.number }} will not be reused — it'll show
						as a gap in your sequence.
					</p>
					<div v-if="!isDraft" class="rounded-md border border-(--ui-warning)/40 bg-(--ui-warning)/10 p-3 space-y-2">
						<p class="font-medium text-(--ui-text)">
							This invoice has been issued ({{ status }}<span v-if="paidCents > 0">, {{ formatLKR(paidCents) }} received</span>).
						</p>
						<p class="text-(--ui-text-muted)">
							Deleting issued documents breaks the rule that issued
							records are immutable.
							<span v-if="payments.length > 0">{{ payments.length }} receipt voucher{{ payments.length === 1 ? "" : "s" }} will be kept but become un-linked.</span>
							<span v-if="invoice.source_quote_id">The source quote's link to this invoice will be cleared.</span>
							Only do this if it's a real mistake to scrub from your
							books.
						</p>
						<UFormField :label="`Type ${invoice.number} to confirm`">
							<UInput v-model="deleteConfirmInput" :placeholder="invoice.number" autofocus />
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
						{{ isDraft ? "Delete draft" : "Delete anyway" }}
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
			title="Invoice PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Invoice editor — mirrors the quote editor.
//
// Once an invoice is sent, the header/lines are frozen. Payments are
// not stored on the invoice any more (migration 0014 dropped
// invoice_payments and invoices.paid_cents). They live as receipt
// vouchers with related_invoice_id; the "paid" / "balance" / status
// values you see here are derived in JS from those linked vouchers.
// "Record payment" routes to /vouchers/new?invoice=N which pre-fills
// the voucher form against this invoice and bounces back here on save.

	import type { LineDraft } from "~/components/DocumentLineEditor.vue";
	import type { ClientRow } from "~/stores/clients";
	import type { InvoiceLineRow, InvoicePersistedStatus, InvoiceRow, InvoiceStatus } from "~/stores/invoices";
	import type { ClientSnapshot, PricingMode } from "~/stores/quotes";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { buildInvoicePdfPayload } from "~/lib/invoice-pdf";
	import { computeLineTotals, formatLKR, sumCents } from "~/lib/money";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Invoice" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const settingsStore = useSettingsStore();
	const banksStore = useBusinessBanksStore();
	const clientsStore = useClientsStore();
	const invoicesStore = useInvoicesStore();
	const vouchersStore = useVouchersStore();
	const currency = useActiveCurrency();

	const invoiceId = Number(route.params.id);
	if (!Number.isFinite(invoiceId)) {
		throw createError({ statusCode: 404, statusMessage: "Invoice not found" });
	}

	const invoice = ref<InvoiceRow | null>(null);
	const lines = ref<LineDraft[]>([]);
	const saving = ref(false);
	const dirty = ref(false);
	const hydrating = ref(false);

	const bundleSubtotalCents = ref<number>(0);
	const vatRatePct = ref<number>(0);
	const formIssueDate = ref("");
	const formDueDate = ref("");
	const formProjectTitle = ref("");
	const formNotes = ref("");
	const formTerms = ref("");
	const formPreparedBy = ref("");
	const formBankId = ref<number | null>(null);
	// PDF big-header override. Empty = "INVOICE" default in the PDF
	// builder (see app/lib/invoice-pdf.ts). Stored as-is; the builder
	// upper-cases at render time.
	const formTitleOverride = ref("");

	// Bank picker options: every active bank plus a "no bank" entry so the
	// user can deliberately render an invoice without a bank block on the
	// PDF.
	const bankPickerOptions = computed(() => {
		const items: { label: string, value: number | null }[] = [
			{ label: "— No bank —", value: null }
		];
		for (const b of banksStore.activeBanks) {
			const suffix = b.bank_account_number ? ` · ${b.bank_account_number}` : "";
			items.push({ label: `${b.label}${suffix}`, value: b.id });
		}
		return items;
	});

	const pricingMode = computed<PricingMode>(() => invoice.value?.pricing_mode ?? "bundle");
	// Persisted bit (draft|sent|cancelled) drives editability and the
	// status FSM. The user-visible status (the badge / list filter)
	// uses the derived enum below.
	const persistedStatus = computed<InvoicePersistedStatus>(() => invoice.value?.status ?? "draft");
	const status = computed<InvoiceStatus>(() =>
		invoice.value ? invoicesStore.derivedStatus(invoice.value) : "draft"
	);
	const isDraft = computed(() => persistedStatus.value === "draft");
	const editable = computed(() => isDraft.value);
	// Receipts can only be recorded against issued, non-cancelled
	// invoices that still have an outstanding balance. Drafts /
	// cancellations / fully-paid invoices bail out — the persisted
	// status stays 'sent' forever after issue (the user-visible
	// paid/partial/overdue states are derived), so balanceCents > 0
	// is the right check for 'still expecting money'.

	const totalCents = computed(() => invoice.value?.total_cents ?? 0);
	const paidCents = computed(() => (invoice.value ? invoicesStore.paidCentsFor(invoice.value.id) : 0));
	const balanceCents = computed(() => Math.max(0, totalCents.value - paidCents.value));
	// Overpaid surface — sum of receipts > invoice total. derivedStatus
	// still reads "paid" (capped); this is purely informational.
	const overpaymentCents = computed(() => Math.max(0, paidCents.value - totalCents.value));
	const overpaid = computed(() => overpaymentCents.value > 0);

	const canRecordPayments = computed(() =>
		persistedStatus.value === "sent" && balanceCents.value > 0
	);

	// Receipt vouchers linked to this invoice, most-recent first.
	// Reactive against the vouchers store so creating/editing/deleting
	// a receipt elsewhere reflects here immediately.
	const payments = computed(() =>
		invoice.value ? invoicesStore.linkedPayments(invoice.value.id) : []
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

	const clientSnapshot = computed<ClientSnapshot | null>(() => {
		if (!invoice.value?.client_snapshot) return null;
		try {
			return JSON.parse(invoice.value.client_snapshot) as ClientSnapshot;
		} catch {
			return null;
		}
	});

	// Vouchers store is loaded too — derived paid / status / payments
	// panel all read off it. If a deep-link navigates straight here,
	// the panel would otherwise be empty until a manual refresh.
	await Promise.all([
		settingsStore.ensureLoaded(),
		banksStore.ensureLoaded(),
		clientsStore.load(),
		vouchersStore.load()
	]);

	const hydrate = async () => {
		hydrating.value = true;
		const row = await invoicesStore.get(invoiceId);
		if (!row) {
			hydrating.value = false;
			throw createError({ statusCode: 404, statusMessage: "Invoice not found" });
		}
		invoice.value = row;
		formIssueDate.value = row.issue_date;
		formDueDate.value = row.due_date;
		formProjectTitle.value = row.project_title;
		formNotes.value = row.notes ?? "";
		formTerms.value = row.terms ?? "";
		formPreparedBy.value = row.prepared_by ?? "";
		formBankId.value = row.business_bank_id;
		formTitleOverride.value = row.title_override ?? "";
		vatRatePct.value = row.vat_rate_basis_points / 100;
		bundleSubtotalCents.value = row.subtotal_cents;

		const lineRows: InvoiceLineRow[] = await invoicesStore.getLines(invoiceId);
		lines.value = lineRows.map((l) => ({
			item_label: l.item_label,
			description: l.description,
			quantity_milli: l.quantity_milli,
			unit: l.unit,
			unit_price_cents: l.unit_price_cents,
			tax_rate_basis_points: l.tax_rate_basis_points
		}));

		// Linked receipt vouchers come from the vouchers store reactively
		// — nothing to fetch here. See the `payments` computed above.
		dirty.value = false;
		// Let the form-field watcher's queued run flush before unsetting the
		// guard, so re-hydrate after save doesn't immediately re-dirty.
		await nextTick();
		hydrating.value = false;
	};

	await hydrate();

	// Mark dirty when any of the directly v-model'd form fields change.
	// Registered after the initial hydrate so the population pass doesn't trip
	// it. Re-runs of hydrate() reset dirty to false at the end, so the watcher
	// firing during a re-hydrate is harmless.
	watch(
		[formProjectTitle, formIssueDate, formDueDate, formNotes, formTerms, formPreparedBy, formBankId, formTitleOverride, vatRatePct, bundleSubtotalCents],
		() => {
			if (editable.value && !hydrating.value) dirty.value = true;
		}
	);

	// Add N days to a YYYY-MM-DD string.
	function addDays(iso: string, days: number): string {
		const [y, m, d] = iso.split("-").map(Number);
		if (!y || !m || !d) return iso;
		const dt = new Date(y, m - 1, d);
		dt.setDate(dt.getDate() + days);
		return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
	}

	// When the issue date changes, re-derive due_date from the business's
	// payment-terms setting (issue + N days) — the same rule the
	// new-invoice flow uses — so the due date tracks Settings instead of
	// stranding the old date.
	watch(formIssueDate, (next) => {
		if (!editable.value || hydrating.value || !next) return;
		const days = settingsStore.settings?.default_payment_terms_days ?? 0;
		formDueDate.value = addDays(next, days);
	});

	const computedTotals = computed(() => {
		if (pricingMode.value === "itemized") {
			const subs = lines.value.map((l) => computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_subtotal_cents);
			const tx = lines.value.map((l) => computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_tax_cents);
			const tot = lines.value.map((l) => computeLineTotals(l.quantity_milli, l.unit_price_cents, l.tax_rate_basis_points).line_total_cents);
			return {
				subtotal: sumCents(...subs),
				tax: sumCents(...tx),
				total: sumCents(...tot)
			};
		}
		const sub = bundleSubtotalCents.value;
		const taxCents = Math.round((sub * Math.round(vatRatePct.value * 100)) / 10000);
		return { subtotal: sub, tax: taxCents, total: sub + taxCents };
	});

	const togglePricingMode = (mode: PricingMode) => {
		if (!invoice.value || invoice.value.pricing_mode === mode || !editable.value) return;
		invoice.value = { ...invoice.value, pricing_mode: mode };
		dirty.value = true;
	};

	const onLinesChange = (next: LineDraft[]) => {
		lines.value = next;
		dirty.value = true;
	};

	const refreshClientSnapshot = async () => {
		if (!invoice.value || !editable.value) return;
		const c: ClientRow | undefined = clientsStore.clients.find((cr) => cr.id === invoice.value!.client_id);
		if (!c) return;
		const snap = invoicesStore.buildClientSnapshot(c);
		invoice.value = { ...invoice.value, client_snapshot: snap };
		dirty.value = true;
		toast.add({ title: "Client snapshot refreshed", color: "info", icon: "i-lucide-refresh-ccw" });
	};

	const save = async () => {
		if (!invoice.value || !editable.value) return;
		saving.value = true;
		try {
			const totalsFromLines = await invoicesStore.replaceLines(invoiceId, lines.value);
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

			// Re-snapshot the bank from its current row at every save so
			// label / account-number edits flow into the snapshot while the
			// invoice is still a draft. Once issued the picker is read-only
			// and the snapshot stays frozen.
			const bankSnapshot = await banksStore.buildSnapshotForId(formBankId.value);

			await invoicesStore.update(invoiceId, {
				pricing_mode: invoice.value.pricing_mode,
				project_title: formProjectTitle.value,
				issue_date: formIssueDate.value,
				due_date: formDueDate.value,
				vat_rate_basis_points: bp,
				subtotal_cents: subtotal,
				tax_cents: tax,
				total_cents: total,
				notes: formNotes.value || null,
				terms: formTerms.value || null,
				prepared_by: formPreparedBy.value || null,
				client_snapshot: invoice.value.client_snapshot,
				business_bank_id: formBankId.value,
				bank_details_snapshot: bankSnapshot,
				title_override: formTitleOverride.value.trim() || null
			});
			await invoicesStore.load();
			await hydrate();
			toast.add({ title: "Invoice saved", color: "success", icon: "i-lucide-check" });
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

	// Persisted status transitions are now extremely simple — only the
	// three states the user sets directly. Legal moves:
	//   draft     → sent (issue), cancelled
	//   sent      → cancelled
	//   cancelled → sent (reopen — the most likely prior state was sent;
	//               drafts that get cancelled tend to be deleted instead)
	const setPersistedStatus = async (target: InvoicePersistedStatus) => {
		if (!invoice.value) return;
		if (dirty.value) {
			toast.add({ title: "Save your changes first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		try {
			await invoicesStore.setStatus(invoiceId, target);
			await hydrate();
			const messages: Record<InvoicePersistedStatus, string> = {
				draft: "Reverted to draft",
				sent: "Marked as sent",
				cancelled: "Cancelled"
			};
			toast.add({ title: messages[target], color: "info", icon: "i-lucide-check" });
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Legal next-state actions for the current persisted status. Rendered
	// as individual buttons in the header so the available transitions
	// are visible at a glance — no dropdown. Same pattern as quotes.
	interface TransitionAction {
		label: string
		icon: string
		onSelect: () => void
	}
	const transitionActions = computed<TransitionAction[]>(() => {
		const cur = persistedStatus.value;
		const items: TransitionAction[] = [];
		if (cur === "draft") {
			items.push({ label: "Send", icon: "i-lucide-send", onSelect: () => setPersistedStatus("sent") });
			items.push({ label: "Cancel", icon: "i-lucide-ban", onSelect: () => setPersistedStatus("cancelled") });
		} else if (cur === "sent") {
			// Hide Cancel once any payment has landed — the store also
			// refuses this with a clear error, but keeping the button
			// off-screen is friendlier UX.
			if (paidCents.value === 0) {
				items.push({ label: "Cancel", icon: "i-lucide-ban", onSelect: () => setPersistedStatus("cancelled") });
			}
		} else if (cur === "cancelled") {
			items.push({ label: "Reopen", icon: "i-lucide-rotate-ccw", onSelect: () => setPersistedStatus("sent") });
		}
		return items;
	});

	const showDeleteDialog = ref(false);
	const deleteConfirmInput = ref("");
	const askDelete = () => {
		deleteConfirmInput.value = "";
		showDeleteDialog.value = true;
	};
	// Drafts: plain confirmation. Issued: typed-name confirmation, since this
	// also wipes the payment ledger and detaches reverse FKs.
	const canConfirmDelete = computed(() => {
		if (!invoice.value) return false;
		if (isDraft.value) return true;
		return deleteConfirmInput.value.trim() === invoice.value.number;
	});
	const confirmDelete = async () => {
		if (!invoice.value || !canConfirmDelete.value) return;
		showDeleteDialog.value = false;
		try {
			await invoicesStore.remove(invoiceId);
			toast.add({
				title: isDraft.value ? "Draft deleted" : "Invoice deleted",
				color: "info",
				icon: "i-lucide-trash-2"
			});
			await router.replace("/invoices");
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Recording a payment is now creating a receipt voucher pre-filled
	// against this invoice. The New Voucher page reads ?invoice=N from
	// the query string and seeds voucher_type=receipt, the client name,
	// related_invoice_id, and the outstanding balance as the amount.
	// Redirects back here on save.
	const goRecordPayment = () => {
		if (dirty.value) {
			toast.add({
				title: "Save your changes first",
				description: "Otherwise the invoice's outstanding balance might not match.",
				color: "warning",
				icon: "i-lucide-circle-alert"
			});
			return;
		}
		router.push(`/vouchers/new?invoice=${invoiceId}`);
	};

	// ---- PDF export ----------------------------------------------------------
	// The actual payload builder lives in app/lib/invoice-pdf.ts so the
	// list page can call it from its row context menu without duplicating
	// logic.
	const buildPdfPayload = (lineRows: InvoiceLineRow[]) =>
		buildInvoicePdfPayload({
			row: invoice.value!,
			lines: lineRows,
			settings: settingsStore.settings,
			currency: currency.value,
			paidCents: invoicesStore.paidCentsFor(invoice.value!.id)
		});

	// Preview-then-save flow. Same pattern as quotes/[id].vue — see there
	// for the rationale on the linesForPreview cache.
	const linesForPreview = ref<InvoiceLineRow[]>([]);
	watch([() => invoiceId, () => invoice.value?.updated_at], async () => {
		try {
			linesForPreview.value = await invoicesStore.getLines(invoiceId);
		} catch { /* surfaced when user clicks PDF */ }
	}, { immediate: true });

	const pdf = usePdfPreview({
		command: "export_invoice_pdf",
		buildPayload: () => buildPdfPayload(linesForPreview.value),
		fileName: () => `${invoice.value?.number ?? "invoice"}.pdf`,
		title: "Invoice PDF preview"
	});

	const onPdfClick = () => {
		if (!invoice.value || dirty.value) return;
		pdf.open();
	};

	// Items rendered into the responsive UDropdownMenu shown below xl
	// (the inline cluster above is hidden at that width). Grouped so
	// the dropdown draws separators between Record-payment + PDF,
	// transitions, and Delete. Declared at the end so the handlers it
	// references are already in scope.
	const actionMenuItems = computed(() => {
		const primary: { label: string, icon: string, disabled?: boolean, onSelect: () => void }[] = [];
		if (canRecordPayments.value) {
			primary.push({
				label: "Record payment",
				icon: "i-lucide-circle-dollar-sign",
				onSelect: goRecordPayment
			});
		}
		primary.push({
			label: "PDF & Print",
			icon: "i-lucide-file-down",
			disabled: dirty.value || pdf.state.rendering,
			onSelect: onPdfClick
		});

		const destructive = [{
			label: isDraft.value ? "Delete draft" : "Delete",
			icon: "i-lucide-trash-2",
			class: "text-(--ui-error) hover:bg-(--ui-error)/10 [&>span>span:first-child]:text-(--ui-error)",
			onSelect: askDelete
		}];

		return [primary, transitionActions.value, destructive].filter((g) => g.length > 0);
	});
</script>
