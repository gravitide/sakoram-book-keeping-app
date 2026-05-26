<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is Aged payables?" icon="i-lucide-info">
			<p>
				<strong>Aged payables</strong> is the mirror of <NuxtLink to="/help/aged-receivables" class="text-(--ui-primary) hover:underline">
					Aged receivables
				</NuxtLink>: who <em>you</em> owe money to, and how long the bills have been sitting unpaid.
			</p>
			<p>
				Like its sibling, this is a <strong>snapshot</strong> — "as of today" — not a date range. You'll open it weekly to plan your supplier payments and avoid the awkward call from a vendor asking where their money is. Sakoram's version is at <NuxtLink to="/reports/aged-payables" class="text-(--ui-primary) hover:underline">
					/reports/aged-payables
				</NuxtLink>.
			</p>
		</HelpSection>

		<HelpSection title="The five aging buckets" icon="i-lucide-clock">
			<p>Same buckets as receivables, applied to bills instead of invoices:</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-elevated) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Bucket
							</th>
							<th class="px-3 py-2 font-medium">
								Meaning
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm bg-(--ui-success)" /> Current</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Not yet due. Pay within the window the vendor agreed to.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm bg-(--ui-warning)/60" /> 1–30 days</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Just slipped past due. Pay this week, vendor's still being polite.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm bg-(--ui-warning)" /> 31–60 days</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Vendor will call. Have a story ready or just pay.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm bg-(--ui-error)/70" /> 61–90 days</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Risk of being put on stop. Vendor may refuse new orders.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm bg-(--ui-error)" /> 90+ days</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Vendor relationship is in trouble. Expect legal action or a credit-rating hit.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="What's in the report" icon="i-lucide-list">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Three KPI tiles:</strong> Total outstanding (what you owe), Overdue (sum of the four overdue buckets), Current.
				</li>
				<li>
					<strong>Bucket distribution table</strong> — count + amount + % of total per bucket.
				</li>
				<li>
					<strong>Per-vendor breakdown</strong> on a ResizableDataTable, sorted by total descending. Click a vendor row to jump to <NuxtLink to="/bills" class="text-(--ui-primary) hover:underline">
						/bills
					</NuxtLink> pre-filtered to that vendor.
				</li>
				<li>
					<strong>PDF export</strong> for treasury / payment planning sessions.
				</li>
			</ul>
		</HelpSection>

		<HelpSection title="How to use it" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Open <NuxtLink to="/reports/aged-payables" class="text-(--ui-primary) hover:underline">
						/reports/aged-payables
					</NuxtLink>.
				</li>
				<li>
					Eye the Total outstanding KPI — that's your near-term cash commitment. Compare it against your bank balance + expected client receipts.
				</li>
				<li>
					Pay anything in the <strong>61+</strong> buckets first to avoid vendor stops / legal trouble.
				</li>
				<li>
					Then the <strong>31–60</strong> bucket if cash allows.
				</li>
				<li>
					For each payment, open the bill, click <strong>Record payment</strong>. A payment voucher is created automatically.
				</li>
				<li>
					Re-open the report — the bills you just paid drop off, balances update.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="What counts (and what doesn't)" icon="i-lucide-filter">
			<p>The report includes:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li><strong>Open bills</strong> (the only non-cancelled state) with a positive outstanding balance.</li>
			</ul>
			<p>It excludes:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li><strong>Cancelled bills</strong> — voided.</li>
				<li><strong>Fully-paid bills</strong> — balance is zero.</li>
			</ul>
			<HelpCallout variant="info" title="Balance is voucher-derived">
				Same pattern as receivables — the outstanding amount on each bill is total minus the sum of linked payment vouchers. Anything you see here that "should be paid" is either a missing payment voucher or a partial-payment that left a small balance behind.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Sri Lankan tax angle" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="Input VAT timing on unpaid bills">
				In Sri Lanka, input VAT is generally claimable when you <strong>receive</strong> a tax invoice from a registered vendor, not when you pay. So your <NuxtLink to="/help/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink> can show a healthy input-VAT credit even while a bill sits unpaid here. The VAT credit and the cash payment are separate events.
			</HelpCallout>
			<HelpCallout variant="info" title="Don't game payment dates for tax purposes">
				Some businesses time payments to manipulate cash flow / tax position. The IRD looks for unusual patterns — bills delayed weeks then all paid the day before a return is due, for instance. Pay your suppliers honestly and let the bookkeeping reflect reality.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't ignore the report until vendors call">
				The whole point is to avoid the awkward "where's our payment?" call. Open it weekly, even if briefly. Vendor relationships compound — being a reliable payer means you can negotiate better terms when you need them later.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't forget to record payments after they leave the bank">
				If you paid a vendor by bank transfer but never created the payment voucher in Sakoram, the bill stays here as overdue and your aged-payables report lies. Cross-check against your bank statement at the same time you review the report.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't use overdue payables as a deliberate cash-flow strategy">
				Stretching vendor payments to manage your own cash flow is a slippery slope. Vendors notice. You'll pay for it in either worse terms, smaller credit limits, or getting cut off mid-project. A short cash-flow gap is solvable with a conversation; a reputation for slow payment is not.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Aged payables help topic.
</script>
