<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is a payslip?" icon="i-lucide-info">
			<p>
				A <strong>payslip</strong> is the per-employee, per-pay-period document that records what you paid (or are about to pay) someone on your payroll. It's part legal record, part receipt for the employee, part input for your own bookkeeping.
			</p>
			<p>
				Each payslip has a <strong>period</strong> (the work dates being compensated, usually a month), a <strong>pay date</strong> (when the money is supposed to hit their account), and a list of <strong>earnings + deductions</strong> that net out to what they actually receive.
			</p>
		</HelpSection>

		<HelpSection title="Earnings vs deductions" icon="i-lucide-receipt">
			<p>Every line on a payslip is one of two kinds:</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Kind
							</th>
							<th class="px-3 py-2 font-medium">
								Examples
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5 text-(--ui-success)">
									<UIcon name="i-lucide-arrow-down-left" class="size-3.5" />
									Earnings
								</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Basic salary, allowances (transport, telephone, lunch), bonus, overtime, commission, reimbursements.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5 text-(--ui-error)">
									<UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
									Deductions
								</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								EPF employee contribution, PAYE income tax, salary advances, no-pay leave, loan instalments.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<p>
				<strong>Net pay</strong> = Σ earnings − Σ deductions. That's the number that hits the employee's bank account. Sakoram computes this live as you edit.
			</p>
		</HelpSection>

		<HelpSection title="How to create a payslip" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Go to <NuxtLink to="/payslips" class="text-(--ui-primary) hover:underline">
						Payslips
					</NuxtLink> and click <strong>New payslip</strong>.
				</li>
				<li>
					Pick the <strong>employee</strong>. The payslip number auto-allocates (e.g. <span class="font-mono text-xs">PSL-2026-0027</span>).
				</li>
				<li>
					Set the three dates: <strong>period start</strong>, <strong>period end</strong>, <strong>pay date</strong>. By default they're filled from your payroll cycle settings (Settings → Payroll); adjust if this is a partial period.
				</li>
				<li>
					Add <strong>earnings</strong> lines. Sakoram seeds a "Basic" line for you with the employee's basic salary. Add allowances / overtime / bonus as additional earning lines.
				</li>
				<li>
					Add <strong>deductions</strong>. If you've turned on statutory auto-compute, EPF (and PAYE, if enabled) are already added for you as managed lines — see <NuxtLink to="/help/statutory-paye" class="text-(--ui-primary) hover:underline">
						EPF, ETF &amp; PAYE
					</NuxtLink>. Add anything else manually: salary advances, no-pay leave, loan instalments.
				</li>
				<li>
					Click <strong>Mark issued</strong> when the numbers are right. The payslip locks (only notes stay editable).
				</li>
				<li>
					When you actually pay the employee, click <strong>Record payment</strong>. A payment voucher is created linked to the payslip; the status flips to paid.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="Bulk monthly payroll" icon="i-lucide-list-checks">
			<p>
				At the end of every pay cycle you probably need to generate payslips for every active employee at once. Sakoram has a dedicated <NuxtLink to="/payslips/bulk" class="text-(--ui-primary) hover:underline">
					Bulk run
				</NuxtLink> page for this:
			</p>
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Pick the pay month — the three cycle dates fall out of your <NuxtLink to="/settings/payroll" class="text-(--ui-primary) hover:underline">
						payroll cycle settings
					</NuxtLink>.
				</li>
				<li>Sakoram lists every active employee with a checkbox.</li>
				<li>Optional: tick <strong>Auto-issue</strong> + <strong>Auto-pay</strong> + provide bulk voucher defaults (method, description) for the whole run.</li>
				<li>Click Create. All selected payslips are generated, optionally issued, and optionally paid as a chain in one go.</li>
			</ol>
			<HelpCallout variant="tip" title="Bulk PDF too">
				After issuing, multi-select payslips on the <NuxtLink to="/payslips" class="text-(--ui-primary) hover:underline">
					list page
				</NuxtLink>, pick an output folder, and Sakoram batch-renders the PDFs — one file per row. Hand them out to employees in one go.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Sri Lankan tax & statutory" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="EPF, ETF & PAYE are auto-computed">
				Sakoram works out the SL statutory figures for you once you turn them on under <NuxtLink to="/settings/payroll" class="text-(--ui-primary) hover:underline">
					Payroll settings
				</NuxtLink>:
				<ul class="list-disc pl-5 mt-2 space-y-1">
					<li><strong>EPF employee (8%):</strong> auto-added as a deduction line that reduces net pay.</li>
					<li><strong>EPF employer (12%):</strong> recorded + printed as your contribution — <em>not</em> deducted from the employee's net.</li>
					<li><strong>ETF (3%):</strong> employer-paid, recorded + printed, again not deducted from net.</li>
					<li><strong>PAYE / APIT:</strong> computed from a configurable monthly bracket table (seeded with the SL 2025/26 figures), added as a managed deduction line.</li>
				</ul>
				<p class="mt-2">
					Full walkthrough — rates, the tax table, and per-payslip overrides — in <NuxtLink to="/help/statutory-paye" class="text-(--ui-primary) hover:underline">
						EPF, ETF &amp; PAYE
					</NuxtLink>.
				</p>
			</HelpCallout>
			<p>
				Per-employee bank details (account number, branch, bank name) live on the employee record under <NuxtLink to="/employees" class="text-(--ui-primary) hover:underline">
					Employees
				</NuxtLink>. They get snapshotted onto each payslip at create time and print on the PDF — useful for handing the payslip to the bank for batch transfers.
			</p>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't forget EPF / ETF for new employees">
				The moment you have an employee, you have EPF + ETF obligations. Turn on statutory auto-compute in <NuxtLink to="/settings/payroll" class="text-(--ui-primary) hover:underline">
					Payroll settings
				</NuxtLink> so it's handled from payslip #1 — missing it and "catching up later" creates a mess.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't pay before issuing">
				The flow is create-draft → issue → pay. Skipping straight to recording a payment voucher without an issued payslip means no audit trail for the employee — they can't refer back to what they were supposed to have earned.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't reuse a payslip period">
				One payslip per employee per period. Sakoram enforces this at the DB level (UNIQUE on employee_id + period_start), so you'll get a duplicate-period error if you try. If you need to make an adjustment, edit the existing draft or issue a follow-up bonus payslip for a different period.
			</HelpCallout>
			<HelpCallout variant="warning" title="Snapshot is frozen at issue time">
				If you change an employee's basic salary or bank details after issuing a payslip, the payslip's PDF still shows the old values. That's intentional — historical pay records shouldn't get rewritten when address-book data changes. The next payslip you create picks up the new values.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Payslips help topic.
</script>
