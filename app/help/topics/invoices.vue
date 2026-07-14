<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is an invoice?" icon="i-lucide-info">
			<p>
				An <strong>invoice</strong> is a formal request for payment you send to a client after work is done or goods are delivered. It's the document the client uses to pay you, and the document you use to track what they owe.
			</p>
			<p>
				Once you've issued an invoice, it's a legal record. The IRD treats it as a tax document; the client uses it for their own books. That's why Sakoram <strong>locks invoices the moment you mark them sent</strong> — only the notes field stays editable. Any correction after that needs a credit note, not a quiet edit.
			</p>
		</HelpSection>

		<HelpSection title="The invoice lifecycle" icon="i-lucide-route">
			<p>An invoice moves through these states as you work with it:</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								State
							</th>
							<th class="px-3 py-2 font-medium">
								What it means
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<StatusBadge status="draft" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Editable, hasn't gone to the client yet. Add lines, change totals, fix the date — all fair game.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="sent" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Issued to the client. Locked. Money's expected but hasn't arrived.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="partial" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Client has paid some but not all. Derived from the receipt vouchers — you don't set this directly.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="paid" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Fully settled. Sum of receipt vouchers ≥ invoice total.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="overdue" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Past the due date with a balance still outstanding. Time to chase.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="cancelled" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Voided. Sakoram refuses to cancel an invoice that already has payments recorded — delete those receipts first.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<HelpCallout variant="info" title="Partial / paid / overdue are derived, not set">
				You only set <strong>draft</strong>, <strong>sent</strong>, or <strong>cancelled</strong>. The other three states come from summing the linked receipt vouchers against the total and comparing today's date to the due date. Means you can't accidentally mark an invoice "paid" without a real receipt voucher to back it up.
			</HelpCallout>
			<HelpCallout variant="tip" title="Sent by mistake? Revert to draft">
				A sent invoice with <strong>no payments recorded</strong> offers <strong>Revert to draft</strong> — un-issue it, fix the typo or swap the bank account, and send again. A cancelled invoice can also revert to draft for a full re-edit (or <strong>Reopen</strong> straight back to sent). The moment a receipt voucher is linked, both paths are refused — corrections then go through a credit note.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="How to create one in Sakoram" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Go to <NuxtLink to="/invoices" class="text-(--ui-primary) hover:underline">
						Invoices
					</NuxtLink> and click <strong>New invoice</strong>.
				</li>
				<li>
					Pick the <strong>client</strong>. The number auto-allocates (e.g. <span class="font-mono text-xs">INV-0001</span> — one continuous sequence, no yearly reset); change it if you need to fill a gap from a deleted draft.
				</li>
				<li>
					Optional <strong>project title</strong> — appears as the subtitle on the PDF.
				</li>
				<li>
					On the detail page, set <strong>issue date</strong> and <strong>due date</strong>. The due date defaults to issue + your payment-terms setting (Settings → Business details).
				</li>
				<li>
					Add <strong>line items</strong>. Two pricing modes:
					<ul class="list-disc pl-5 mt-1 space-y-0.5">
						<li><strong>Bundle</strong> — one lump-sum total, no line breakdown on the PDF. Useful for fixed-price work.</li>
						<li><strong>Itemized</strong> — line-by-line with qty + unit price + per-line VAT. Useful for goods or hourly work.</li>
					</ul>
				</li>
				<li>
					Pick the <strong>bank account</strong> to print on the PDF (so the client knows where to pay). Defaults to your primary; switch via the picker if needed.
				</li>
				<li>
					Click <strong>Mark sent</strong> when you're ready to issue. The invoice locks; only notes stay editable. (Locked notes and terms carry a small <strong>Copy</strong> button, so you can reuse the text on the next invoice with formatting intact.)
				</li>
				<li>
					When the client pays, click <strong>Record payment</strong> on the invoice. That spins up a receipt voucher linked back to this invoice; the status updates to partial / paid automatically.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="Recording payments" icon="i-lucide-banknote">
			<p>
				Sakoram doesn't store a paid-amount column on the invoice itself. Instead, every payment is a <strong>receipt voucher</strong> with <span class="font-mono text-xs">related_invoice_id</span> set, and the invoice's paid total / balance / status are <em>derived</em> from the sum of those vouchers.
			</p>
			<p>
				Why: the voucher ledger is the single source of truth for cash. Looking at any voucher tells you exactly where the money came from or went to. Looking at the cash-flow report adds up the same vouchers. Numbers can never disagree across surfaces.
			</p>
			<HelpCallout variant="tip" title="Partial payments are normal">
				Big clients often pay in instalments. Just click Record payment multiple times — each becomes its own receipt voucher. The invoice shows the running balance and flips to "paid" only when the full total is collected.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Sri Lankan tax angle" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="VAT-registered businesses">
				Your invoice is a <strong>tax invoice</strong> in IRD terms. It must show your VAT registration number, the VAT rate, and the VAT amount as a separate line. Sakoram's PDF includes all of these when your business profile has the tax ID set (Settings → Business details).
			</HelpCallout>
			<p>
				The output VAT (sum of <span class="font-mono text-xs">tax_cents</span> on your issued invoices) is what you'll owe the IRD on your monthly return. Sakoram's <NuxtLink to="/reports/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink> totals it for any period — that's the number you transfer to your VAT return form.
			</p>
			<HelpCallout variant="info" title="Fiscal year is April–March">
				Sri Lankan businesses report on the gov FY (Apr-Mar). Invoice numbers are one continuous sequence (<span class="font-mono text-xs">INV-0001</span>, <span class="font-mono text-xs">INV-0002</span>, …) that never resets — the fiscal year lives in the reports, not the number. The <NuxtLink to="/reports/profit-loss" class="text-(--ui-primary) hover:underline">
					Profit & Loss report
				</NuxtLink>'s "Fiscal year" preset (and the dashboard's range chips) default to Apr-Mar.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't edit a sent invoice">
				Sakoram locks the form once you mark sent, but it's worth knowing why: the client has likely added it to their own books. Any correction needs a <NuxtLink to="/help/credit-notes" class="text-(--ui-primary) hover:underline">
					credit note
				</NuxtLink>, not a quiet edit on your side.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't conflate the invoice with the receipt">
				The invoice is the bill. The receipt is the record of payment. Two separate documents. If you only enter an invoice and never record the matching voucher when the client pays, your cash-flow report is wrong and the invoice stays "sent" forever even though the money's in the bank.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't cancel an invoice with payments against it">
				Cancelling would orphan the receipt vouchers (cash in the bank with no liability on record). Sakoram refuses this — delete the receipt vouchers first, then cancel the invoice.
			</HelpCallout>
			<HelpCallout variant="warning" title="Pick the bank account before sending">
				The bank picker is editable while the invoice is a draft. Once sent, the bank snapshot is frozen on the PDF — the client sees whichever bank was selected at issue time. Sent it with the wrong bank and no payment has landed yet? <strong>Revert to draft</strong>, swap the bank, and re-send. (Each account carries a colour dot in the picker so it's hard to grab the wrong one.)
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Invoices help topic. The lifecycle table uses live StatusBadge
// components so users see the exact same coloured pills they'll see
// on the invoices list — the docs match the UI verbatim.
</script>
