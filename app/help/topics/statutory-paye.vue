<template>
	<div class="space-y-6 select-text">
		<HelpSection title="EPF, ETF & PAYE — auto-computed" icon="i-lucide-info">
			<p>
				Sakoram can work out the three Sri Lankan statutory payroll figures for you and add them to every payslip automatically — no more typing them in by hand and hoping the percentages are right.
			</p>
			<ul class="list-disc pl-5 space-y-1">
				<li><strong>EPF</strong> — Employees' Provident Fund (retirement savings). Employee 8% + employer 12%.</li>
				<li><strong>ETF</strong> — Employees' Trust Fund. Employer 3%.</li>
				<li><strong>PAYE / APIT</strong> — monthly income-tax withholding, on a progressive bracket table.</li>
			</ul>
			<p>
				You set the rates once under <NuxtLink to="/settings/payroll" class="text-(--ui-primary) hover:underline">
					Payroll settings
				</NuxtLink>, and each new payslip seeds the deductions automatically. The figures recompute live as you edit the earnings, and freeze onto the payslip when you issue it.
			</p>
		</HelpSection>

		<HelpSection title="EPF & ETF" icon="i-lucide-landmark">
			<p>
				EPF and ETF are calculated on an employee's <strong>EPF-liable earnings</strong> — usually basic salary plus regular allowances, but not one-off reimbursements. Each earning line on a payslip carries an "EPF-liable" flag so you control exactly what's included.
			</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Contribution
							</th>
							<th class="px-3 py-2 font-medium">
								Rate
							</th>
							<th class="px-3 py-2 font-medium">
								Who pays
							</th>
							<th class="px-3 py-2 font-medium">
								On the payslip?
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium align-top">
								EPF — employee
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								8%
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Employee
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Yes — a <strong>deduction</strong> line that reduces net pay.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium align-top">
								EPF — employer
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								12%
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Business
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Shown + printed as your contribution, but <em>not</em> deducted from the employee's net.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium align-top">
								ETF
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								3%
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted)">
								Business
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Shown + printed as your contribution, again not deducted from net.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<HelpCallout variant="tip" title="Only the employee 8% touches net pay">
				The employer EPF (12%) and ETF (3%) are your costs as the business — they don't come out of what the employee takes home. Sakoram keeps them on the payslip for the record and the PDF, but only the employee's 8% reduces net pay.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Turning on EPF / ETF" icon="i-lucide-toggle-right">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Open <NuxtLink to="/settings/payroll" class="text-(--ui-primary) hover:underline">
						Payroll settings
					</NuxtLink> and find the <strong>Statutory contributions (EPF / ETF)</strong> card.
				</li>
				<li>Flip the switch on. The Sri Lankan defaults (8% / 12% / 3%) are pre-filled — adjust only if your situation differs.</li>
				<li>Save. From now on, every new payslip auto-adds the employee EPF deduction line and records the employer EPF + ETF figures.</li>
			</ol>
			<HelpCallout variant="info" title="Existing payslips aren't touched">
				Turning the toggle on affects payslips you create <em>after</em> saving. Already-issued payslips are immutable and keep whatever figures they were issued with.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="PAYE (APIT)" icon="i-lucide-percent">
			<p>
				PAYE — Pay As You Earn, now officially <strong>APIT</strong> (Advance Personal Income Tax) — is the income tax you withhold from an employee's salary each month and remit to the IRD on their behalf. Unlike EPF, it only applies once someone's income crosses the tax-free threshold, so the master toggle defaults <strong>off</strong>.
			</p>
			<p>
				Sakoram uses the <strong>monthly tax-table method</strong>: a tax-free relief, then a set of progressive bands on the taxable income above it.
			</p>
			<HelpCallout variant="tax" title="The seeded SL 2025/26 monthly table">
				Sakoram ships with the current table pre-loaded — relief <strong>Rs 150,000</strong> per month, then on the taxable income above relief:
				<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg) mt-3">
					<table class="w-full text-sm">
						<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
							<tr>
								<th class="px-3 py-2 font-medium">
									Taxable income (after relief)
								</th>
								<th class="px-3 py-2 font-medium">
									Rate
								</th>
							</tr>
						</thead>
						<tbody class="tabular-nums">
							<tr class="border-t border-(--ui-border)">
								<td class="px-3 py-2 text-(--ui-text-muted)">
									Up to Rs 83,333
								</td>
								<td class="px-3 py-2 text-(--ui-text-muted)">
									6%
								</td>
							</tr>
							<tr class="border-t border-(--ui-border)">
								<td class="px-3 py-2 text-(--ui-text-muted)">
									Up to Rs 125,000
								</td>
								<td class="px-3 py-2 text-(--ui-text-muted)">
									18%
								</td>
							</tr>
							<tr class="border-t border-(--ui-border)">
								<td class="px-3 py-2 text-(--ui-text-muted)">
									Up to Rs 166,667
								</td>
								<td class="px-3 py-2 text-(--ui-text-muted)">
									24%
								</td>
							</tr>
							<tr class="border-t border-(--ui-border)">
								<td class="px-3 py-2 text-(--ui-text-muted)">
									Up to Rs 208,333
								</td>
								<td class="px-3 py-2 text-(--ui-text-muted)">
									30%
								</td>
							</tr>
							<tr class="border-t border-(--ui-border)">
								<td class="px-3 py-2 text-(--ui-text-muted)">
									Balance (everything above)
								</td>
								<td class="px-3 py-2 text-(--ui-text-muted)">
									36%
								</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p class="mt-2 text-xs">
					Rates change with the national budget. When the IRD updates the table, edit the bands here — Sakoram doesn't push updates to your offline copy.
				</p>
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Configuring PAYE" icon="i-lucide-sliders-horizontal">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					In <NuxtLink to="/settings/payroll" class="text-(--ui-primary) hover:underline">
						Payroll settings
					</NuxtLink>, find the <strong>PAYE (APIT)</strong> card and switch it on.
				</li>
				<li>Set the <strong>monthly tax-free relief</strong> (default Rs 150,000). Income below this is untaxed.</li>
				<li>
					Decide whether to <strong>deduct employee EPF first</strong>. When ticked (the default), the 8% EPF is subtracted before the income is taxed — so PAYE is computed on salary net of EPF.
				</li>
				<li>Tune the <strong>tax bands</strong> if the budget has changed — add, remove, or edit bands. The last band is the open "balance" band and can't be removed.</li>
				<li>Use the live <strong>preview</strong> at the bottom of the card to sanity-check the tax on a sample gross before saving.</li>
			</ol>
			<HelpCallout variant="tip" title="The preview is your friend">
				Type a representative monthly gross into the preview box and Sakoram shows the per-band breakdown and total PAYE. It's the fastest way to confirm your bracket edits match the IRD's worked example.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Per-payslip control" icon="i-lucide-file-spreadsheet">
			<p>
				The settings page sets the defaults; each individual payslip can still opt in or out. On a draft payslip you'll see toggles for the statutory deductions and for PAYE — both seeded from your settings but overridable for that one payslip (handy for a contractor exempt from EPF, or a bonus-only run you don't want taxed at the normal monthly rate).
			</p>
			<p>
				While the payslip is a draft, the EPF and PAYE deduction lines are <strong>managed</strong> — they recompute automatically whenever you change the earnings. Once you <strong>issue</strong> the payslip the figures freeze, matching the immutability rule for all issued documents.
			</p>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't hand-add a line that's already auto-computed">
				If EPF or PAYE auto-compute is on, Sakoram already adds the managed deduction line. Adding a second manual "EPF" line double-deducts. Let the toggle own those lines; only add manual deductions for things it doesn't handle (salary advances, loan instalments, no-pay leave).
			</HelpCallout>
			<HelpCallout variant="warning" title="Check the relief and bands after a budget">
				The seeded table reflects SL 2025/26. The figures are frozen in your offline copy — when the IRD revises them, update the relief + bands in Payroll settings yourself, or you'll keep withholding at the old rates.
			</HelpCallout>
			<HelpCallout variant="warning" title="Mark EPF-liable earnings correctly">
				EPF / ETF are computed only on earning lines flagged EPF-liable. If you add a regular allowance that should attract EPF but leave it unflagged, the contributions will be understated. Reimbursements and one-off payments are usually not EPF-liable.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// EPF / ETF / PAYE statutory help topic. Documents the auto-compute
// shipped in migrations 0035 (EPF/ETF) + 0036 (PAYE), configured on
// /settings/payroll. Keep the seeded bracket figures here in sync with
// the migration 0036 default if the table is ever re-seeded.
</script>
