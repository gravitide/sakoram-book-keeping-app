<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is the VAT report?" icon="i-lucide-info">
			<p>
				The <strong>VAT report</strong> tells you, for any period, how much VAT you've collected from clients vs how much you've paid to suppliers — and what you owe the IRD as the net difference. It's the number you transfer onto your monthly VAT return form.
			</p>
			<p>
				Sakoram's VAT report is at <NuxtLink to="/reports/vat" class="text-(--ui-primary) hover:underline">
					/reports/vat
				</NuxtLink>.
			</p>
		</HelpSection>

		<HelpSection title="Output vs input VAT — the core concept" icon="i-lucide-shuffle">
			<p>
				VAT in Sri Lanka (and most countries) is a tax on consumption that businesses <strong>collect on behalf of</strong> the government — you're not paying it out of your pocket, the end consumer is. As a registered business you have two roles:
			</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-elevated) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Side
							</th>
							<th class="px-3 py-2 font-medium">
								What it means
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top">
								<span class="font-medium text-(--ui-success)">Output VAT</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								VAT you <strong>charged</strong> on your invoices. You collected it from the client; you owe it onward to the IRD.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top">
								<span class="font-medium text-(--ui-error)">Input VAT</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								VAT you <strong>paid</strong> on bills from your suppliers. You can reclaim it — it offsets your output VAT.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top">
								<span class="font-medium">Net VAT</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Output − Input. <strong>Positive</strong> = you owe the IRD. <strong>Negative</strong> = the IRD owes you (or, more often, the credit carries forward to next month).
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<HelpCallout variant="info" title="The chain is end-to-end">
				The VAT you pay on a bill (input) was the VAT your supplier charged (their output). When you charge a client, your output becomes their input. The chain ends at the final consumer — they pay VAT but can't reclaim. Every business in between is just a collection agent.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="What's in the report" icon="i-lucide-list">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Three KPI tiles:</strong> Output VAT, Input VAT, Net VAT (positive = payable to IRD; negative = credit carrying forward).
				</li>
				<li>
					<strong>Breakdown table</strong> with output and input as line items + the net at the bottom.
				</li>
				<li>
					<strong>Drill-down tabs (Invoices / Bills)</strong> on a sortable, searchable DataTable. Each shows the invoice / bill number, date, party, subtotal, and the VAT amount. Verify line-by-line against your source documents before filing.
				</li>
				<li>
					<strong>PDF export</strong> for handing the breakdown to your accountant or for your tax-return file.
				</li>
			</ul>
		</HelpSection>

		<HelpSection title="How to use it for your monthly return" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Open <NuxtLink to="/reports/vat" class="text-(--ui-primary) hover:underline">
						/reports/vat
					</NuxtLink>.
				</li>
				<li>
					Click the <strong>"This month"</strong> or <strong>"Last month"</strong> preset chip to scope to the return period.
				</li>
				<li>
					Verify the Output VAT total matches what you'd expect — drill into the Invoices tab and scan for anything unusual.
				</li>
				<li>
					Verify Input VAT — drill into the Bills tab and confirm every bill is a legitimate business expense from a VAT-registered vendor (their VAT registration number should appear on their bill).
				</li>
				<li>
					Note the Net VAT figure. This is what you'll enter on your IRD VAT return as the net liability.
				</li>
				<li>
					Click <strong>PDF & Print</strong> and file the PDF with your VAT return documentation. Keep for at least 5 years per IRD retention rules.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="Sri Lankan tax specifics" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="IRD-recoverable input VAT">
				You can only reclaim input VAT on bills from <strong>VAT-registered vendors</strong> and only for <strong>business-related expenses</strong>. Buying a personal laptop from a VAT-registered shop doesn't give you reclaimable VAT — it's not a business expense. Be honest with the categorization; the IRD audits this.
			</HelpCallout>
			<HelpCallout variant="tax" title="Negative net VAT = credit carrying forward">
				If your input VAT exceeded your output VAT in a given month (e.g. big equipment purchase, low sales), the difference is a <strong>credit</strong>. The IRD generally doesn't refund this monthly — instead, it carries forward to offset next month's output VAT. Sakoram's report renders negative net VAT in success-tone as an "Input-VAT credit" line.
			</HelpCallout>
			<HelpCallout variant="info" title="Filing dates">
				VAT returns in Sri Lanka are generally due monthly, by the 20th of the following month. Sakoram doesn't track filing — it just gives you the numbers. Your accountant handles the actual filing.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't claim input VAT without the vendor bill on file">
				The IRD can ask to see the original supplier invoice when auditing your input VAT claims. Recording the bill in Sakoram is the digital ledger entry; the supplier's physical or PDF document is the legal proof. Attach the scan via the bill detail page's Attachments card.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't include cancelled invoices in your VAT planning">
				Cancelled invoices are excluded from the VAT report automatically — but if you cancelled an invoice <em>after</em> the client paid, the VAT on the original was already collected. Issue a <NuxtLink to="/help/credit-notes" class="text-(--ui-primary) hover:underline">
					credit note
				</NuxtLink> to formally reverse the VAT, otherwise your output figures and your bank receipts will disagree.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't forget to update the default VAT rate when the IRD changes it">
				Sri Lanka's VAT rate has moved between 12%, 15%, 18% over recent years. The default rate is in <NuxtLink to="/settings/company" class="text-(--ui-primary) hover:underline">
					Settings → Business details
				</NuxtLink>. New invoices seed from this default; historical invoices keep their rate at the time of issue (which is correct — you shouldn't retroactively change tax rates).
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// VAT report help topic.
</script>
