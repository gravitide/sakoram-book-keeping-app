<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is Aged receivables?" icon="i-lucide-info">
			<p>
				<strong>Aged receivables</strong> tells you, as of today, exactly who owes you money — and <em>how long</em> they've owed it. It's the report you open before doing your "chase outstanding payments" round.
			</p>
			<p>
				Unlike P&L or Cash flow which work over a date range, this is a <strong>snapshot</strong>. There's no "From" / "To" — only "as of now." Sakoram's version is at <NuxtLink to="/reports/aged-receivables" class="text-(--ui-primary) hover:underline">
					/reports/aged-receivables
				</NuxtLink>.
			</p>
		</HelpSection>

		<HelpSection title="The five aging buckets" icon="i-lucide-clock">
			<p>
				Every outstanding invoice is sorted into one of five buckets by how many days have passed since its due date:
			</p>
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
								Not yet due. Within the agreed payment window. Healthy.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm bg-(--ui-warning)/60" /> 1–30 days</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Just slipped past due. A friendly reminder usually does it.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm bg-(--ui-warning)" /> 31–60 days</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Getting awkward. Call, don't email.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm bg-(--ui-error)/70" /> 61–90 days</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Serious. Consider a formal demand or stopping further work.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<span class="inline-flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-sm bg-(--ui-error)" /> 90+ days</span>
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Probably won't be paid without legal action. Talk to a lawyer; consider writing off.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="What's in the report" icon="i-lucide-list">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Three KPI tiles:</strong> Total outstanding, Overdue (sum of all four overdue buckets), Current.
				</li>
				<li>
					<strong>Bucket distribution table</strong> — count + amount + % of total for each bucket. Quick scan: if 70% of your receivables are 90+ days old, that's a structural cash-flow problem, not a one-off.
				</li>
				<li>
					<strong>Per-client breakdown</strong> on a ResizableDataTable, sorted by total descending so the worst-aged clients land at the top. Click a row to jump to <NuxtLink to="/invoices" class="text-(--ui-primary) hover:underline">
						/invoices
					</NuxtLink> pre-filtered to that client.
				</li>
				<li>
					<strong>PDF export</strong> for board reporting or for handing to a collections agency.
				</li>
			</ul>
		</HelpSection>

		<HelpSection title="How to use it" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Open <NuxtLink to="/reports/aged-receivables" class="text-(--ui-primary) hover:underline">
						/reports/aged-receivables
					</NuxtLink>. Numbers refresh from current data automatically.
				</li>
				<li>
					Glance at the Overdue tile — that's the at-risk number.
				</li>
				<li>
					Scan the bucket distribution. Most of your overdue should be in 1–30. If 31+ or 60+ buckets are growing, your collections process is breaking down.
				</li>
				<li>
					In the per-client table, focus on the top 5–10 rows (largest overdue amounts). Click each → opens their invoices pre-filtered → call / email those clients with the specific invoice numbers in front of you.
				</li>
				<li>
					Print the PDF for your monthly accountant check-in or board update.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="What counts (and what doesn't)" icon="i-lucide-filter">
			<p>The report includes:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Sent invoices</strong> with a positive outstanding balance.
				</li>
			</ul>
			<p>It excludes:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li><strong>Draft invoices</strong> — not yet issued to the client, no obligation exists yet.</li>
				<li><strong>Cancelled invoices</strong> — voided.</li>
				<li><strong>Fully-paid invoices</strong> — balance is zero, not owed any more.</li>
			</ul>
			<HelpCallout variant="info" title="Balance comes from the voucher ledger">
				The "outstanding" amount on each invoice is its total minus the sum of receipt vouchers linked to it. So the report uses the exact same arithmetic as the invoice detail page's "Balance" line — they can never disagree. If an invoice shows up here that you think is paid, the receipt voucher is missing or wrong. Open the invoice; check its Payments panel.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="What to do about it" icon="i-lucide-phone-call">
			<HelpCallout variant="tip" title="Standard collections sequence">
				<ol class="list-decimal pl-5 mt-1 space-y-0.5">
					<li><strong>1–7 days overdue:</strong> friendly reminder email with the invoice attached. Many clients just forgot.</li>
					<li><strong>8–30 days:</strong> phone call, polite but firm. Confirm they received it, confirm payment plans.</li>
					<li><strong>31–60 days:</strong> escalation. Formal demand letter, optional stop on further work until cleared.</li>
					<li><strong>60+ days:</strong> consider legal action or a collections agency. Talk to your accountant about writing the debt off.</li>
				</ol>
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't let 90+ amounts sit forever">
				A 90+-day-old amount is unlikely to be paid without intervention. If you've made several attempts and the client is unresponsive, the right move is usually to write the debt off (accept the loss on your books) and stop wasting energy. Talk to your accountant about the tax-deductibility of bad debts.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't set due dates you don't enforce">
				If you put "Net 30" on every invoice but never chase before 60 days, your due dates are meaningless and your clients know it. Either match your payment terms to your actual collections behaviour, or actually enforce the terms you set.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't ignore the bucket trend">
				Watch the report over time. If your 1–30 bucket grew last month, that's fine — clients are paying eventually. If your 31–60 bucket grew, that's a leading indicator of cash-flow trouble. By the time it shows up in the 60+ bucket, it's already a problem.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't forget to record receipts">
				If a client paid you but you never created the receipt voucher, the invoice stays "sent" and shows up here as overdue. Cross-check the report against your bank statement weekly — anything overdue here that's actually been paid usually means a missing voucher entry.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Aged receivables help topic.
</script>
