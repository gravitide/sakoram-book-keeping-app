<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is the Cash flow report?" icon="i-lucide-info">
			<p>
				The <strong>Cash flow report</strong> answers one specific question: <em>"In the period I'm looking at, did more money come into my bank account than went out?"</em>
			</p>
			<p>
				It's the closest report Sakoram has to "look at your bank statement and tell me if business is good." Unlike the <NuxtLink to="/help/profit-loss" class="text-(--ui-primary) hover:underline">
					P&L
				</NuxtLink> (which counts invoices and bills on issue date), cash flow only counts <strong>vouchers</strong> — records of money that actually moved.
			</p>
			<p>
				Sakoram's cash flow report is at <NuxtLink to="/reports/cash-flow" class="text-(--ui-primary) hover:underline">
					/reports/cash-flow
				</NuxtLink>.
			</p>
		</HelpSection>

		<HelpSection title="Cash basis vs accrual basis" icon="i-lucide-scale">
			<p>
				This report is the <strong>cash-basis</strong> complement to the P&L. They can — and usually do — disagree about the same period. Both are correct; they answer different questions:
			</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-elevated) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Question
							</th>
							<th class="px-3 py-2 font-medium">
								Report
							</th>
							<th class="px-3 py-2 font-medium">
								Counts on
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top">
								"Did we earn / spend money this month?"
							</td>
							<td class="px-3 py-2.5 align-top">
								<NuxtLink to="/help/profit-loss" class="text-(--ui-primary) hover:underline">
									P&L
								</NuxtLink>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Invoice / bill / payslip issue dates.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top">
								"Did money actually move this month?"
							</td>
							<td class="px-3 py-2.5 align-top">
								Cash flow
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Voucher dates.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<HelpCallout variant="info" title="Why both matter">
				Profitable businesses can go bankrupt if their cash flow is bad enough — work is done, invoices are issued, P&L looks great, but clients don't pay fast enough and you can't make payroll. The cash flow report catches this where the P&L can't.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="What's in the report" icon="i-lucide-list">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Three KPI tiles:</strong> Receipts (money in), Payments (money out), Net cash flow.
				</li>
				<li>
					<strong>Monthly breakdown table</strong> — one row per calendar month spanned by the date range, even months with no activity (dashed). Lets you spot dry months and seasonal patterns at a glance.
				</li>
				<li>
					<strong>Drill-down tabs (Receipts / Payments)</strong> — every voucher in the period, sortable, with party / method / amount. Click a row to open the voucher.
				</li>
				<li>
					<strong>PDF export</strong> for monthly reviews, board updates, or sharing with your accountant.
				</li>
			</ul>
		</HelpSection>

		<HelpSection title="How to use it" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Open <NuxtLink to="/reports/cash-flow" class="text-(--ui-primary) hover:underline">
						/reports/cash-flow
					</NuxtLink>. First-visit default is the current fiscal year.
				</li>
				<li>
					Pick a <strong>date range</strong> via the preset chips (This month, Last month, This quarter, This year, Last year, Fiscal year) or the date pickers.
				</li>
				<li>
					Glance at the Net tile. Positive = the bank balance grew this period; negative = you spent more than you collected.
				</li>
				<li>
					Scan the monthly breakdown for the rhythm. Steady-positive months are healthy. Months that swung negative usually correlate with a bill cluster, a payroll spike, or a slow-paying client.
				</li>
				<li>
					Switch between Receipts and Payments drill-downs to dig into specifics. Sort by amount descending to find the big movers.
				</li>
				<li>
					Reconcile against your bank statement line-by-line — the voucher payment method + reference are visible in the drill-down to match against bank entries.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="Reconciling against the bank" icon="i-lucide-check">
			<p>
				The cash flow report is the closest Sakoram surface to your actual bank statement. Two should match for any given period, modulo:
			</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Cash vouchers</strong> — petty cash transactions that never touched the bank. Filter them out mentally when reconciling.
				</li>
				<li>
					<strong>Bank fees / interest</strong> — usually missing from Sakoram until you create standalone vouchers for them. Worth doing monthly when you reconcile.
				</li>
				<li>
					<strong>Pending transfers</strong> — money that left your account but hasn't cleared yet. Record the voucher on the date you initiated, not when it cleared.
				</li>
			</ul>
			<HelpCallout variant="tip" title="Monthly reconciliation habit">
				Open your bank statement + the cash flow report for the same month, side-by-side. Tick off matching transactions. Anything in the statement but not Sakoram = a voucher you forgot to record. Anything in Sakoram but not the statement = a duplicate or wrong-date entry. Catching these monthly is easy; catching them yearly is awful.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't mistake good cash flow for profitability">
				A month with strong cash flow could just mean clients paid off old invoices — work that was actually earned (and reported on P&L) months ago. Cash flow is about <em>timing</em>; P&L is about <em>activity</em>. Read both for the full picture.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't ignore the empty months">
				The monthly breakdown deliberately shows empty months as dashed rows. If June 2026 shows zero receipts, that's not a rendering bug — it's that no client paid you in June. Worth knowing. Don't filter the report to hide it.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't forget standalone vouchers">
				Most vouchers are linked to invoices / bills / payslips. But petty cash, bank charges, interest receipts, and refunds don't have a parent document. Record them anyway — they're real money movements and the cash flow report will be wrong without them.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Cash flow help topic.
</script>
