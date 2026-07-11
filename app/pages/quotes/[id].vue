<template>
	<div v-if="quote" class="select-none">
		<!-- Top toolbar row: back link on the left, action cluster on the
			right. Pinned above the title block so the buttons can't
			collide with the number / status / subtitle as the viewport
			narrows — same shape as the address-book detail pages. -->
		<div class="mb-4 flex items-center justify-between gap-4">
			<NuxtLink to="/quotes" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to quotes
			</NuxtLink>

			<!-- md+ inline cluster. Below md this collapses into a single
				⋯ dropdown so the toolbar stays a tidy two-element row on
				narrow windows; both paths share the same handlers. -->
			<div class="hidden md:flex gap-2 items-center shrink-0">
				<UButton
					size="sm"
					color="neutral"
					variant="outline"
					icon="i-lucide-file-down"
					:loading="pdf.state.rendering"
					:disabled="dirty || pdf.state.rendering"
					:title="dirty ? 'Save first' : 'Preview this quote as a PDF'"
					@click="onPdfClick"
				>
					PDF & Print
				</UButton>
				<UButton
					v-if="canConvert"
					size="sm"
					color="primary"
					icon="i-lucide-receipt"
					@click="askConvert"
				>
					Convert to invoice
				</UButton>
				<!-- Escape hatch for a conversion done in error: deletes the
					linked invoice and returns this quote to draft. The store
					refuses while the invoice has recorded payments. -->
				<UButton
					v-if="canRevert"
					size="sm"
					color="warning"
					variant="outline"
					icon="i-lucide-undo-2"
					@click="askRevert"
				>
					Revert to draft
				</UButton>
				<!-- Legal next-state transitions as individual buttons —
					replaces an opaque 'Status' dropdown so the available
					moves are visible at a glance. Hidden when no
					transitions are legal (terminal states). -->
				<UButton
					v-for="t in transitionActions"
					:key="t.label"
					size="sm"
					color="neutral"
					variant="outline"
					:icon="t.icon"
					@click="t.onSelect"
				>
					{{ t.label }}
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
			<!-- "Read this first" summary: identity + the quote total, surfaced
				at the top. Values come from existing computeds — see
				QuoteSummaryHero. -->
			<QuoteSummaryHero
				:number="quote.number"
				:status="status"
				:client-name="clientSnapshot?.name"
				:project-title="formProjectTitle || null"
				:issue-date="formIssueDate"
				:valid-until="formValidUntil"
				:total-cents="computedTotals.total"
				:editable="editable"
			/>
			<!-- Conversion relationship: this quote was turned into an invoice.
				Full-width banner above the Reference / Quote-to grid; the linked
				invoice's summary is resolved into `convertedInvoice` on load. -->
			<ConversionBanner
				v-if="convertedInvoice"
				lead="Converted to invoice"
				:number="convertedInvoice.number"
				:issue-date="convertedInvoice.issue_date"
				:total-cents="convertedInvoice.total_cents"
				:status="convertedInvoiceStatus"
				:to="`/invoices/${convertedInvoice.id}`"
			/>
			<!-- Two cards side-by-side at lg+: Reference (form fields) on
				the left wider, Quote-to snapshot on the right narrower.
				At md they stack with Quote to on TOP — the snapshot
				identifies who the quote is for, so it leads the page
				when there's only one column. DOM order matches that
				(Quote to first); at lg+ we explicitly place Quote to in
				col 3 via `lg:col-start-3` so it visually moves to the
				right while Reference auto-flows into cols 1-2. Mirrors
				the bills detail page's split-card pattern. -->
			<div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
				<!-- Right column (Quote to + Bank details). `contents` on narrow
					so the three cards flow into the grid directly and `order` can
					slot Reference between them (Quote to → Reference → Bank
					details); `lg:block` restores the stacked right column. -->
				<div class="contents lg:block lg:col-span-2 lg:col-start-4 lg:row-start-1 lg:space-y-6">
					<UCard class="order-1 lg:order-none">
						<template #header>
							<div class="flex items-center justify-between gap-2">
								<div class="font-medium">
									Quote to
								</div>
								<!-- Cross-doc shortcuts + re-snapshot, all as
								icon-only buttons so they sit inline in the
								header of a ~340px col-span-1 card without
								wrapping. Open client routes to the client
								detail page; View all quotes pre-filters
								the quotes list to this client; Refresh
								re-snapshots the client's current row data
								(draft-only — sent quotes keep their frozen
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
										icon="i-lucide-file-text"
										title="View all quotes for this client"
										aria-label="View all quotes for this client"
										@click="viewClientQuotes"
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
							<div class="font-medium">
								Bank details
							</div>
						</template>
						<div class="space-y-3">
							<div class="flex items-center gap-2">
								<USwitch v-model="formIncludeBank" :disabled="!editable" />
								<span class="text-sm text-(--ui-text-muted)">Print payment / bank details on this quote</span>
							</div>
							<UFormField v-if="formIncludeBank" label="Bank account">
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
					</UCard>
				</div>

				<UCard class="order-2 lg:order-none lg:col-span-3 lg:row-start-1">
					<template #header>
						<div class="font-medium">
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
								<span v-else class="text-sm text-(--ui-text-muted)">{{ quote.number }}</span>
							</div>
						</UFormField>
						<UFormField label="PDF header" class="w-1/2">
							<UInput
								v-model="formTitleOverride"
								:disabled="!editable"
								placeholder="QUOTATION"
							/>
						</UFormField>
						<UFormField label="Project title">
							<UInput v-model="formProjectTitle" :disabled="!editable" placeholder="Subtitle on the PDF (optional)" />
						</UFormField>
						<div class="grid grid-cols-2 gap-3">
							<UFormField label="Issue date">
								<DateField v-model="formIssueDate" :disabled="!editable" />
							</UFormField>
							<UFormField label="Valid until">
								<DateField v-model="formValidUntil" :min-value="formIssueDate || undefined" :disabled="!editable" />
							</UFormField>
						</div>
					</div>
				</UCard>
			</div>

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
						<span v-if="pricingMode === 'bundle'">Scope rows on the left + a single grand total below.</span>
						<span v-else>Each row carries its own quantity, price, and VAT.</span>
					</p>
				</template>

				<DocumentLineEditor
					:model-value="lines"
					:mode="pricingMode"
					:disabled="!editable"
					@update:model-value="onLinesChange"
				/>

				<!-- Amount entry + subtotal / VAT / total, bound into one
					right-aligned panel (mirrors the invoice page). Entry half
					shows only for editable bundle drafts; issued / itemized
					quotes collapse to just the totals box. The headline Total
					also appears in the summary hero at the top. -->
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
							<UFormField v-if="vatMode === 'exclusive'" label="Quote subtotal" help="Total price for this quote, exclusive of VAT.">
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

			<!-- Notes & sign-off — full width, mirroring the invoice page
				(the totals moved into the summary hero + the Items footer). -->
			<UCard>
				<template #header>
					<div class="font-medium">
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

			<!-- Attachments — scans / photos of the quote. Shared card,
				same as the invoice / bill / voucher detail pages. -->
			<AttachmentsCard document-type="quote" :document-id="quoteId" />

			<!-- Sticky save bar — same pattern as Settings → Company and the
				client / employee edit pages. Pinned to the bottom of the
				scrollable <main> ancestor; only appears when the form is
				dirty *and* the quote is still editable (sent/converted
				quotes lock the form). -->
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

		<UModal v-model:open="showConvertDialog" title="Convert to invoice?">
			<template #body>
				<div class="space-y-4">
					<div class="text-sm text-(--ui-text-muted) space-y-2">
						<p>
							A new draft invoice will be created with the same client, line
							items, totals, and project title from this quote. The quote will
							be marked as <span class="font-medium text-(--ui-text)">converted</span>
							and locked.
						</p>
						<p>
							Pick the invoice's issue date — the due date follows from it
							plus your default payment terms. Leave the number as-is to take
							the next in the INV sequence, or set one to fill a gap.
						</p>
					</div>
					<!-- Side by side: both inputs are short, and the pair reads as
						one "stamp the new invoice" decision. items-start keeps the
						date field pinned to the top when the number's help line
						wraps below it. -->
					<div class="grid grid-cols-2 gap-4 items-start">
						<UFormField label="Issue date">
							<DateField v-model="convertIssueDate" />
						</UFormField>
						<UFormField label="Invoice number" required>
							<template #help>
								<span v-if="convertDocNum.numberTaken.value" class="text-(--ui-error)">
									{{ convertDocNum.numberFormatted.value }} is already in use — pick another sequence.
								</span>
								<span v-else-if="convertDocNum.numberFormatted.value">
									Will be saved as <span class="font-medium">{{ convertDocNum.numberFormatted.value }}</span>
								</span>
							</template>
							<UInputNumber
								v-model="convertDocNum.sequence.value"
								:min="1"
								:step="1"
							/>
						</UFormField>
					</div>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showConvertDialog = false">
						Cancel
					</UButton>
					<UButton
						:loading="converting"
						:disabled="!convertDocNum.numberValid.value"
						icon="i-lucide-receipt"
						@click="confirmConvert"
					>
						Create invoice
					</UButton>
				</div>
			</template>
		</UModal>

		<UModal v-model:open="showRevertDialog" title="Revert to draft?">
			<template #body>
				<div class="space-y-3 text-sm">
					<p class="text-(--ui-text-muted)">
						Invoice
						<span class="font-medium text-(--ui-text)">{{ convertedInvoice?.number ?? "linked to this quote" }}</span>
						and its attachments will be <span class="font-medium text-(--ui-text)">permanently deleted</span>,
						and this quote returns to an editable draft.
					</p>
					<p class="text-(--ui-text-muted)">
						The invoice number won't be reused automatically — it'll show as
						a gap you can fill from the next convert or New-invoice dialog.
					</p>
					<!-- Payments recorded against the invoice block the revert.
						List them with links so the user can jump straight to
						each voucher and delete it, instead of hunting the
						ledger for whatever the guard message meant. -->
					<div v-if="revertVouchers.length > 0" class="rounded-md border border-(--ui-warning)/40 bg-(--ui-warning)/10 p-3 space-y-2">
						<p class="font-medium text-(--ui-text)">
							{{ revertVouchers.length === 1 ? "A payment is" : `${revertVouchers.length} payments are` }} recorded against this invoice
						</p>
						<p class="text-(--ui-text-muted)">
							Reverting is blocked while these receipt vouchers exist.
							Delete them first, then revert.
						</p>
						<ul class="space-y-1">
							<li v-for="v in revertVouchers" :key="v.id">
								<!-- Close on navigate: this page is kept alive, so a
									still-open dialog would show a stale voucher list
									when the user comes back after deleting one.
									Re-opening re-fetches. -->
								<NuxtLink
									:to="`/vouchers/${v.id}`"
									class="inline-flex items-center gap-1.5 text-(--ui-text) hover:text-(--ui-primary) underline underline-offset-2"
									@click="showRevertDialog = false"
								>
									<UIcon name="i-lucide-receipt" class="size-3.5 shrink-0" />
									<span class="font-medium">{{ v.number }}</span>
									<span class="text-(--ui-text-muted)">· {{ v.voucher_date }} · {{ formatLKR(v.amount_cents) }}</span>
								</NuxtLink>
							</li>
						</ul>
					</div>
					<p v-else class="text-(--ui-text-muted)">
						No payments are recorded against this invoice.
					</p>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="outline" @click="showRevertDialog = false">
						Cancel
					</UButton>
					<UButton
						color="error"
						:loading="reverting"
						:disabled="revertVouchers.length > 0"
						icon="i-lucide-undo-2"
						@click="confirmRevert"
					>
						Revert to draft
					</UButton>
				</div>
			</template>
		</UModal>

		<UModal v-model:open="showDeleteDialog" :title="`Delete ${quote.number}?`">
			<template #body>
				<div class="space-y-3 text-sm">
					<p class="text-(--ui-text-muted)">
						This permanently removes the quote and its line items. The
						number {{ quote.number }} will not be reused — it'll show as a
						gap in your sequence.
					</p>
					<div v-if="quote.converted_invoice_id" class="rounded-md border border-(--ui-info)/40 bg-(--ui-info)/10 p-3 space-y-1">
						<p class="font-medium text-(--ui-text)">
							Linked to an invoice
						</p>
						<p class="text-(--ui-text-muted)">
							This quote was converted into invoice
							<span class="font-medium text-(--ui-text)">{{ convertedInvoice?.number ?? "an invoice" }}</span>.
							Deleting the quote keeps that invoice but clears its
							“converted from” link.
						</p>
					</div>
					<div v-if="!isDraft" class="rounded-md border border-(--ui-warning)/40 bg-(--ui-warning)/10 p-3 space-y-2">
						<p class="font-medium text-(--ui-text)">
							This quote has been issued ({{ status }}).
						</p>
						<p class="text-(--ui-text-muted)">
							Deleting issued documents breaks the rule that issued
							records are immutable. Only do this if it's a real
							mistake you need to scrub from your books.
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
									{{ quote.number }}
									<UIcon name="i-lucide-copy" class="size-3" />
								</button>
								<span class="text-(--ui-text-muted)">to confirm</span>
							</template>
							<UInput v-model="deleteConfirmInput" :placeholder="quote.number" autofocus />
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
			title="Quote PDF preview"
			@save="pdf.onSave"
			@cancel="pdf.onCancel"
		/>
	</div>
</template>

<script setup lang="ts">
// Quote editor.
//
// Layout intent: mirrors the user's reference PDF — the form has the same
// blocks (Client, Project title, Items, Totals, Notes, Bank, Sign-off). The
// PDF in Phase 6 will render this same data using that exact layout.
//
// Edit-locking: only drafts are freely editable. Once sent, only `notes`
// stay editable; everything else is frozen to keep the issued document
// consistent with what the client received. This intentionally enforces
// the "issued documents are immutable" property.

	import type { LineDraft } from "~/components/DocumentLineEditor.vue";
	import type { ClientRow } from "~/stores/clients";
	import type { InvoiceRow } from "~/stores/invoices";
	import type { ClientSnapshot, PricingMode, QuoteLineRow, QuoteRow, QuoteStatus } from "~/stores/quotes";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { select } from "~/lib/db";
	import { computeLineTotals, formatLKR, sumCents } from "~/lib/money";
	import { buildQuotePdfPayload } from "~/lib/quote-pdf";
	import { useBusinessBanksStore } from "~/stores/business_banks";
	import { useClientsStore } from "~/stores/clients";
	import { useInvoicesStore } from "~/stores/invoices";
	import { useLicenseStore } from "~/stores/license";
	import { canTransition, useQuotesStore } from "~/stores/quotes";
	import { useSettingsStore } from "~/stores/settings";
	import { useVouchersStore } from "~/stores/vouchers";

	definePageMeta({ title: "Quote" });

	const route = useRoute();
	const router = useRouter();
	const toast = useToast();

	const settingsStore = useSettingsStore();
	const license = useLicenseStore();
	const banksStore = useBusinessBanksStore();
	const clientsStore = useClientsStore();
	const quotesStore = useQuotesStore();
	const invoicesStore = useInvoicesStore();
	const vouchersStore = useVouchersStore();
	const currency = useActiveCurrency();

	const quoteId = Number(route.params.id);
	if (!Number.isFinite(quoteId)) {
		throw createError({ statusCode: 404, statusMessage: "Quote not found" });
	}

	const quote = ref<QuoteRow | null>(null);
	// Summary of the invoice this quote was converted into, for the
	// "Converted to invoice" banner. Resolved in hydrate() only when the quote
	// carries a converted_invoice_id. Its badge shows the invoice's *derived*
	// status (draft/sent/partial/paid/overdue), hence the vouchers store load.
	const convertedInvoice = ref<InvoiceRow | null>(null);
	const convertedInvoiceStatus = computed(() =>
		convertedInvoice.value ? invoicesStore.derivedStatus(convertedInvoice.value) : "draft"
	);
	const lines = ref<LineDraft[]>([]);
	const saving = ref(false);
	const dirty = ref(false);
	const hydrating = ref(false);

	// Bundle-mode subtotal entered directly (in cents).
	const bundleSubtotalCents = ref<number>(0);
	// VAT rate as percent for the UI (e.g. 18 → 18% → 1800 bp).
	const vatRatePct = ref<number>(0);
	// "Charge VAT" toggle + VAT entry mode — mirrors the invoice totals card.
	// The persisted source of truth stays the net subtotal_cents + rate, so
	// these derive on hydrate and need no columns of their own.
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
	// Field-level state that mirrors quote columns.
	const formIssueDate = ref("");
	const formValidUntil = ref("");
	const formProjectTitle = ref("");
	const formNotes = ref("");
	const formTerms = ref("");
	const formPreparedBy = ref("");
	const formBankId = ref<number | null>(null);
	// Opt-in bank/payment block on the PDF (default off). When off, the bank
	// picker is hidden and no payment details print regardless of formBankId.
	const formIncludeBank = ref(false);
	// PDF big-header override. Empty = "QUOTATION" default in the PDF
	// builder (see app/lib/quote-pdf.ts). Stored as-is; the builder
	// upper-cases at render time.
	const formTitleOverride = ref("");

	// Bank picker options: every active bank plus a "no bank" entry so the
	// user can deliberately render a quote without a bank block on the PDF.
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

	const pricingMode = computed<PricingMode>(() => quote.value?.pricing_mode ?? "bundle");
	const status = computed<QuoteStatus>(() => quote.value?.status ?? "draft");
	const isDraft = computed(() => status.value === "draft");
	const editable = computed(() => isDraft.value);

	// Editable draft number — live uniqueness check (excludes this quote),
	// applied on save via quotesStore.setNumber. Disabled once issued.
	const editNum = useEditableDocumentNumber({
		type: "quote",
		id: quoteId,
		currentNumber: computed(() => quote.value?.number ?? null),
		enabled: computed(() => editable.value && !hydrating.value)
	});

	const clientSnapshot = computed<ClientSnapshot | null>(() => {
		if (!quote.value?.client_snapshot) return null;
		try {
			return JSON.parse(quote.value.client_snapshot) as ClientSnapshot;
		} catch {
			return null;
		}
	});

	await Promise.all([
		settingsStore.ensureLoaded(),
		clientsStore.ensureLoaded(),
		banksStore.ensureLoaded(),
		vouchersStore.ensureLoaded()
	]);

	const hydrate = async () => {
		hydrating.value = true;
		const row = await quotesStore.get(quoteId);
		if (!row) {
			hydrating.value = false;
			throw createError({ statusCode: 404, statusMessage: "Quote not found" });
		}
		quote.value = row;
		// Resolve the linked invoice for the conversion banner (non-fatal).
		convertedInvoice.value = row.converted_invoice_id
			? await invoicesStore.get(row.converted_invoice_id).catch(() => null)
			: null;
		formIssueDate.value = row.issue_date;
		formValidUntil.value = row.valid_until;
		formProjectTitle.value = row.project_title;
		formNotes.value = row.notes ?? "";
		formTerms.value = row.terms ?? "";
		formPreparedBy.value = row.prepared_by ?? "";
		formBankId.value = row.business_bank_id;
		formIncludeBank.value = row.include_bank_details === 1;
		formTitleOverride.value = row.title_override ?? "";
		vatRatePct.value = row.vat_rate_basis_points / 100;
		vatEnabled.value = vatRatePct.value > 0;
		if (vatRatePct.value > 0) lastVatPct.value = vatRatePct.value;
		bundleSubtotalCents.value = row.subtotal_cents;

		const lineRows: QuoteLineRow[] = await quotesStore.getLines(quoteId);
		lines.value = lineRows.map((l) => ({
			item_label: l.item_label,
			description: l.description,
			quantity_milli: l.quantity_milli,
			unit: l.unit,
			unit_price_cents: l.unit_price_cents,
			tax_rate_basis_points: l.tax_rate_basis_points
		}));
		editNum.reseed();
		dirty.value = false;
		await nextTick();
		hydrating.value = false;
	};

	await hydrate();

	// Re-hydrate whenever the page is re-shown from the <NuxtPage keepalive>
	// cache. Without this, a quote deleted or converted elsewhere (e.g. from
	// the linked invoice) keeps rendering its stale cached copy until the app
	// restarts. Skips the very first activation (setup already hydrated) and
	// preserves unsaved edits (the whole point of keep-alive). If the quote is
	// gone, bail back to the list instead of showing a ghost.
	let activatedOnce = false;
	onActivated(async () => {
		if (!activatedOnce) {
			activatedOnce = true;
			return;
		}
		if (dirty.value) return;
		const row = await quotesStore.get(quoteId).catch(() => null);
		if (!row) {
			toast.add({ title: "This quote no longer exists", color: "info", icon: "i-lucide-info" });
			await router.replace("/quotes");
			return;
		}
		await hydrate();
	});

	// Mark dirty when any directly v-model'd form field changes. Registered
	// after the initial hydrate; hydrating-flag guards re-hydrate paths.
	watch(
		[formProjectTitle, formIssueDate, formValidUntil, formNotes, formTerms, formPreparedBy, formBankId, formIncludeBank, formTitleOverride, vatRatePct, bundleSubtotalCents, editNum.sequence],
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

	// When the issue date changes, re-derive valid_until from the
	// business's quote-validity setting (issue + N days) — the same rule
	// the new-quote flow uses — so the validity window tracks Settings
	// instead of stranding the old date.
	watch(formIssueDate, (next) => {
		if (!editable.value || hydrating.value || !next) return;
		const days = settingsStore.settings?.default_quote_validity_days ?? 0;
		formValidUntil.value = addDays(next, days);
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
		// Bundle: tax = subtotal * vat_rate
		const sub = bundleSubtotalCents.value;
		const taxCents = Math.round((sub * Math.round(vatRatePct.value * 100)) / 10000);
		return { subtotal: sub, tax: taxCents, total: sub + taxCents };
	});

	const togglePricingMode = (mode: PricingMode) => {
		if (!quote.value || quote.value.pricing_mode === mode || !editable.value) return;
		quote.value = { ...quote.value, pricing_mode: mode };
		dirty.value = true;
	};

	const onLinesChange = (next: LineDraft[]) => {
		lines.value = next;
		dirty.value = true;
	};

	// Re-snapshot the client. If the linked client has been updated since this
	// draft was made, the user can refresh the snapshot here. (Not allowed once
	// sent, since the snapshot is meant to be immutable.)
	// Cross-doc shortcuts on the Quote-to card. Same pattern as the
	// clients detail page's "View quotes" action — set the destination
	// list's clientFilter (Pinia state survives navigation), clear other
	// filters, then route. `openClient` is the plain-navigation variant
	// so the user can jump to the client profile from inside a quote.
	const openClient = () => {
		if (!quote.value) return;
		void router.push(`/clients/${quote.value.client_id}`);
	};
	const viewClientQuotes = () => {
		if (!quote.value) return;
		quotesStore.search = "";
		quotesStore.clearStatusFilters();
		quotesStore.clearDateFilters();
		quotesStore.clientFilter = quote.value.client_id;
		void router.push("/quotes");
	};

	const refreshClientSnapshot = async () => {
		if (!quote.value || !editable.value) return;
		const c: ClientRow | undefined = clientsStore.clients.find((cr) => cr.id === quote.value!.client_id);
		if (!c) return;
		const snap = quotesStore.buildClientSnapshot(c);
		quote.value = { ...quote.value, client_snapshot: snap };
		dirty.value = true;
		toast.add({ title: "Client snapshot refreshed", color: "info", icon: "i-lucide-refresh-ccw" });
	};

	const save = async () => {
		if (!quote.value || !editable.value) return;
		if (editNum.changed.value && !editNum.numberValid.value) {
			toast.add({ title: "Pick an unused quote number", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		saving.value = true;
		try {
			// Re-write all line rows. In bundle mode we still persist whatever
			// rows the user entered for scope (with qty/price 0) so the PDF can
			// render them.
			const totalsFromLines = await quotesStore.replaceLines(quoteId, lines.value);

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
			// label / account-number edits flow into the snapshot until the
			// quote is issued. Once issued, this code path is gated by
			// `editable` and the snapshot stays frozen.
			const bankSnapshot = await banksStore.buildSnapshotForId(formBankId.value);

			await quotesStore.update(quoteId, {
				pricing_mode: quote.value.pricing_mode,
				project_title: formProjectTitle.value,
				issue_date: formIssueDate.value,
				valid_until: formValidUntil.value,
				vat_rate_basis_points: bp,
				subtotal_cents: subtotal,
				tax_cents: tax,
				total_cents: total,
				notes: formNotes.value || null,
				terms: formTerms.value || null,
				prepared_by: formPreparedBy.value || null,
				client_snapshot: quote.value.client_snapshot,
				business_bank_id: formBankId.value,
				include_bank_details: formIncludeBank.value ? 1 : 0,
				bank_details_snapshot: bankSnapshot,
				title_override: formTitleOverride.value.trim() || null
			});
			// Apply a draft number change (uniqueness enforced in the store).
			if (editNum.changed.value && editNum.numberValid.value && editNum.sequence.value !== null) {
				await quotesStore.setNumber(quoteId, editNum.sequence.value);
			}
			await quotesStore.load();
			await hydrate();
			toast.add({
				title: "Quote saved",
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

	const transition = async (target: QuoteStatus) => {
		if (!quote.value) return;
		if (!canTransition(quote.value.status, target)) return;
		if (dirty.value) {
			toast.add({ title: "Save your changes first", color: "warning", icon: "i-lucide-circle-alert" });
			return;
		}
		try {
			await quotesStore.setStatus(quoteId, target);
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

	// Build the JSON payload the unified `document.typ` template consumes.
	// The actual builder lives in app/lib/quote-pdf.ts so the list page
	// can call it from its row context menu without duplicating logic.
	const buildPdfPayload = (lineRows: QuoteLineRow[]) =>
		buildQuotePdfPayload({
			row: quote.value!,
			lines: lineRows,
			settings: settingsStore.settings,
			currency: currency.value,
			entitledToTemplates: license.hasFeature("pdf_templates")
		});

	// Cache of line rows fetched at preview time. We can't make
	// buildPayload async (the composable expects sync), so we pre-fetch
	// the lines whenever they change and reuse the cached value.
	const linesForPreview = ref<QuoteLineRow[]>([]);
	watch([() => quoteId, () => quote.value?.updated_at], async () => {
		try {
			linesForPreview.value = await quotesStore.getLines(quoteId);
		} catch { /* ignore — surfaced if user clicks PDF */ }
	}, { immediate: true });

	// Preview-then-save flow. Renders to a temp file under app local data,
	// shows it in PdfPreviewModal, and copies to the user's chosen path on
	// "Save as…". The composable owns all the state + toast handling.
	const pdf = usePdfPreview({
		command: "export_quote_pdf",
		buildPayload: () => buildPdfPayload(linesForPreview.value),
		fileName: () => `${quote.value?.number ?? "quote"}.pdf`,
		title: "Quote PDF preview"
	});

	const onPdfClick = () => {
		if (!quote.value || dirty.value) return;
		pdf.open();
	};

	const showDeleteDialog = ref(false);
	const deleteConfirmInput = ref("");
	const askDelete = () => {
		deleteConfirmInput.value = "";
		showDeleteDialog.value = true;
	};

	// Click-to-copy the quote number in the confirm dialog — saves the user
	// hand-typing a long document number just to confirm a delete.
	const copyNumber = async () => {
		const n = quote.value?.number;
		if (!n) return;
		try {
			await navigator.clipboard.writeText(n);
			toast.add({ title: "Number copied", color: "success", icon: "i-lucide-copy" });
		} catch {
			toast.add({ title: "Couldn't copy", color: "error", icon: "i-lucide-circle-alert" });
		}
	};

	// For drafts, no typed confirmation needed. For issued quotes, require
	// the user to type the document number — this is a deliberately
	// destructive escape hatch.
	const canConfirmDelete = computed(() => {
		if (!quote.value) return false;
		if (isDraft.value) return true;
		return deleteConfirmInput.value.trim() === quote.value.number;
	});

	const confirmDelete = async () => {
		if (!quote.value || !canConfirmDelete.value) return;
		showDeleteDialog.value = false;
		try {
			await quotesStore.remove(quoteId);
			toast.add({
				title: isDraft.value ? "Draft deleted" : "Quote deleted",
				color: "info",
				icon: "i-lucide-trash-2"
			});
			await router.replace("/quotes");
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Convert-to-invoice. Quote must be in 'accepted' status (per the
	// transition graph) and not already converted.
	const canConvert = computed(() =>
		status.value === "accepted" && !quote.value?.converted_invoice_id
	);
	const showConvertDialog = ref(false);
	const converting = ref(false);
	// Editable invoice number for the conversion — same gap-fill affordance the
	// New-invoice modal offers. Numbers are year-less now, so the conversion
	// just takes the next INV number regardless of dates (no more year jump).
	const convertDocNum = useDocumentNumber({
		type: "invoice",
		enabled: showConvertDialog
	});
	// Local YYYY-MM-DD "today" (not UTC — toISOString would drift a day near
	// midnight for +ve timezones).
	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};
	// Editable issue date for the invoice the conversion creates. Refreshed
	// to today on every open (this page is kept alive — a ref seeded once
	// would go stale across days). The due date derives from it + the
	// default payment terms inside createFromQuote.
	const convertIssueDate = ref<string>(todayISO());
	// Reseed on the next open (peek only fills when sequence is null).
	watch(showConvertDialog, (open) => {
		if (open) convertIssueDate.value = todayISO();
		else convertDocNum.reset();
	});
	const askConvert = () => {
		showConvertDialog.value = true;
	};
	const confirmConvert = async () => {
		if (!quote.value || !canConvert.value || !convertDocNum.numberValid.value) return;
		converting.value = true;
		try {
			const lineRows = await quotesStore.getLines(quoteId);
			const newInvoiceId = await invoicesStore.createFromQuote(
				quote.value,
				lineRows,
				convertDocNum.sequence.value ?? undefined,
				convertIssueDate.value || undefined
			);
			await quotesStore.markConverted(quoteId, newInvoiceId);
			// markConverted persisted status='converted' + the link to the DB.
			// This page is kept alive (<NuxtPage keepalive>), so update the local
			// refs too — otherwise returning to it shows a stale ACCEPTED with the
			// Convert button still offered (it would let you convert twice).
			const current = quote.value;
			if (current) {
				quote.value = { ...current, status: "converted", converted_invoice_id: newInvoiceId };
			}
			convertedInvoice.value = await invoicesStore.get(newInvoiceId).catch(() => null);
			showConvertDialog.value = false;
			toast.add({
				title: "Invoice created from quote",
				color: "success",
				icon: "i-lucide-check"
			});
			await router.push(`/invoices/${newInvoiceId}`);
		} catch (err) {
			toast.add({
				title: "Convert failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			converting.value = false;
		}
	};

	// Revert-conversion. The escape hatch for a conversion done in error —
	// deletes the linked invoice and returns this quote to draft. Offered
	// only in the converted state; the store refuses while the invoice has
	// recorded payments (owner must delete the receipt vouchers first).
	const canRevert = computed(() => status.value === "converted");
	const showRevertDialog = ref(false);
	const reverting = ref(false);
	// Receipt vouchers linked to the invoice, fetched when the dialog opens.
	// Shown in the modal so the user sees exactly which payments block the
	// revert (the store guard would refuse anyway — this surfaces the WHY
	// and links each voucher for one-click cleanup). Scoped SQL rather than
	// the vouchers store: this page doesn't load the full voucher ledger.
	interface RevertBlockingVoucher {
		id: number
		number: string
		voucher_date: string
		amount_cents: number
	}
	const revertVouchers = ref<RevertBlockingVoucher[]>([]);
	const askRevert = async () => {
		revertVouchers.value = [];
		const invId = quote.value?.converted_invoice_id;
		if (invId != null) {
			revertVouchers.value = await select<RevertBlockingVoucher>(
				`SELECT id, number, voucher_date, amount_cents FROM vouchers
				 WHERE related_invoice_id = ? AND voucher_type = 'receipt'
				 ORDER BY voucher_date DESC, id DESC`,
				[invId]
			).catch(() => []);
		}
		showRevertDialog.value = true;
	};
	const confirmRevert = async () => {
		if (!quote.value || !canRevert.value) return;
		reverting.value = true;
		try {
			await quotesStore.revertConversion(quoteId);
			// Patch the keep-alive local refs — same reason confirmConvert
			// does: returning to this cached page must not show a stale
			// CONVERTED header.
			const current = quote.value;
			if (current) {
				quote.value = { ...current, status: "draft", converted_invoice_id: null };
			}
			convertedInvoice.value = null;
			showRevertDialog.value = false;
			toast.add({
				title: "Conversion reverted",
				description: "The linked invoice was deleted and this quote is a draft again.",
				color: "success",
				icon: "i-lucide-undo-2"
			});
		} catch (err) {
			toast.add({
				title: "Revert failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			reverting.value = false;
		}
	};

	// Legal next-state actions for the current status. Rendered as
	// individual buttons in the header so the available transitions are
	// visible at a glance — no dropdown to click through. Short verbs
	// keep the header compact.
	interface TransitionAction {
		label: string
		icon: string
		onSelect: () => void
	}
	const transitionActions = computed<TransitionAction[]>(() => {
		const cur = status.value;
		const items: TransitionAction[] = [];
		// Reopen comes first so it's the most prominent button on a
		// rejected/expired quote — the most likely thing the user wants.
		if (canTransition(cur, "draft")) items.push({ label: "Reopen as draft", icon: "i-lucide-rotate-ccw", onSelect: () => transition("draft") });
		if (canTransition(cur, "sent")) items.push({ label: "Send", icon: "i-lucide-send", onSelect: () => transition("sent") });
		if (canTransition(cur, "accepted")) items.push({ label: "Accept", icon: "i-lucide-thumbs-up", onSelect: () => transition("accepted") });
		if (canTransition(cur, "rejected")) items.push({ label: "Reject", icon: "i-lucide-thumbs-down", onSelect: () => transition("rejected") });
		if (canTransition(cur, "expired")) items.push({ label: "Expire", icon: "i-lucide-calendar-x", onSelect: () => transition("expired") });
		return items;
	});

	// Items rendered into the responsive UDropdownMenu shown below xl
	// (the inline cluster above is hidden at that width). Grouped so
	// the dropdown draws separators: PDF + Convert + View-linked /
	// transitions / Delete. Declared at the end so the handlers it
	// references are already in scope.
	const actionMenuItems = computed(() => {
		const primary: { label: string, icon: string, disabled?: boolean, onSelect: () => void }[] = [];
		primary.push({
			label: "PDF & Print",
			icon: "i-lucide-file-down",
			disabled: dirty.value || pdf.state.rendering,
			onSelect: onPdfClick
		});
		if (canConvert.value) {
			primary.push({
				label: "Convert to invoice",
				icon: "i-lucide-receipt",
				onSelect: askConvert
			});
		}
		if (quote.value?.converted_invoice_id) {
			const linkedId = quote.value.converted_invoice_id;
			primary.push({
				label: "View linked invoice",
				icon: "i-lucide-link",
				onSelect: () => {
					void router.push(`/invoices/${linkedId}`);
				}
			});
		}
		if (canRevert.value) {
			primary.push({
				label: "Revert to draft",
				icon: "i-lucide-undo-2",
				onSelect: askRevert
			});
		}

		const destructive = [{
			label: isDraft.value ? "Delete draft" : "Delete",
			icon: "i-lucide-trash-2",
			class: "text-(--ui-error) hover:bg-(--ui-error)/10 [&>span>span:first-child]:text-(--ui-error)",
			onSelect: askDelete
		}];

		return [primary, transitionActions.value, destructive].filter((g) => g.length > 0);
	});
</script>
