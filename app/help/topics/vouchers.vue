<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is a voucher?" icon="i-lucide-info">
			<p>
				A <strong>voucher</strong> is the record of money actually moving — either into your bank account or out of it. It's the entry in your <strong>cash ledger</strong>. Every other document in Sakoram (invoices, bills, payslips, credit notes) is a record of an <em>obligation</em>; the voucher is the record that the obligation has been settled.
			</p>
			<p>
				Two types, named for the direction of money flow:
			</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-elevated) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Type
							</th>
							<th class="px-3 py-2 font-medium whitespace-nowrap">
								Direction
							</th>
							<th class="px-3 py-2 font-medium">
								Typical use
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Receipt
							</td>
							<td class="px-3 py-2.5 align-top">
								<span class="inline-flex items-center gap-1.5 text-(--ui-success) font-medium whitespace-nowrap">
									<UIcon name="i-lucide-arrow-down-left" class="size-3.5" />
									Money in
								</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								A client paid you. Almost always linked to the invoice they paid.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Payment
							</td>
							<td class="px-3 py-2.5 align-top">
								<span class="inline-flex items-center gap-1.5 text-(--ui-error) font-medium whitespace-nowrap">
									<UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
									Money out
								</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								You paid a vendor / employee / refund. Linked to the bill, payslip, or credit note being settled.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="The voucher ledger is the source of truth" icon="i-lucide-database">
			<p>
				Sakoram doesn't store a "paid amount" column on invoices, bills, or payslips. Every status that depends on money movement — <em>paid</em>, <em>partial</em>, <em>balance owing</em> — is <strong>derived</strong> by summing the linked vouchers on the fly.
			</p>
			<p>This single-source-of-truth design has two big benefits:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Numbers can never disagree.</strong> The dashboard's outstanding balance, the invoice's "balance" line, and the Aged receivables report all sum the same voucher rows. There's no caching, no manual reconciliation, no "the invoice says paid but the bank says no."
				</li>
				<li>
					<strong>Cash-flow reporting is trivial.</strong> Want to know how much came in last month? Sum receipts. How much went out? Sum payments. The <NuxtLink to="/reports/cash-flow" class="text-(--ui-primary) hover:underline">
						Cash flow report
					</NuxtLink> does exactly that.
				</li>
			</ul>
		</HelpSection>

		<HelpSection title="How to create one" icon="i-lucide-circle-play">
			<p>You usually <em>don't</em> create vouchers directly. The natural flow is:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					On an <strong>invoice</strong>, click <strong>Record payment</strong> → opens the new-voucher form pre-filled as a receipt linked to that invoice.
				</li>
				<li>
					On a <strong>bill</strong>, click <strong>Record payment</strong> → pre-filled as a payment linked to that bill.
				</li>
				<li>
					On a <strong>payslip</strong>, click <strong>Record payment</strong> → pre-filled as a payment linked to that payslip.
				</li>
			</ul>
			<p>
				This way the link back to the document is set automatically. The invoice / bill / payslip's derived status updates the moment you save the voucher.
			</p>
			<HelpCallout variant="tip" title="Standalone vouchers are also valid">
				Sometimes there's no document to link to — petty cash withdrawal, bank fees, an interest receipt. Click <strong>New voucher</strong> directly on the <NuxtLink to="/vouchers" class="text-(--ui-primary) hover:underline">
					Vouchers list
				</NuxtLink>, pick the type, leave the linked-document picker blank, fill in the party name and amount manually. These show up in the cash-flow report alongside the linked ones.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Partial payments and overpayments" icon="i-lucide-split">
			<p>
				A single invoice can have <strong>multiple receipt vouchers</strong>. This is the normal pattern when:
			</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>The client paid in instalments (Rs 50,000 of a Rs 200,000 invoice today, the rest next month).</li>
				<li>The client paid the wrong amount and a balance came later.</li>
				<li>A deposit was paid against the quote / invoice ahead of the final balance.</li>
			</ul>
			<p>
				Sakoram derives the invoice's status from the sum: partial while the total isn't met, paid once it is. Same logic on bills and payslips.
			</p>
			<HelpCallout variant="warning" title="Overpayment surfaces a soft warning">
				If the sum of receipt vouchers exceeds the invoice total (e.g. client paid Rs 105,000 on a Rs 100,000 invoice), Sakoram shows an "Overpaid by Rs 5,000" warning on the invoice. There's usually a legitimate reason (a refund correction, an advance for next time), but the discrepancy should be visible — it's not silently swept under the rug.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Payment methods" icon="i-lucide-credit-card">
			<p>Each voucher records how the money moved. The options:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li><strong>Bank transfer</strong> — the most common in SL business. Add a reference number if your bank provides one.</li>
				<li><strong>Cash</strong> — in-hand payment. Common for small businesses, less for B2B.</li>
				<li><strong>Cheque</strong> — record the cheque number in the reference field; helpful when reconciling against your bank statement.</li>
				<li><strong>Card</strong> — debit / credit card. Use the merchant's transaction ID as the reference.</li>
				<li><strong>Other</strong> — for unusual cases (e.g. mobile wallet, online payment processor).</li>
			</ul>
			<p>
				The method shows up on the voucher PDF and on the cash-flow report's drill-down so you can reconcile against your bank statement line by line.
			</p>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't double-record a payment">
				If you clicked <strong>Record payment</strong> on an invoice, Sakoram already created the voucher. Don't ALSO go to /vouchers and create a standalone one — you'd be recording the same money twice.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't change voucher type after creating">
				A receipt is a receipt, a payment is a payment. Sakoram doesn't let you flip the type post-creation (it would orphan whatever linked document it was attached to, with consequences for the cash-flow direction). If you got the type wrong, delete the voucher and create the right one.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't delete a voucher to 'fix' an invoice status">
				If the invoice's status looks wrong, the vouchers attached to it are the cause — not the symptom. Deleting a voucher means deleting the record that money moved. If the money DID move, the right move is usually to add a correcting voucher or issue a credit note. Deleting cash records to make the UI look right is how books lie.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Quick decoder — voucher vs invoice vs bill" icon="i-lucide-shuffle">
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-elevated) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Document
							</th>
							<th class="px-3 py-2 font-medium">
								What it records
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Invoice
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Money <em>owed to you</em>. The client hasn't necessarily paid yet.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Bill
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Money <em>owed by you</em>. You haven't necessarily paid yet.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Voucher
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Money <em>that actually moved</em>. Either direction. Settles an invoice / bill / payslip — or stands alone.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Vouchers help topic.
</script>
