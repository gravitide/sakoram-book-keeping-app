<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is a customer statement?" icon="i-lucide-info">
			<p>
				A <strong>customer statement</strong> (also called a <em>statement of account</em>) is a one-page PDF that lists <strong>every outstanding invoice</strong> a client owes you, with a running total, an aging breakdown, and your payment details. It's the document you send when you want the client to settle up.
			</p>
			<p>
				It's not a new bill — every invoice on the statement was already issued. The statement just <em>summarises</em> what's still unpaid, so the client doesn't have to dig through their email to figure out what they owe you across multiple invoices.
			</p>
			<HelpCallout variant="tip" title="Statements aren't stored documents">
				Unlike invoices and credit notes, a statement is generated <strong>on demand</strong> from current data — it's a snapshot of "as of right now, you owe us this." Sakoram doesn't archive statements, doesn't give them a number, and doesn't lock them. Re-generate any time and the figures reflect whatever has been paid since.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="When would you send one?" icon="i-lucide-clipboard-list">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Monthly collections cycle.</strong> Many businesses send statements to every client with an outstanding balance at the start of each month — a friendly nudge before specific invoices go overdue.
				</li>
				<li>
					<strong>Chasing a slow payer.</strong> Client owes you across three or four invoices and you want to consolidate the ask into one document. Easier for them to action than three separate reminders.
				</li>
				<li>
					<strong>Client requested it.</strong> Their accounts team is reconciling at month-end and wants the canonical "what does X owe Y" view.
				</li>
				<li>
					<strong>Year-end / quarter-end review.</strong> Send statements to every client with open balances so they can confirm what's outstanding before your books close for the period.
				</li>
			</ul>
		</HelpSection>

		<HelpSection title="How to generate one in Sakoram" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Go to <NuxtLink to="/clients" class="text-(--ui-primary) hover:underline">
						Clients
					</NuxtLink> in the sidebar.
				</li>
				<li>
					Toggle the <strong>"Has outstanding"</strong> chip in the filter row. The list narrows to clients with at least one unpaid invoice, sorted by amount descending — the biggest receivable lands at the top.
				</li>
				<li>
					Click into the client you want to chase.
				</li>
				<li>
					In the header action cluster, click the primary-coloured <strong>Statement</strong> button (clock icon). It's disabled — with a tooltip — if the client has nothing outstanding.
				</li>
				<li>
					The PDF preview opens with the full statement. Click <strong>Save as…</strong> to keep a copy, or <strong>Print</strong> to send it straight to a printer or PDF re-printer for emailing.
				</li>
			</ol>
			<HelpCallout variant="tip" title="Two ways to find clients to chase">
				The <NuxtLink to="/reports/aged-receivables" class="text-(--ui-primary) hover:underline">
					Aged receivables report
				</NuxtLink> is the deeper view — same list of clients, but broken down by how late each balance is (current / 1-30 / 31-60 / 61-90 / 90+ days past due). Use it when you want to focus on the truly delinquent rather than everyone with an open invoice. Click any client row to land on their detail page, then hit Statement from there.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="What appears on the statement" icon="i-lucide-file-text">
			<p>The PDF lays out as a landscape A4 page:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Your business identity</strong> — logo, name, address, tax ID, phone. Pulled from <NuxtLink to="/settings/company" class="text-(--ui-primary) hover:underline">
						Business details
					</NuxtLink>.
				</li>
				<li>
					<strong>The client's details</strong> — name, address, tax ID, email. Pulled from the current client record (not a snapshot — see below).
				</li>
				<li>
					<strong>Outstanding balance</strong> — big red number in the top-right. The grand total of every unpaid invoice on the statement.
				</li>
				<li>
					<strong>Aging summary</strong> — five tiles across the page: Current (not yet due) / 1–30 / 31–60 / 61–90 / 90+. Each tile shows the count of invoices and the total amount in that bucket, so the client can see at a glance how delinquent the balance is.
				</li>
				<li>
					<strong>Invoice list</strong> — every outstanding invoice with its number, issue date, due date, original total, paid amount (if any), balance, and a status string ("Due in 13 days" / "Due today" / "282 days overdue"). Sorted oldest-first so the most overdue items lead the table.
				</li>
				<li>
					<strong>Payment details</strong> — your default business bank's account info, so the client knows where to send the money. Configure this at <NuxtLink to="/settings/company" class="text-(--ui-primary) hover:underline">
						Business details → Bank accounts
					</NuxtLink>.
				</li>
			</ul>
		</HelpSection>

		<HelpSection title="What 'outstanding' actually means" icon="i-lucide-scale">
			<p>
				Sakoram filters the invoice list to a specific set of statuses — not every invoice on the client's history. An invoice appears on the statement if and only if it's:
			</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Status
							</th>
							<th class="px-3 py-2 font-medium">
								On the statement?
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<StatusBadge status="draft" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								No — drafts haven't gone to the client yet, no money is owed.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<StatusBadge status="sent" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Yes — fully unpaid, due in the future. Shows as "Due in N days" or "Due today."
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<StatusBadge status="partial" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Yes — client paid some but not all. Statement shows total / paid / balance per invoice.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<StatusBadge status="overdue" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Yes — past the due date with a balance still outstanding. Status shows "N days overdue" in red.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<StatusBadge status="paid" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								No — fully settled, nothing to chase. Falls off automatically when the last receipt voucher closes the balance.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 font-medium whitespace-nowrap align-top">
								<StatusBadge status="cancelled" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								No — cancelled invoices were voided, the client doesn't owe anything for them.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Statements aren't invoices — don't issue them as bills">
				A statement is a <em>reminder</em> document. It doesn't create a new obligation; it lists obligations the client already has from their existing invoices. If a client says "I'll pay the statement," they actually mean "I'll pay the invoices listed on the statement." Receipts still get recorded as vouchers against the specific invoices, not against the statement itself (there's nothing to record against — the statement isn't a stored document).
			</HelpCallout>
			<HelpCallout variant="warning" title="The statement uses current client details, not invoice snapshots">
				When the client's name or address has changed since some of the invoices were issued, the statement will show their <strong>current</strong> details — not the historical ones frozen on each invoice. This is intentional: the statement is a "right now" document going to the client today, so current contact info is what matters. Each invoice on the table still references the original snapshot internally; this just affects the header block.
			</HelpCallout>
			<HelpCallout variant="warning" title="Bank details come from the default bank, not the invoice's bank">
				The payment-details card at the bottom shows your business's <strong>default</strong> bank account. If different invoices on the statement were issued against different banks, only the default appears. Make sure your most-active bank account is marked default at <NuxtLink to="/settings/company" class="text-(--ui-primary) hover:underline">
					Settings → Business details
				</NuxtLink>.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Sri Lankan tax angle" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="Statements are not VAT documents">
				Unlike invoices and credit notes, a statement of account is <strong>not a tax document</strong> — it doesn't trigger VAT obligations and doesn't appear on your <NuxtLink to="/reports/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink>. It's a courtesy reminder, not a legal instrument. The IRD only cares about the underlying tax invoices that the statement summarises.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Customer statements help topic. Covers the workflow of generating
// a per-client outstanding-balance PDF from the clients list +
// detail page. Pairs with credit-notes and invoices as the
// "collections" trio in the documents category.
</script>
