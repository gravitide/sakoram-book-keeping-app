<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is bookkeeping (in 90 seconds)?" icon="i-lucide-book-open">
			<p>
				<strong>Bookkeeping</strong> is the practice of recording every business transaction — money in, money out, what you owe, what's owed to you — so that at any point in time you can answer four questions:
			</p>
			<ol class="list-decimal pl-5 space-y-1.5">
				<li><strong>How much did we earn?</strong> (Revenue)</li>
				<li><strong>How much did we spend?</strong> (Expenses)</li>
				<li><strong>How much money is in the bank right now?</strong> (Cash position)</li>
				<li><strong>How much do we owe to / are owed by other people?</strong> (Liabilities + receivables)</li>
			</ol>
			<p>
				Every other thing you'll do in an accounting app — invoicing a client, paying a supplier, running payroll, filing VAT, talking to your accountant — is in service of being able to answer those four questions accurately at any moment.
			</p>
		</HelpSection>

		<HelpSection title="The two flows: obligations vs cash" icon="i-lucide-shuffle">
			<p>
				The core mental model in Sakoram (and most modern accounting software) splits transactions into <strong>two parallel streams</strong>:
			</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-elevated) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Stream
							</th>
							<th class="px-3 py-2 font-medium">
								What it tracks
							</th>
							<th class="px-3 py-2 font-medium">
								Documents
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Obligations
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Who owes whom, regardless of whether the money has moved yet. <em>"You did the work, the client is supposed to pay."</em>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								<NuxtLink to="/help/invoices" class="text-(--ui-primary) hover:underline">
									Invoices
								</NuxtLink>, <NuxtLink to="/help/bills" class="text-(--ui-primary) hover:underline">
									bills
								</NuxtLink>, <NuxtLink to="/help/payslips" class="text-(--ui-primary) hover:underline">
									payslips
								</NuxtLink>, <NuxtLink to="/help/credit-notes" class="text-(--ui-primary) hover:underline">
									credit notes
								</NuxtLink>
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								Cash
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								The money that actually moved. <em>"The client transferred Rs 50,000 today."</em>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								<NuxtLink to="/help/vouchers" class="text-(--ui-primary) hover:underline">
									Vouchers
								</NuxtLink> (receipt / payment)
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<HelpCallout variant="tip" title="The link between them is everything">
				When a client pays an invoice, you record a <strong>receipt voucher linked to that invoice</strong>. Sakoram derives "invoice paid" from the linked vouchers — there's no separate "mark as paid" step that could lie. Same when you pay a bill: a payment voucher linked to the bill. This is what makes the books reliable.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="The five documents you'll actually use" icon="i-lucide-files">
			<p>If you map these to Sakoram's sidebar, the picture becomes:</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-elevated) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Document
							</th>
							<th class="px-3 py-2 font-medium">
								One-line summary
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<NuxtLink to="/help/quotes" class="text-(--ui-primary) hover:underline">
									Quotes
								</NuxtLink>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Price proposal sent <em>before</em> doing the work. Not money owed yet.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<NuxtLink to="/help/invoices" class="text-(--ui-primary) hover:underline">
									Invoices
								</NuxtLink>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Bill you send to a client. Money owed <strong>to you</strong>.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<NuxtLink to="/help/credit-notes" class="text-(--ui-primary) hover:underline">
									Credit notes
								</NuxtLink>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								"Negative invoice" — reduces what a client owes (refund, return, over-charge correction).
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<NuxtLink to="/help/bills" class="text-(--ui-primary) hover:underline">
									Bills
								</NuxtLink>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Invoice you receive from a vendor. Money owed <strong>by you</strong>.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<NuxtLink to="/help/vouchers" class="text-(--ui-primary) hover:underline">
									Vouchers
								</NuxtLink>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Record of money that <strong>actually moved</strong> in or out.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<NuxtLink to="/help/payslips" class="text-(--ui-primary) hover:underline">
									Payslips
								</NuxtLink>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Per-employee pay record. Earnings, deductions, net pay.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="Accrual vs cash — the one accountant word you'll see" icon="i-lucide-scale">
			<p>You'll hear these two terms a lot. The distinction matters because Sakoram has reports for both:</p>
			<ul class="list-disc pl-5 space-y-2">
				<li>
					<strong>Accrual basis</strong> — count income when you <em>invoice</em> the client, even if they haven't paid yet. Count expenses when you <em>receive a bill</em>, even if you haven't paid yet. The <NuxtLink to="/help/profit-loss" class="text-(--ui-primary) hover:underline">
						Profit & Loss report
					</NuxtLink> works this way. It answers "what did we earn / spend this period?" by document date.
				</li>
				<li>
					<strong>Cash basis</strong> — count income when the client <em>actually pays</em>, count expenses when you <em>actually pay</em>. The <NuxtLink to="/help/cash-flow" class="text-(--ui-primary) hover:underline">
						Cash flow report
					</NuxtLink> works this way. It answers "did more money come in than out this period?" by voucher date.
				</li>
			</ul>
			<HelpCallout variant="info" title="Both are correct. Different questions.">
				If you invoice a client Rs 100,000 in May but they pay in June, your May P&L shows +100,000 income (accrual), but your May cash-flow shows nothing (the cash didn't move until June). Neither is wrong — they answer different questions. Big businesses use accrual for "are we profitable"; small businesses watch cash-flow for "can we make payroll next week."
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Sri Lankan tax landscape (the basics)" icon="i-lucide-landmark">
			<p>If your business operates in Sri Lanka, you'll touch these regularly:</p>
			<HelpCallout variant="tax" title="VAT (Value Added Tax)">
				If your turnover exceeds the IRD threshold, you register for VAT. You collect VAT on invoices (<strong>output VAT</strong>), pay VAT on bills (<strong>input VAT</strong>), and remit the difference to the IRD monthly. Sakoram's <NuxtLink to="/help/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink> totals all of this for any period.
			</HelpCallout>
			<HelpCallout variant="tax" title="Fiscal year is April–March">
				The Sri Lankan government fiscal year runs April through March, not the calendar year. Sakoram defaults to this — invoice numbers carry the FY (e.g. <span class="font-mono text-xs">INV-2026-0001</span> for the first invoice of FY 2026, which runs Apr 2026 → Mar 2027), and report presets like "Fiscal year" use the gov FY.
			</HelpCallout>
			<HelpCallout variant="tax" title="Payroll: EPF, ETF, PAYE">
				Hiring anyone? You're now on the hook for EPF (8% employee + 12% employer), ETF (3% employer), and possibly PAYE income tax depending on the employee's salary. See the <NuxtLink to="/help/payslips" class="text-(--ui-primary) hover:underline">
					Payslips topic
				</NuxtLink> for the breakdown.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Where to start if you're brand new" icon="i-lucide-compass">
			<p>
				Most small business owners discover they need bookkeeping right around the time their first invoice goes unpaid. Reasonable order of operations:
			</p>
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Set up your <NuxtLink to="/settings/company" class="text-(--ui-primary) hover:underline">
						business details
					</NuxtLink>: name, address, tax ID, default VAT rate, payment terms.
				</li>
				<li>
					Add your first few <NuxtLink to="/clients" class="text-(--ui-primary) hover:underline">
						clients
					</NuxtLink> and <NuxtLink to="/vendors" class="text-(--ui-primary) hover:underline">
						vendors
					</NuxtLink>.
				</li>
				<li>
					Read the <NuxtLink to="/help/invoices" class="text-(--ui-primary) hover:underline">
						Invoices topic
					</NuxtLink> and issue one. Watch the status update when you record payment.
				</li>
				<li>
					Read the <NuxtLink to="/help/bills" class="text-(--ui-primary) hover:underline">
						Bills topic
					</NuxtLink> and record one. Categorize it. Pay it.
				</li>
				<li>
					Read the <NuxtLink to="/help/vouchers" class="text-(--ui-primary) hover:underline">
						Vouchers topic
					</NuxtLink> — the key to understanding why the rest of the system feels "magical" (it's not, it's just disciplined linking).
				</li>
				<li>
					At month-end, open your <NuxtLink to="/reports/profit-loss" class="text-(--ui-primary) hover:underline">
						P&L report
					</NuxtLink> and your <NuxtLink to="/reports/cash-flow" class="text-(--ui-primary) hover:underline">
						Cash flow report
					</NuxtLink>. Compare the two. They tell different stories about the same month.
				</li>
				<li>
					Once you have employees, set up <NuxtLink to="/settings/payroll" class="text-(--ui-primary) hover:underline">
						payroll cycle settings
					</NuxtLink> and read the <NuxtLink to="/help/payslips" class="text-(--ui-primary) hover:underline">
						Payslips topic
					</NuxtLink>.
				</li>
			</ol>
			<HelpCallout variant="tip" title="The hardest part is being consistent">
				The biggest mistake small businesses make isn't bad bookkeeping — it's <em>inconsistent</em> bookkeeping. Recording every invoice the day you send it is easy; "I'll catch up at year-end" is how three years of accounting hell starts. Sakoram is built so the daily input is fast (the modals are 3-field, the line editor is keyboard-friendly); the dividend is that month-end reports require zero clean-up.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Bookkeeping basics — entry-point topic for users new to
// bookkeeping. Sits in the "general" category and is linked from
// every other topic's relatedSlugs as the "back to basics" anchor.
</script>
