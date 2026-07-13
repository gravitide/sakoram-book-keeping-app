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

		<div class="space-y-6">
			<!-- "Read this first" summary: identity on the left, the money that
				matters (Total / Paid / Balance) as big tiles on the right. All
				values come from existing computeds — see InvoiceSummaryHero. -->
			<InvoiceSummaryHero
				:number="invoice.number"
				:status="status"
				:client-name="clientSnapshot?.name"
				:issue-date="formIssueDate"
				:due-date="formDueDate"
				:total-cents="computedTotals.total"
				:paid-cents="paidCents"
				:balance-cents="balanceCents"
				:overpaid-cents="overpaymentCents"
				:editable="editable"
			/>
			<!-- Conversion relationship: this invoice was created from a quote.
				Full-width banner above the Reference / Bill-to grid; the source
				quote's summary is resolved into `sourceQuote` on load. -->
			<ConversionBanner
				v-if="sourceQuote"
				lead="Converted from quote"
				:number="sourceQuote.number"
				:issue-date="sourceQuote.issue_date"
				:total-cents="sourceQuote.total_cents"
				:status="sourceQuote.status"
				:to="`/quotes/${sourceQuote.id}`"
			/>
			<!-- Two cards side-by-side at lg+: Reference (form fields) on
				the left wider, Bill-to snapshot on the right narrower.
				At md they stack with Bill to on TOP — the snapshot
				identifies who the invoice is for, so it leads the page
				when there's only one column. DOM order matches that
				(Bill to first); at lg+ we explicitly place Bill to in
				col 3 via `lg:col-start-3` so it visually moves to the
				right while Reference auto-flows into cols 1-2. Mirrors
				the bills detail page's split-card pattern. -->
			<div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
				<!-- Right column (Bill to + Bank details). `contents` on narrow
					so the three cards flow into the grid directly and `order` can
					slot Reference between them (Bill to → Reference → Bank
					details); `lg:block` restores the stacked right column. -->
				<div class="contents lg:block lg:col-span-2 lg:col-start-4 lg:row-start-1 lg:space-y-6">
					<UCard class="order-1 lg:order-none">
						<template #header>
							<div class="app-chrome flex items-center justify-between gap-2">
								<div class="app-chrome font-medium">
									Bill to
								</div>
								<!-- Cross-doc shortcuts + re-snapshot, all as
								icon-only buttons so they sit inline in the
								header of a ~340px col-span-1 card without
								wrapping. Open client routes to the client
								detail page; View all invoices pre-filters
								the invoices list to this client; Refresh
								re-snapshots the client's current row data
								(draft-only — sent invoices keep their frozen
								snapshot). -->
								<div class="flex items-center gap-1">
									<UButton
										size="xs"
										variant="ghost"
										color="neutral"
										icon="i-lucide-external-link"
										title="Open client"
										aria-label="Open client"
										@click="openClient"
									/>
									<UButton
										size="xs"
										variant="ghost"
										color="neutral"
										icon="i-lucide-receipt"
										title="View all invoices for this client"
										aria-label="View all invoices for this client"
										@click="viewClientInvoices"
									/>
									<UButton
										v-if="editable"
										size="xs"
										variant="ghost"
										color="neutral"
										icon="i-lucide-refresh-ccw"
										title="Refresh client snapshot — pull the latest details from the client record"
										aria-label="Refresh client snapshot"
										@click="refreshClientSnapshot"
									/>
								</div>
							</div>
						</template>
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
					</UCard>

					<UCard class="order-3 lg:order-none">
						<template #header>
							<div class="app-chrome font-medium">
								Bank details
							</div>
						</template>
						<UFormField label="Bank account">
							<USelect
								v-model="formBankId"
								:items="bankPickerOptions"
								value-key="value"
								class="w-full"
								:disabled="!editable"
							>
								<!-- Colour dot per account (grey = no bank) so the
									picker reads at a glance — see BankColorDot. -->
								<template #leading>
									<BankColorDot :color="bankPickerOptions.find((o) => o.value === formBankId)?.color" />
								</template>
								<template #item-leading="{ item }">
									<BankColorDot :color="item.color" />
								</template>
							</USelect>
							<template #help>
								Printed on the PDF so the client knows where to pay.
							</template>
						</UFormField>
					</UCard>
				</div>

				<UCard class="order-2 lg:order-none lg:col-span-3 lg:row-start-1">
					<template #header>
						<div class="app-chrome font-medium">
							Reference
						</div>
					</template>
					<!-- Number on its own row, then PDF header (half width),
						project title full width, and the two dates side by side. -->
					<div class="space-y-3 max-w-3xl">
						<UFormField label="Number">
							<div class="flex items-center gap-3">
								<UInputNumber
									v-model="editNum.sequence.value"
									:min="1"
									:step="1"
									:disabled="!editable"
									class="w-40"
								/>
								<span v-if="editNum.numberTaken.value" class="text-sm text-(--ui-error)">
									{{ editNum.numberFormatted.value }} is already in use.
								</span>
								<span v-else-if="editNum.changed.value && editNum.numberFormatted.value" class="text-sm text-(--ui-text-muted)">
									Will change to <span class="font-medium text-(--ui-text)">{{ editNum.numberFormatted.value }}</span>
								</span>
								<span v-else class="text-sm text-(--ui-text-muted)">{{ invoice.number }}</span>
							</div>
						</UFormField>
						<UFormField label="PDF header" class="w-1/2">
							<UInput
								v-model="formTitleOverride"
								:disabled="!editable"
								placeholder="INVOICE"
							/>
						</UFormField>
						<UFormField label="Project title">
							<UInput v-model="formProjectTitle" :disabled="!editable" placeholder="Subtitle on the PDF (optional)" />
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
				</template>
				<DocumentLineEditor
					:model-value="lines"
					:mode="pricingMode"
					:disabled="!editable"
					@update:model-value="onLinesChange"
				/>

				<!-- Amount entry + the document's subtotal / VAT / total breakdown,
					bound into one right-aligned panel so entry and result read as
					a single unit (no dead gap between them). The entry half only
					shows for editable bundle drafts; issued / itemized invoices
					collapse to just the totals box. The headline Total / Paid /
					Balance live in the summary hero at the top. -->
				<div class="mt-4 pt-4 border-t border-(--ui-border) flex justify-end">
					<div class="w-full sm:w-auto border border-(--ui-border) rounded-xl overflow-hidden flex flex-col sm:flex-row">
						<div
							v-if="pricingMode === 'bundle' && editable"
							class="p-4 space-y-3 sm:w-[26rem] border-b sm:border-b-0 sm:border-r border-(--ui-border)"
						>
							<div class="flex items-center justify-between gap-2">
								<span class="text-xs text-(--ui-text-muted) select-none">Amount entered is</span>
								<div class="flex border border-(--ui-border) rounded-md overflow-hidden text-xs shrink-0">
									<button
										type="button"
										class="px-3 py-1.5"
										:class="vatMode === 'exclusive' ? 'bg-(--ui-primary) text-(--ui-bg)' : 'hover:bg-(--ui-bg-muted)'"
										@click="vatMode = 'exclusive'"
									>
										Before VAT
									</button>
									<button
										type="button"
										class="px-3 py-1.5 border-l border-(--ui-border)"
										:class="vatMode === 'inclusive' ? 'bg-(--ui-primary) text-(--ui-bg)' : 'hover:bg-(--ui-bg-muted)'"
										@click="vatMode = 'inclusive'"
									>
										VAT-inclusive
									</button>
								</div>
							</div>
							<UFormField v-if="vatMode === 'exclusive'" label="Invoice subtotal" help="Total exclusive of VAT.">
								<MoneyInput v-model="bundleSubtotalCents" />
							</UFormField>
							<UFormField v-else label="Grand total (incl. VAT)" help="We split out the subtotal and VAT below.">
								<MoneyInput v-model="grandTotalCents" />
							</UFormField>
							<div class="ml-auto max-w-[12rem] space-y-2">
								<div class="flex justify-end">
									<UCheckbox
										:model-value="vatEnabled"
										label="Charge VAT"
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
										class="w-full"
									/>
								</UFormField>
							</div>
						</div>
						<div class="p-4 sm:w-64 bg-(--ui-bg-muted) tabular-nums text-sm flex flex-col justify-center space-y-1">
							<div class="flex justify-between gap-8">
								<span class="text-(--ui-text-muted)">Subtotal</span>
								<span>{{ formatLKR(computedTotals.subtotal) }}</span>
							</div>
							<div v-if="computedTotals.tax !== 0" class="flex justify-between gap-8">
								<span class="text-(--ui-text-muted)">VAT</span>
								<span>{{ formatLKR(computedTotals.tax) }}</span>
							</div>
							<div class="flex justify-between gap-8 items-baseline pt-2.5 mt-1.5 border-t border-(--ui-border-accented) font-semibold text-lg">
								<span>Total</span>
								<span>{{ formatLKR(computedTotals.total) }}</span>
							</div>
						</div>
					</div>
				</div>
			</UCard>

			<!-- Notes & sign-off — the printed prose. Full width now that the
				totals result moved into the summary hero and the amount entry into
				the Items card footer. -->
			<UCard>
				<template #header>
					<div class="app-chrome font-medium">
						Notes &amp; sign-off
					</div>
				</template>
				<div class="grid grid-cols-1 gap-4">
					<UFormField label="Notes" hint="Rich text shown below the items table on the PDF.">
						<RichTextEditor v-model="formNotes" :editable="editable" :min-height="140" tables />
					</UFormField>
					<UFormField label="Terms" hint="Optional — kept for your reference; not printed on the PDF.">
						<RichTextEditor v-model="formTerms" :editable="editable" :min-height="100" />
					</UFormField>
					<UFormField label="Prepared by" hint="Rich-text sign-off, right-aligned at the bottom of the PDF.">
						<div class="space-y-2">
							<div v-if="editable" class="flex justify-end">
								<SignaturePicker v-model="formPreparedBy" />
							</div>
							<RichTextEditor v-model="formPreparedBy" :editable="editable" :min-height="110" />
						</div>
					</UFormField>
				</div>
			</UCard>

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
						<UFormField>
							<template #label>
								<span class="text-(--ui-text-muted)">Type</span>
								<button
									type="button"
									class="mx-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-(--ui-text) bg-(--ui-bg) border border-(--ui-border-accented) hover:border-(--ui-primary) transition align-middle"
									title="Copy number"
									@click="copyNumber"
								>
									{{ invoice.number }}
									<UIcon name="i-lucide-copy" class="size-3" />
								</button>
								<span class="text-(--ui-text-muted)">to confirm</span>
							</template>
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
	import type { ClientSnapshot, PricingMode, QuoteRow } from "~/stores/quotes";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { buildInvoicePdfPayload } from "~/lib/invoice-pdf";
	import { computeLineTotals, formatLKR, sumCents } from "~/lib/money";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useLicenseStore } from "~/stores/license";
	import { useQuotesStore } from "~/stores/quotes";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Invoice" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const settingsStore = useSettingsStore();
	const license = useLicenseStore();
	const banksStore = useBusinessBanksStore();
	const clientsStore = useClientsStore();
	const invoicesStore = useInvoicesStore();
	const quotesStore = useQuotesStore();
	const vouchersStore = useVouchersStore();
	const currency = useActiveCurrency();

	const invoiceId = Number(route.params.id);
	if (!Number.isFinite(invoiceId)) {
		throw createError({ statusCode: 404, statusMessage: "Invoice not found" });
	}

	const invoice = ref<InvoiceRow | null>(null);
	// Source-quote summary for the "Converted from quote" banner. Resolved in
	// hydrate() only when this invoice carries a source_quote_id.
	const sourceQuote = ref<QuoteRow | null>(null);
	const lines = ref<LineDraft[]>([]);
	const saving = ref(false);
	const dirty = ref(false);
	const hydrating = ref(false);

	const bundleSubtotalCents = ref<number>(0);
	const vatRatePct = ref<number>(0);
	// "Charge VAT" toggle. The persisted source of truth stays the rate
	// (0 = no VAT), so vatEnabled derives from the rate on hydrate. Toggling
	// it off zeroes the rate; toggling on restores the last non-zero rate
	// (falling back to the SL-standard 18% the first time).
	const vatEnabled = ref<boolean>(false);
	const lastVatPct = ref<number>(18);
	// VAT entry mode (ephemeral UI state, not persisted). 'exclusive' = type
	// the net subtotal, VAT added on top (default). 'inclusive' = type the
	// gross grand total and we split out subtotal + VAT from the rate. The
	// stored value is always the net subtotal_cents + rate, so a reload shows
	// the net breakdown regardless of which mode it was entered in.
	const vatMode = ref<"exclusive" | "inclusive">("exclusive");
	// Two-way bridge for inclusive mode. Getter reconstructs the gross total
	// from the stored net subtotal + rate; setter splits an entered gross back
	// into net subtotal (tax = total × rate / (100% + rate)).
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
	const setVatEnabled = (on: boolean) => {
		vatEnabled.value = on;
		if (on) {
			vatRatePct.value = lastVatPct.value > 0 ? lastVatPct.value : 18;
		} else {
			if (vatRatePct.value > 0) lastVatPct.value = vatRatePct.value;
			vatRatePct.value = 0;
		}
	};
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
		const items: { label: string, value: number | null, color: string | null }[] = [
			{ label: "— No bank —", value: null, color: null }
		];
		for (const b of banksStore.activeBanks) {
			const suffix = b.bank_account_number ? ` · ${b.bank_account_number}` : "";
			items.push({ label: `${b.label}${suffix}`, value: b.id, color: b.color });
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

	// Editable draft number — live uniqueness check (excludes this invoice),
	// applied on save via invoicesStore.setNumber. Disabled once issued.
	const editNum = useEditableDocumentNumber({
		type: "invoice",
		id: invoiceId,
		currentNumber: computed(() => invoice.value?.number ?? null),
		enabled: computed(() => editable.value && !hydrating.value)
	});
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
	// All four use ensureLoaded so a second visit to /invoices/[id] is
	// instant (Pinia state survives navigation; only a tenant switch
	// or explicit .load() refetches). The first visit still cold-loads
	// each store — same cost — but every subsequent open is free.
	await Promise.all([
		settingsStore.ensureLoaded(),
		banksStore.ensureLoaded(),
		clientsStore.ensureLoaded(),
		vouchersStore.ensureLoaded()
	]);

	const hydrate = async () => {
		hydrating.value = true;
		const row = await invoicesStore.get(invoiceId);
		if (!row) {
			hydrating.value = false;
			throw createError({ statusCode: 404, statusMessage: "Invoice not found" });
		}
		invoice.value = row;
		// Resolve the source quote for the conversion banner (non-fatal).
		sourceQuote.value = row.source_quote_id
			? await quotesStore.get(row.source_quote_id).catch(() => null)
			: null;
		formIssueDate.value = row.issue_date;
		formDueDate.value = row.due_date;
		formProjectTitle.value = row.project_title;
		formNotes.value = row.notes ?? "";
		formTerms.value = row.terms ?? "";
		formPreparedBy.value = row.prepared_by ?? "";
		formBankId.value = row.business_bank_id;
		formTitleOverride.value = row.title_override ?? "";
		vatRatePct.value = row.vat_rate_basis_points / 100;
		vatEnabled.value = vatRatePct.value > 0;
		if (vatRatePct.value > 0) lastVatPct.value = vatRatePct.value;
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
		editNum.reseed();
		dirty.value = false;
		// Let the form-field watcher's queued run flush before unsetting the
		// guard, so re-hydrate after save doesn't immediately re-dirty.
		await nextTick();
		hydrating.value = false;
	};

	await hydrate();

	// Re-hydrate whenever the page is re-shown from the <NuxtPage keepalive>
	// cache, so the "Converted from quote" banner reflects the current DB.
	// When the source quote is deleted, quotes.remove() nulls this invoice's
	// source_quote_id; without re-hydrating, the cached page keeps showing the
	// stale banner (and its dead link) until the app restarts. Skips the first
	// activation (setup already hydrated) and preserves unsaved edits.
	let activatedOnce = false;
	onActivated(async () => {
		if (!activatedOnce) {
			activatedOnce = true;
			return;
		}
		if (dirty.value) return;
		const row = await invoicesStore.get(invoiceId).catch(() => null);
		if (!row) {
			toast.add({ title: "This invoice no longer exists", color: "info", icon: "i-lucide-info" });
			await router.replace("/invoices");
			return;
		}
		await hydrate();
	});

	// Mark dirty when any of the directly v-model'd form fields change.
	// Registered after the initial hydrate so the population pass doesn't trip
	// it. Re-runs of hydrate() reset dirty to false at the end, so the watcher
	// firing during a re-hydrate is harmless.
	watch(
		[formProjectTitle, formIssueDate, formDueDate, formNotes, formTerms, formPreparedBy, formBankId, formTitleOverride, vatRatePct, bundleSubtotalCents, editNum.sequence],
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

	// Cross-doc shortcuts on the Bill-to card. Same pattern as the
	// clients detail page's "View invoices" action — set the destination
	// list's clientFilter (Pinia state survives navigation), clear other
	// filters, then route. `openClient` is the plain-navigation variant
	// so the user can jump to the client profile from inside an invoice.
	const openClient = () => {
		if (!invoice.value) return;
		void router.push(`/clients/${invoice.value.client_id}`);
	};
	const viewClientInvoices = () => {
		if (!invoice.value) return;
		invoicesStore.search = "";
		invoicesStore.clearStatusFilters();
		invoicesStore.clearDateFilters();
		invoicesStore.clientFilter = invoice.value.client_id;
		void router.push("/invoices");
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
		if (editNum.changed.value && !editNum.numberValid.value) {
			toast.add({ title: "Pick an unused invoice number", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
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
			// Apply a draft number change (uniqueness enforced in the store).
			if (editNum.changed.value && editNum.numberValid.value && editNum.sequence.value !== null) {
				await invoicesStore.setNumber(invoiceId, editNum.sequence.value);
			}
			await invoicesStore.load();
			await hydrate();
			toast.add({
				title: "Invoice saved",
				color: "success",
				icon: "i-lucide-check"
			});
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
			// No Cancel on drafts — a never-issued invoice is just deleted
			// (Delete draft button); cancelled is for voiding issued docs.
			items.push({ label: "Send", icon: "i-lucide-send", onSelect: () => setPersistedStatus("sent") });
		} else if (cur === "sent") {
			// Hide Revert/Cancel once any payment has landed — the store
			// also refuses both with a clear error, but keeping the
			// buttons off-screen is friendlier UX.
			if (paidCents.value === 0) {
				items.push({ label: "Revert to draft", icon: "i-lucide-rotate-ccw", onSelect: () => setPersistedStatus("draft") });
				items.push({ label: "Cancel", icon: "i-lucide-ban", onSelect: () => setPersistedStatus("cancelled") });
			}
		} else if (cur === "cancelled") {
			// Reopen resumes the issued document (refund flow); Revert to
			// draft reopens it for full editing instead.
			items.push({ label: "Reopen", icon: "i-lucide-rotate-ccw", onSelect: () => setPersistedStatus("sent") });
			items.push({ label: "Revert to draft", icon: "i-lucide-undo-2", onSelect: () => setPersistedStatus("draft") });
		}
		return items;
	});

	const showDeleteDialog = ref(false);
	const deleteConfirmInput = ref("");
	const askDelete = () => {
		deleteConfirmInput.value = "";
		showDeleteDialog.value = true;
	};

	// Click-to-copy the invoice number in the confirm dialog — saves the user
	// hand-typing a long document number just to confirm a delete.
	const copyNumber = async () => {
		const n = invoice.value?.number;
		if (!n) return;
		try {
			await navigator.clipboard.writeText(n);
			toast.add({ title: "Number copied", color: "success", icon: "i-lucide-copy" });
		} catch {
			toast.add({ title: "Couldn't copy", color: "error", icon: "i-lucide-circle-alert" });
		}
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
			paidCents: invoicesStore.paidCentsFor(invoice.value!.id),
			entitledToTemplates: license.hasFeature("pdf_templates")
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
