<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is the Payroll register?" icon="i-lucide-info">
			<p>
				The <strong>Payroll register</strong> is a single table listing every payslip you issued for a period, with employee name, period dates, gross earnings, total deductions, net pay, and how much has actually been paid out. It's the "show me everyone's pay for this month" view — the standard hand-off to your accountant and a useful audit document.
			</p>
			<p>
				Sakoram's version is at <NuxtLink to="/reports/payroll-register" class="text-(--ui-primary) hover:underline">
					/reports/payroll-register
				</NuxtLink>. It's a transform of <NuxtLink to="/help/payslips" class="text-(--ui-primary) hover:underline">
					payslips
				</NuxtLink> you've already issued — no separate data entry.
			</p>
		</HelpSection>

		<HelpSection title="What's in the report" icon="i-lucide-list">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Three KPI tiles:</strong> Gross earnings (sum of every payslip's earnings line), Net pay (what employees take home), and either Paid out or Outstanding — depending on whether all payslips in the range have been settled.
				</li>
				<li>
					<strong>By-employee breakdown.</strong> One row per employee with payslip count, gross, deductions, net, and paid. Click a row to open that employee's full payslip history.
				</li>
				<li>
					<strong>Drill-down: every payslip.</strong> Number, employee, period end, gross, deductions, net, paid. Click a row to open the payslip.
				</li>
			</ul>
			<HelpCallout variant="info" title="Filter is on period start">
				Payslips count when their <strong>pay period starts</strong> in the date range. A payslip for the April 1–30 pay period appears in any range that includes April 1, even if pay-date slipped into May. This matches the natural framing of "show me April's payroll".
			</HelpCallout>
			<HelpCallout variant="info" title="Drafts and cancelled don't count">
				Only <strong>issued</strong> payslips appear. Drafts are still in-progress; cancelled were retracted. If a payslip you expected is missing, check whether it ever got issued.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="How to read it" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Open <NuxtLink to="/reports/payroll-register" class="text-(--ui-primary) hover:underline">
						/reports/payroll-register
					</NuxtLink>. First-visit default is the current fiscal year — narrow to a single month for the typical monthly-payroll view.
				</li>
				<li>
					Pick a <strong>date range</strong>: usually one month at a time. The "This month" preset is the quickest path.
				</li>
				<li>
					Scan the <strong>three tiles</strong>. The third tile flips between "Paid out" (everyone settled) and "Outstanding" (still owed). Outstanding > 0 with a recent period is normal — pay dates often follow period end.
				</li>
				<li>
					Read down <strong>By employee</strong>. Each row's "Paid" column shows whether that employee's payslips have been fully settled (success-toned) or partly paid (warning-toned).
				</li>
				<li>
					Drill into the per-payslip table to verify individual amounts.
				</li>
				<li>
					<strong>PDF & Print</strong> for accountants, statutory filings, or board packs.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="Deductions, gross, net — quick reminder" icon="i-lucide-divide">
			<p>
				Sakoram models each payslip as two stacks of line items:
			</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Stack
							</th>
							<th class="px-3 py-2 font-medium">
								Examples
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top whitespace-nowrap">
								<span class="font-medium text-(--ui-success)">Earnings</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Basic salary, allowances, OT, bonuses. The sum is <strong>Gross</strong>.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top whitespace-nowrap">
								<span class="font-medium text-(--ui-error)">Deductions</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Employee EPF (8%), PAYE tax, loan repayments, advances, ETF (note: ETF is employer-side at 3% — model it as an expense line in your books, not a deduction from the employee).
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top whitespace-nowrap">
								<span class="font-medium">Net</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Earnings − Deductions. The amount the employee actually receives.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="Sri Lankan context" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="EPF and ETF filings">
				The EPF (Employee Provident Fund) and ETF (Employee Trust Fund) statutory bodies require monthly contribution returns. The Payroll register PDF is a reasonable starting point for those filings — it shows gross per employee, which feeds the EPF (8% employee + 12% employer) and ETF (3% employer) calculations.
			</HelpCallout>
			<HelpCallout variant="tax" title="PAYE reconciliation">
				If you're a PAYE-registered employer, the deductions stack should include the PAYE withheld per employee. Run this report monthly and reconcile against your PAYE return (T-10) before filing — easier to catch mistakes here than at year-end.
			</HelpCallout>
			<p>
				Sakoram doesn't auto-compute EPF / ETF / PAYE today — they're entered as manual deduction lines on each payslip. The roadmap calls out statutory auto-compute as a future enhancement.
			</p>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't forget to issue before reporting">
				A drafted payslip with all the numbers correct still won't show up. Mark them issued before running the report (or you'll under-report payroll cost for the month).
			</HelpCallout>
			<HelpCallout variant="warning" title="Outstanding > 0 isn't always bad">
				It's normal for a payslip issued mid-month to be unpaid until the pay-date. "Outstanding" in this report means net pay - vouchers recorded. If the pay-date is still in the future, expect it to be > 0.
			</HelpCallout>
			<HelpCallout variant="warning" title="ETF / employer EPF is not a deduction">
				Employer-side contributions (3% ETF, 12% employer EPF) are <strong>company expense</strong>, not employee deductions. Model them as separate <NuxtLink to="/help/bills" class="text-(--ui-primary) hover:underline">
					bills
				</NuxtLink> (payable to the EPF / ETF authorities) or as standalone <NuxtLink to="/help/vouchers" class="text-(--ui-primary) hover:underline">
					payment vouchers
				</NuxtLink>. Mixing them into the payslip would understate net pay to the employee.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Payroll register help topic.
</script>
