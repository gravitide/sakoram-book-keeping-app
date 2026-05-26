<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is a quote?" icon="i-lucide-info">
			<p>
				A <strong>quote</strong> (also called a "quotation" or "estimate") is a price proposal you send to a potential client <em>before</em> doing the work. It's not a bill — no money is owed yet. It's a written commitment to a price, valid for some period, that the client uses to decide whether to hire you.
			</p>
			<p>
				When the client accepts a quote, you typically convert it into an <NuxtLink to="/help/invoices" class="text-(--ui-primary) hover:underline">
					invoice
				</NuxtLink> (sometimes after the work is done, sometimes upfront with deposit). Sakoram has a one-click convert flow that copies the quote's lines into a fresh invoice draft, linking the two so you can trace the audit trail later.
			</p>
		</HelpSection>

		<HelpSection title="The quote lifecycle" icon="i-lucide-route">
			<p>Quotes move through more states than invoices because they have a sales-pipeline shape:</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								State
							</th>
							<th class="px-3 py-2 font-medium">
								What it means
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 whitespace-nowrap align-top">
								<StatusBadge status="draft" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Editable, hasn't gone to the client yet.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="sent" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Sent to the client. Waiting on their decision.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="accepted" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Client said yes. Ready to convert into an invoice.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="rejected" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Client said no. Keep it for the audit trail.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="expired" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Valid-until date passed with no decision. Quote is no longer binding.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 align-top">
								<StatusBadge status="converted" />
							</td>
							<td class="px-3 py-2.5 text-(--ui-text-muted) leading-relaxed">
								Already turned into an invoice. The invoice link sits on the quote detail page.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<HelpCallout variant="tip" title="Reopening a rejected or expired quote">
				If the client changes their mind, or if the price needs adjusting and re-sending, you can move a rejected / expired quote back to draft. This is the only "edit after issue" path — saves you from burning a quote number on a misclick.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="How to create one in Sakoram" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Go to <NuxtLink to="/quotes" class="text-(--ui-primary) hover:underline">
						Quotes
					</NuxtLink> and click <strong>New quote</strong>.
				</li>
				<li>
					Pick the <strong>client</strong> and optional <strong>project title</strong>. The quote number auto-allocates (e.g. <span class="font-mono text-xs">QUO-2026-0001</span>).
				</li>
				<li>
					On the detail page, set the <strong>issue date</strong> and <strong>valid until</strong> date. The validity defaults to issue + your quote-validity setting (Settings → Business details, typically 30 days).
				</li>
				<li>
					Add <strong>line items</strong> — same bundle vs itemized choice as invoices. Quotes for fixed-price project work usually use bundle mode; goods / hourly use itemized.
				</li>
				<li>
					Click <strong>Send</strong>. Status flips to sent.
				</li>
				<li>
					When the client responds: <strong>Mark accepted</strong> or <strong>Mark rejected</strong>. If they don't respond by the validity date, Sakoram nudges it to <strong>expired</strong>.
				</li>
				<li>
					From an accepted quote, click <strong>Convert to invoice</strong>. A new draft invoice opens pre-filled with the quote's lines + client + project. The original quote flips to <strong>converted</strong> and links to the new invoice.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="Quote vs invoice — quick decoder" icon="i-lucide-shuffle">
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Quote
							</th>
							<th class="px-3 py-2 font-medium">
								Invoice
							</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 leading-relaxed">
								Proposal — "this is what it would cost."
							</td>
							<td class="px-3 py-2.5 leading-relaxed">
								Bill — "this is what you owe."
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 leading-relaxed">
								Not a tax document. No VAT obligation until accepted.
							</td>
							<td class="px-3 py-2.5 leading-relaxed">
								Tax document. VAT reported on the IRD return.
							</td>
						</tr>
						<tr class="border-t border-(--ui-border)">
							<td class="px-3 py-2.5 leading-relaxed">
								Has a validity (expires).
							</td>
							<td class="px-3 py-2.5 leading-relaxed">
								Has a due date (payment expected by).
							</td>
						</tr>
						<tr class="border-t border-(--ui-border) bg-(--ui-bg-muted)/40">
							<td class="px-3 py-2.5 leading-relaxed">
								Client can accept / reject / ignore.
							</td>
							<td class="px-3 py-2.5 leading-relaxed">
								Client is expected to pay.
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Don't skip the validity date">
				Quotes without a validity period are a problem — the client can come back six months later claiming the price is still valid. Sakoram requires the field, but it's worth understanding why: it's your commitment window. Pick something realistic (30 days is the SL default; project work might warrant 60-90).
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't treat a quote as money received">
				A sent quote isn't income. It's a proposal. The IRD doesn't count quote totals for revenue — only invoiced amounts. Sakoram's <NuxtLink to="/reports/profit-loss" class="text-(--ui-primary) hover:underline">
					Profit & Loss report
				</NuxtLink> follows the same rule (only counts invoices, not quotes), so don't worry about over-reporting income from outstanding quotes.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't edit a converted quote">
				If you converted a quote to an invoice and then realize the price was wrong, edit the invoice (if still draft) or issue a credit note (if sent). Don't try to retro-edit the quote — the audit trail breaks.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Quotes help topic.
</script>
