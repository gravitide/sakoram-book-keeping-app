<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is Sales by client?" icon="i-lucide-info">
			<p>
				<strong>Sales by client</strong> answers a single question: <em>"Which clients drove our revenue this period — and how concentrated is it?"</em> It's a per-client breakdown of the invoices you issued in a date range, sorted by total revenue so the biggest customers lead.
			</p>
			<p>
				Sakoram's version is at <NuxtLink to="/reports/sales-by-client" class="text-(--ui-primary) hover:underline">
					/reports/sales-by-client
				</NuxtLink>. It's a transform of data you already have — every issued <NuxtLink to="/help/invoices" class="text-(--ui-primary) hover:underline">
					invoice
				</NuxtLink> contributes its subtotal to the client it was billed to.
			</p>
		</HelpSection>

		<HelpSection title="What's in the report" icon="i-lucide-list">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Three KPI tiles:</strong> Total revenue (sum of all in-range invoice subtotals), Clients (distinct count), Invoices (total issued).
				</li>
				<li>
					<strong>By-client breakdown table.</strong> One row per client with invoice count, total revenue, and share of period revenue. Sorted by total descending.
				</li>
				<li>
					<strong>Drill-down: every invoice.</strong> Sortable by number, date, client, or subtotal — useful for spot-checks. Click any invoice to open it.
				</li>
			</ul>
			<HelpCallout variant="info" title="Subtotals, not totals">
				The report uses pre-VAT subtotals on purpose — same reason as <NuxtLink to="/help/profit-loss" class="text-(--ui-primary) hover:underline">
					Profit & Loss
				</NuxtLink>. VAT is collected on behalf of the IRD, not earned. The <NuxtLink to="/help/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink> handles the VAT-only view separately.
			</HelpCallout>
			<HelpCallout variant="info" title="Drafts and cancelled don't count">
				Only <strong>sent</strong> invoices count as revenue. A draft hasn't been issued yet; cancelled was retracted. This matches every other revenue surface in Sakoram (the P&L tile, the dashboard, your tax filing).
			</HelpCallout>
		</HelpSection>

		<HelpSection title="How to read it" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Open <NuxtLink to="/reports/sales-by-client" class="text-(--ui-primary) hover:underline">
						/reports/sales-by-client
					</NuxtLink>. First-visit default is the current fiscal year.
				</li>
				<li>
					Pick a <strong>date range</strong> — the date pickers directly, or a preset chip (This month / Last month / This quarter / This year / Last year / Fiscal year).
				</li>
				<li>
					Scan the <strong>three tiles</strong> for the headline. The "average per client" / "average per invoice" sub-labels give a feel for concentration.
				</li>
				<li>
					Read down the <strong>By client</strong> table. The top 3-5 rows usually tell you most of what you need to know about who matters.
				</li>
				<li>
					Click a client row to jump to <NuxtLink to="/invoices" class="text-(--ui-primary) hover:underline">
						/invoices
					</NuxtLink> pre-filtered to that client — their full history, not just the period.
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
								Concentration risk
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								If one client is 60% of your revenue, losing them tanks the business. The "% of total" column makes this visible.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Year-on-year growth per client
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Run it for last year, screenshot, then run for this year. Easy to spot clients that have grown vs ones that have shrunk.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Account manager assignment
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Top clients usually deserve more attention. The sort makes the "VIP" list obvious.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium align-top whitespace-nowrap">
								Hand-off to accountants
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								The PDF is a tidy summary your accountant can drop into a board pack or annual report.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="Sri Lankan context" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="Top-customer disclosures">
				If you're a public-ish business — preparing accounts for shareholders, applying for finance, or reporting under SLFRS — auditors often ask for "customer concentration": the share of revenue from your top 1 / top 5 / top 10 clients. This report gives that number directly. Run it for the financial year.
			</HelpCallout>
			<p>
				Sakoram's "Fiscal year" preset uses the Sri Lankan gov FY (April–March) by default, driven by <span class="font-mono text-xs">fiscal_year_start_month</span> in Business details.
			</p>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't read it on the wrong date basis">
				This report is <strong>accrual</strong> — counts on the invoice's issue date, not on when the client paid. A big invoice issued Dec 31 lands in this year's report even if the cash hits the bank in January. If you want "cash received from each client", that's a different transform that doesn't exist as a single report yet — pull the <NuxtLink to="/reports/cash-flow" class="text-(--ui-primary) hover:underline">
					Cash flow
				</NuxtLink> drill-down and group by party manually.
			</HelpCallout>
			<HelpCallout variant="warning" title="A missing client probably means no issued invoices">
				A client with only draft invoices won't appear here. If you expected them and they're missing, check whether your team is still sitting on drafts they should have sent.
			</HelpCallout>
			<HelpCallout variant="warning" title="Beware comparison with VAT report">
				Sales-by-client uses subtotals (pre-VAT). VAT report shows the VAT amounts separately. Adding them together gives invoice totals — don't double-count.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Sales by client help topic.
</script>
