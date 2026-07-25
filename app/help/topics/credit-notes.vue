<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is a credit note?" icon="i-lucide-info">
			<p>
				A <strong>credit note</strong> is a "negative invoice" — a document you issue to a client that <strong>reduces what they owe you</strong>. Where an invoice says "you owe us Rs 100,000," a credit note says "we owe you Rs 20,000 back" or "ignore Rs 20,000 of that invoice."
			</p>
			<p>
				The credit note is the official paper trail for the adjustment. Your accountant and the IRD both expect to see one whenever the amount on a tax invoice is later corrected — you can't just edit the original invoice (it's already been issued, the client may have used it for their own VAT records).
			</p>
		</HelpSection>

		<HelpSection title="When would you issue one?" icon="i-lucide-clipboard-list">
			<p>The four common scenarios:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>You over-billed by mistake.</strong> Invoice was Rs 100,000 but should have been Rs 90,000. Issue a credit note for Rs 10,000 against that invoice.
				</li>
				<li>
					<strong>The client returned goods.</strong> They paid for 10 chairs but 2 were damaged on arrival. Issue a credit note for the value of the 2 returned chairs.
				</li>
				<li>
					<strong>You agreed to a discount after issuing the invoice.</strong> Client negotiated a 5% loyalty discount after seeing the invoice. Credit note for the 5%.
				</li>
				<li>
					<strong>Refund of a duplicate payment.</strong> Client paid twice by mistake. Credit note acknowledges the overpayment; the actual refund is recorded as a payment voucher.
				</li>
			</ul>
			<HelpCallout variant="tip" title="Standalone credit notes are also valid">
				A credit note doesn't always have to reference a specific invoice. Goodwill credits, year-end volume rebates, opening-balance corrections from a previous accounting system — all legitimate cases where you'd issue a credit note <em>without</em> linking it to one invoice. Leave the "Source invoice" field blank for those.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="How to create one in Sakoram" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Go to <NuxtLink to="/credit-notes" class="text-(--ui-primary) hover:underline">
						Credit notes
					</NuxtLink> in the sidebar and click <strong>New credit note</strong>.
				</li>
				<li>
					Pick the <strong>client</strong> the credit is for. The number auto-allocates (e.g. <span class="font-mono text-xs">CRN-0001</span>); change it if you need to fill a gap from a deleted draft.
				</li>
				<li>
					Optional: type a <strong>project title</strong> — appears as the subtitle on the PDF, e.g. "Refund for damaged stock."
				</li>
				<li>
					On the detail page, link a <strong>source invoice</strong> if this credit settles a specific one. The picker is filtered to the client's issued invoices — only their own invoices show up.
				</li>
				<li>
					Add <strong>line items</strong> just like an invoice — what's being credited, the unit price, VAT rate. Use itemized mode for line-by-line detail; bundle mode if a single lump-sum total is enough.
				</li>
				<li>
					Click <strong>Mark issued</strong> when ready. The credit note locks at that point (only the notes field stays editable), and the linked invoice's balance updates to reflect the credit.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="Sri Lankan tax angle" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="IRD expectations">
				For VAT-registered businesses, the Sri Lankan IRD expects credit notes to reference the <strong>original tax invoice number</strong> where applicable. This is how the credit flows correctly through your VAT return: output VAT on the original invoice was reported in month A; the credit note reduces the output VAT in the month it's issued.
			</HelpCallout>
			<p>
				Standalone credit notes (no linked invoice) are accepted by the IRD when properly documented — date, client details, amount, VAT, and a clear reason in the notes. Keep the notes field detailed enough that an auditor can understand what the credit was for two years from now.
			</p>
			<p>
				The credit note's number, date, and client info appear on your VAT report under "Input VAT" (effectively a reversal of previously-reported output VAT). It's auto-handled by Sakoram's <NuxtLink to="/reports/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink>.
			</p>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't credit a draft invoice">
				A draft invoice hasn't been issued to the client yet — there's nothing to credit. Either edit the draft directly, or delete it and start over. Credit notes are for invoices that have already left your hands.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't cancel an issued credit note that's been refunded">
				If you've already paid the client back (via a payment voucher), the credit note is the paper trail for that money. Cancelling it would orphan the voucher. Delete the refund voucher first, then cancel the credit note.
			</HelpCallout>
			<HelpCallout variant="warning" title="Match the source invoice's VAT rate">
				If the original invoice charged 18% VAT, the credit note should also be at 18% — otherwise the VAT amounts don't reconcile. Sakoram seeds the rate from your default; double-check it matches the original.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Refund vs credit note vs receipt — quick decoder" icon="i-lucide-shuffle">
			<!-- Same striped + gridline treatment as the report
				monthly-breakdown tables, so docs tables feel of-a-piece
				with the rest of the app. Wrapping div is overflow-x-auto
				so very narrow viewports (e.g. modal at sm) can pan
				rather than wrap-and-crush. -->
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Document
							</th>
							<th class="px-3 py-2 font-medium whitespace-nowrap">
								Direction
							</th>
							<th class="px-3 py-2 font-medium">
								What it does
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Receipt voucher
							</td>
							<td class="px-3 py-2.5 align-top">
								<span class="inline-flex items-center gap-1.5 text-(--ui-success) font-medium whitespace-nowrap">
									<UIcon name="i-lucide-arrow-down-left" class="size-3.5" />
									Money in
								</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								The client paid you. Created via "Record payment" on an invoice.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Payment voucher
							</td>
							<td class="px-3 py-2.5 align-top">
								<span class="inline-flex items-center gap-1.5 text-(--ui-error) font-medium whitespace-nowrap">
									<UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
									Money out
								</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								You paid someone — vendor, employee, or a refund to a client.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Credit note
							</td>
							<td class="px-3 py-2.5 align-top">
								<span class="inline-flex items-center gap-1.5 text-(--ui-text-muted) font-medium whitespace-nowrap">
									<UIcon name="i-lucide-equal" class="size-3.5" />
									No cash moves
								</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Adjusts what they owe — changes the outstanding balance without moving cash. Pair with a payment voucher if you're actually refunding money to the client.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Credit notes — proof-of-concept help topic. Demonstrates the
// shape every topic should follow: structured sections built with
// HelpSection + HelpCallout primitives, plain English first, IRD /
// SL-specific content called out, common mistakes near the bottom.
</script>
