<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is Expenses by vendor?" icon="i-lucide-info">
			<p>
				<strong>Expenses by vendor</strong> is the mirror of <NuxtLink to="/help/sales-by-client" class="text-(--ui-primary) hover:underline">
					Sales by client
				</NuxtLink>, but for the money going out: <em>"Who did we pay the most this period — and is the spend concentrated in a few suppliers?"</em> It groups every non-cancelled <NuxtLink to="/help/bills" class="text-(--ui-primary) hover:underline">
					bill
				</NuxtLink> in a date range by vendor and sorts by total spend descending.
			</p>
			<p>
				Sakoram's version is at <NuxtLink to="/reports/expenses-by-vendor" class="text-(--ui-primary) hover:underline">
					/reports/expenses-by-vendor
				</NuxtLink>.
			</p>
		</HelpSection>

		<HelpSection title="What's in the report" icon="i-lucide-list">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Three KPI tiles:</strong> Total spend (sum of all in-range bill subtotals), Vendors (distinct count), Bills (total received).
				</li>
				<li>
					<strong>By-vendor breakdown table.</strong> One row per vendor with bill count, total spend, and share of period spend. Sorted by total descending.
				</li>
				<li>
					<strong>Drill-down: every bill.</strong> Sortable by number, date, vendor, or subtotal. Click any bill to open it.
				</li>
			</ul>
			<HelpCallout variant="info" title="Subtotals, not totals">
				The report uses pre-VAT subtotals on purpose: input VAT is recoverable through the <NuxtLink to="/help/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink>, so it's not really an expense — counting it here would over-state spend by the VAT amount you'll claim back.
			</HelpCallout>
			<HelpCallout variant="info" title="Cancelled bills don't count">
				Only non-cancelled bills count as expense. If a bill was retracted (duplicate, wrong supplier, vendor error), cancel it on the bill detail page and it drops out of this report automatically.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="How to read it" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Open <NuxtLink to="/reports/expenses-by-vendor" class="text-(--ui-primary) hover:underline">
						/reports/expenses-by-vendor
					</NuxtLink>. First-visit default is the current fiscal year.
				</li>
				<li>
					Pick a <strong>date range</strong> via pickers or preset chips.
				</li>
				<li>
					Scan the <strong>three tiles</strong> for the period headline. "Average per vendor" sub-labels give a feel for concentration.
				</li>
				<li>
					Read down <strong>By vendor</strong>. The top 5 vendors are usually your big spend categories — rent, utilities, payroll-adjacent suppliers, raw materials.
				</li>
				<li>
					Click a vendor row to jump to <NuxtLink to="/bills" class="text-(--ui-primary) hover:underline">
						/bills
					</NuxtLink> pre-filtered to that vendor — their full bill history.
				</li>
				<li>
					<strong>PDF & Print</strong> for a hand-off copy.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="What it's useful for" icon="i-lucide-target">
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Question
							</th>
							<th class="px-3 py-2 font-medium">
								How the report answers it
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Negotiating leverage
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Your top suppliers are the ones where a small % discount moves real money. Use the absolute numbers when you ask for better terms.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Supplier consolidation
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Long-tail with 30 vendors at small amounts is often consolidatable into 5 — better pricing, fewer admin headaches.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Budget tracking
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Spot vendors whose spend has jumped — early warning of cost creep or scope changes.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Withholding tax checks
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								In SL, certain payments to professionals / contractors require WHT deductions. Knowing your top vendors makes the WHT-due list easier to compile.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="Sri Lankan context" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="Pair with the VAT report for full picture">
				Sakoram's <NuxtLink to="/reports/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink> shows the input VAT side — the amount you'll reclaim. This report shows the underlying spend. Add the two to know the gross cash outflow vendor by vendor; subtract VAT from VAT-registered vendors when reconciling against your bank statement.
			</HelpCallout>
			<p>
				The "Fiscal year" preset defaults to April–March (Sri Lankan gov FY). Use it when preparing schedule-of-expenses attachments for your annual tax return.
			</p>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="This report is not payroll">
				Payroll spend doesn't show up here — it lives on payslips, not bills. The <NuxtLink to="/reports/payroll-register" class="text-(--ui-primary) hover:underline">
					Payroll register
				</NuxtLink> is its own report. To get a full "all expenses" view, check <NuxtLink to="/reports/profit-loss" class="text-(--ui-primary) hover:underline">
					Profit & Loss
				</NuxtLink> which combines both.
			</HelpCallout>
			<HelpCallout variant="warning" title="Date is bill issue date, not payment date">
				This is accrual — a bill received today but paid in three months counts in this month's report. If you want "when did the money actually move", that's <NuxtLink to="/reports/cash-flow" class="text-(--ui-primary) hover:underline">
					Cash flow
				</NuxtLink> territory.
			</HelpCallout>
			<HelpCallout variant="warning" title="Missing categories?">
				This report aggregates by <strong>vendor</strong>, not category. If you want "how much did we spend on Rent / Utilities / Software" — that's a category-based view that doesn't exist as a standalone report yet. The <NuxtLink to="/reports/profit-loss" class="text-(--ui-primary) hover:underline">
					P&L
				</NuxtLink> drill-down shows category on each bill row.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Expenses by vendor help topic.
</script>
