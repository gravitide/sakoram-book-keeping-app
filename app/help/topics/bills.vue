<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is a bill?" icon="i-lucide-info">
			<p>
				A <strong>bill</strong> is the mirror image of an invoice — instead of money you're owed, it's money you owe. You receive a bill when a supplier (vendor) sends you their invoice for goods or services they provided. In Sakoram, recording a bill creates a liability on your books; paying it generates a payment voucher.
			</p>
			<p>
				If you've used invoices, the workflow is mostly familiar: pick a vendor instead of a client, add lines, save. The differences are around <strong>categorization</strong> (every bill belongs to an expense category for reporting) and the absence of a "draft" state (bills you've received are real liabilities the moment you record them).
			</p>
		</HelpSection>

		<HelpSection title="The bill lifecycle" icon="i-lucide-route">
			<p>Bills have a simpler state machine than invoices:</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-elevated) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
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
							<td class="px-3 py-2.5 whitespace-nowrap align-top">
								<StatusBadge status="unpaid" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Open with nothing paid yet.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="partial" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								You've made some payments but the balance isn't zero. Derived from linked payment vouchers.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="paid" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Sum of payment vouchers ≥ bill total. You're square with the vendor.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="overdue" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Past the due date with a balance still outstanding. Vendor's going to call.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="cancelled" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Voided. Sakoram refuses to cancel a bill that's been paid — delete the payment vouchers first.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<HelpCallout variant="info" title="No 'draft' state">
				Unlike invoices and quotes, bills don't have a draft state. The reasoning: if a vendor has sent you a bill, it's a real liability — you don't get to decide whether it's "real yet." Sakoram records it as open the moment you save. If you entered one by mistake, just delete it.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="How to record a bill in Sakoram" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Go to <NuxtLink to="/bills" class="text-(--ui-primary) hover:underline">
						Bills
					</NuxtLink> and click <strong>New bill</strong>.
				</li>
				<li>
					Pick the <strong>vendor</strong>. If they're not in your list, <NuxtLink to="/vendors" class="text-(--ui-primary) hover:underline">
						add them first
					</NuxtLink>. Vendors snapshot onto the bill at create time, so renaming a vendor later doesn't rewrite history.
				</li>
				<li>
					Type the vendor's <strong>bill number</strong> as they printed it on the document — this is for your records, not Sakoram's auto-numbering. Sakoram allocates its own internal number too (e.g. <span class="font-mono text-xs">BIL-2026-0001</span>) for the cash ledger trail.
				</li>
				<li>
					Set the <strong>issue date</strong> (when the vendor dated their bill) and <strong>due date</strong> (when they expect payment). The vendor usually prints both.
				</li>
				<li>
					Pick a <strong>category</strong> — the expense bucket this bill rolls up into for reporting. If the category you want doesn't exist yet, the picker has a "+ New" inline option.
				</li>
				<li>
					Add <strong>line items</strong> matching the vendor's bill. Two modes:
					<ul class="list-disc pl-5 mt-1 space-y-0.5">
						<li><strong>Bundle</strong> — one lump-sum total.</li>
						<li><strong>Itemized</strong> — line-by-line, especially if you want input-VAT detail per line.</li>
					</ul>
				</li>
				<li>
					Save. The bill is now open and reflected on the <NuxtLink to="/reports/aged-payables" class="text-(--ui-primary) hover:underline">
						Aged payables
					</NuxtLink> report.
				</li>
				<li>
					When you pay the vendor, click <strong>Record payment</strong> on the bill. A payment voucher is created linked back to the bill; the status updates automatically.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="Why categorize bills?" icon="i-lucide-tags">
			<p>
				Every bill belongs to a <strong>category</strong> — Rent, Utilities, Supplies, Software, Travel, etc. These drive two things:
			</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					The <strong>expenses-by-category donut</strong> on the dashboard, so you can see at a glance where the month's spend is going.
				</li>
				<li>
					The <strong>Profit & Loss report's</strong> expense breakdown — if your accountant asks "how much did we spend on rent in Q3?", the category is what lets you answer.
				</li>
			</ul>
			<p>
				Categories are managed under <NuxtLink to="/categories" class="text-(--ui-primary) hover:underline">
					Bill categories
				</NuxtLink>. Each has a colour swatch and an icon so they're scannable on the bill list. Sakoram seeds a starter set on a new tenant; add or rename as your business needs.
			</p>
		</HelpSection>

		<HelpSection title="Sri Lankan tax angle" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="Input VAT you can claim">
				When you pay a bill from a VAT-registered vendor, the VAT portion is <strong>input VAT</strong> — it offsets the output VAT you're collecting on your invoices. Net VAT (output − input) is what you actually remit to the IRD.
			</HelpCallout>
			<p>
				Sakoram's <NuxtLink to="/reports/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink> sums the input VAT across your non-cancelled bills for any period, alongside the output VAT from issued invoices. The net is what you transfer to your VAT return.
			</p>
			<HelpCallout variant="info" title="Keep the original vendor bill on file">
				The IRD expects you to retain the vendor's original invoice (the physical or PDF document) for at least 5 years. Sakoram's record is a digital ledger entry; the vendor's invoice is the legal proof. Attach a scan / photo via the Attachments card on the bill detail page if you want to keep both in one place.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't mix personal expenses with business bills">
				If a bill is partially personal (mixed-use car fuel, e.g.), record only the business portion. Mixing personal expenses into your books inflates your deductible expenses and creates IRD audit risk.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't skip categorization">
				It's tempting to leave bills uncategorized and "fix later" — but later doesn't come. Your P&L report becomes useless without categories, and recategorizing hundreds of historical bills at tax time is awful work.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't enter a bill that you're not legally on the hook for">
				If a vendor sends you their invoice but you've negotiated a discount or returned goods before paying, wait until the final number is settled before recording. Recording then correcting via a credit note is fine; recording optimistically and never reconciling makes your aged-payables report lie.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Bills help topic.
</script>
