<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is a Profit & Loss report?" icon="i-lucide-info">
			<p>
				A <strong>Profit & Loss</strong> report (also called "P&L," "income statement," or "statement of operations") answers one question: <em>"How much did we earn vs spend over this period?"</em>
			</p>
			<p>
				It's the single most-used report in business — your accountant runs it monthly, your tax filing depends on it, and your gut sense of "are we making money?" is what it formalizes. Sakoram's P&L is at <NuxtLink to="/reports/profit-loss" class="text-(--ui-primary) hover:underline">
					/reports/profit-loss
				</NuxtLink>.
			</p>
			<HelpCallout variant="info" title="Sakoram uses accrual basis">
				Income is counted when you <strong>issue</strong> the invoice — not when the client pays. Expenses are counted when you <strong>receive</strong> the bill — not when you pay it. See the <NuxtLink to="/help/bookkeeping-basics" class="text-(--ui-primary) hover:underline">
					accrual vs cash explainer
				</NuxtLink> for the why. The <NuxtLink to="/help/cash-flow" class="text-(--ui-primary) hover:underline">
					Cash flow report
				</NuxtLink> is the cash-basis cousin if you want the "did money actually move?" view instead.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="What's in the P&L" icon="i-lucide-list">
			<p>Three big numbers at the top (KPI tiles), then a breakdown table, then drill-downs.</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Line
							</th>
							<th class="px-3 py-2 font-medium">
								What's in it
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="text-(--ui-success)">Income</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Subtotal (pre-VAT) of every <strong>sent</strong> invoice with an issue date in the period. Drafts and cancelled invoices don't count.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="text-(--ui-error)">Bills (purchases)</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Subtotal (pre-VAT) of every non-cancelled bill with an issue date in the period.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="text-(--ui-error)">Payroll</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Gross earnings (before employee deductions) on every issued payslip whose period ends in the report range.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Net profit / loss
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Income − (Bills + Payroll). Positive = profit; negative = loss. The KPI tile colours accordingly.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<HelpCallout variant="info" title="VAT is excluded on purpose">
				The P&L uses <strong>subtotals (pre-VAT)</strong>, not totals. Why: VAT is a pass-through — you collect it on behalf of the IRD and remit it on. It's not revenue (you don't get to keep it) and it's not an expense (you'd be double-counting against the input VAT you reclaim). The <NuxtLink to="/help/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink> handles the VAT-only view separately.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="How to read it" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Open <NuxtLink to="/reports/profit-loss" class="text-(--ui-primary) hover:underline">
						/reports/profit-loss
					</NuxtLink>. First-visit default is the current fiscal year.
				</li>
				<li>
					Pick a <strong>date range</strong> — either the date pickers directly, or one of the preset chips (This month, Last month, This quarter, This year, Last year, Fiscal year).
				</li>
				<li>
					Read the three <strong>KPI tiles</strong>: Income, Expenses, Net. The Net tile shows the margin percentage as a sub-label.
				</li>
				<li>
					Below, the <strong>breakdown table</strong> shows each line with a "% of income" column — quick gut-check of which expense bucket dominates.
				</li>
				<li>
					Switch between the <strong>Invoices / Bills / Payslips</strong> drill-down tabs to see the underlying documents. Click any row to open the document.
				</li>
				<li>
					Click <strong>PDF & Print</strong> to render a hand-off copy — useful for your accountant or board pack.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="When the P&L tells a different story than your bank" icon="i-lucide-scale">
			<p>
				If you've ever felt "the P&L says we made Rs 500,000 this month but I'm broke" — that's the accrual vs cash gap. Common causes:
			</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Big invoice issued, client hasn't paid.</strong> P&L counted the income on issue date; the bank account doesn't see it until they pay.
				</li>
				<li>
					<strong>Bill received but not paid yet.</strong> P&L counted the expense on bill date; bank balance isn't affected until you pay.
				</li>
				<li>
					<strong>Pre-paid expenses</strong> (annual subscriptions, deposits). P&L sees them all in the month of the bill; cash flow saw them on payment day.
				</li>
			</ul>
			<HelpCallout variant="tip" title="Compare with the cash-flow report">
				Open both reports side-by-side for the same period. If the P&L's net profit is way bigger than the cash-flow's net positive, it usually means you've issued invoices that haven't been collected yet — time to chase. Sakoram's <NuxtLink to="/reports/aged-receivables" class="text-(--ui-primary) hover:underline">
					Aged receivables
				</NuxtLink> tells you exactly who.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Sri Lankan context" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="The 'Fiscal year' preset">
				Sakoram's "Fiscal year" date preset uses the Sri Lankan gov FY (April–March) — driven by the <span class="font-mono text-xs">fiscal_year_start_month</span> setting in Business details. If your business uses a different financial year, change the setting and the preset follows.
			</HelpCallout>
			<p>
				The P&L is the report your accountant uses for your annual income-tax return. The net profit at the bottom is what gets taxed (after adjustments — capital allowances, disallowable expenses, etc., which Sakoram doesn't compute). Keep the P&L PDFs filed alongside your tax return for the IRD's required retention window.
			</p>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't count draft invoices as income">
				A draft hasn't been issued yet — it's still editable on your side, the client hasn't seen it. The P&L correctly excludes drafts. If you've been mentally counting drafts in your income, that's why your "real" P&L looks lower than you expected.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't forget to issue payslips for the period">
				Payroll expense only counts <strong>issued</strong> payslips. If your monthly run is still sitting in draft, the P&L will under-report your expenses (and over-report your profit). Issue them — or at least know you're looking at a stale number.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't compare months without the same closing discipline">
				If you sometimes record bills on the day they arrive and sometimes weeks later, your month-by-month P&L will look bumpy regardless of actual business performance. Pick a habit (e.g. "every Monday I enter last week's bills") and stick to it.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Profit & Loss help topic.
</script>
