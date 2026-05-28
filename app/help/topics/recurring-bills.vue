<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is a recurring bill?" icon="i-lucide-info">
			<p>
				A <strong>recurring bill</strong> is a <em>template</em> — not a real bill. It's a stored recipe ("Landlord LLC bills me Rs 75,000 + VAT for office rent on the 1st of every month") that Sakoram tracks so you can mint the actual bill with one click when each cycle comes due.
			</p>
			<p>
				The template carries the vendor, the schedule (weekly / monthly / quarterly / yearly), the line items, the payment terms, the VAT rate, and the expense category. Each time you click <strong>Generate now</strong> (or run a bulk generation from the list page), Sakoram creates a fresh row in your <NuxtLink to="/bills" class="text-(--ui-primary) hover:underline">
					Bills
				</NuxtLink> list and advances the template's <em>next issue date</em> by one cycle.
			</p>
			<HelpCallout variant="tip" title="Templates are inert — nothing happens automatically">
				Sakoram <strong>never auto-generates bills in the background</strong>. The "pending count" on the recurring-bills page tells you what's due; you click to materialise them. This is deliberate — silently auto-recording would be scary (what if the vendor went quiet that month, or the amount changed?). Same UX convention recurring invoices follow.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="When would you set one up?" icon="i-lucide-clipboard-list">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Office rent.</strong> Same landlord, same amount, same day every month. The classic case.
				</li>
				<li>
					<strong>Subscription services.</strong> Software (Microsoft 365, Google Workspace), hosting, accounting tools, gym memberships — anything where a vendor charges you a flat fee on a regular cadence.
				</li>
				<li>
					<strong>Utility-style retainers.</strong> Lawyer on retainer, accountant on monthly fee, security service. Predictable amounts every month.
				</li>
				<li>
					<strong>Annual contracts.</strong> Insurance premiums, certifications, licence renewals. Set the frequency to <em>Yearly</em> and Sakoram surfaces it once a year.
				</li>
			</ul>
			<HelpCallout variant="warning" title="Not for variable expenses">
				If the amount changes month-to-month (electricity bills, courier invoices, supplier orders), just create a normal bill from <NuxtLink to="/bills" class="text-(--ui-primary) hover:underline">
					Bills
				</NuxtLink>. Recurring templates only pay off when the same charge repeats at a fixed amount and cadence.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="How to set one up in Sakoram" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Go to <NuxtLink to="/recurring-bills" class="text-(--ui-primary) hover:underline">
						Recurring bills
					</NuxtLink> in the sidebar and click <strong>New recurring</strong>.
				</li>
				<li>
					Give it a <strong>template name</strong> ("Landlord LLC — monthly rent"), pick the vendor, choose the frequency, and set the start date. Click <strong>Create template</strong>.
				</li>
				<li>
					You land on the detail page. Set the <strong>bundle subtotal</strong> (most rent / subscription bills are bundle-priced) or switch to <em>Itemized</em> and add per-line breakdowns. Set the VAT rate.
				</li>
				<li>
					On the Defaults card, pick the <strong>category</strong> the bill belongs to (Rent, Software, Utilities, etc.) — it flows onto every generated bill and your expense reports group by it.
				</li>
				<li>
					Tune the <strong>payment terms</strong> (Net-N — added to each generated bill's issue date to compute the due date). For most vendor charges that hit on the 1st with payment expected on the 7th, that's 7 days.
				</li>
				<li>
					Optionally set an <strong>end date</strong> in the schedule card — past that, Sakoram stops surfacing this template as pending. Leave blank for an open-ended schedule.
				</li>
				<li>
					Click <strong>Save changes</strong> in the sticky save bar. The template is armed.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="The generation flow" icon="i-lucide-play">
			<p>
				When a template's next issue date arrives, it shows up in the <strong>"Generate pending"</strong> count on the recurring-bills page header. Click that button to see what's due — every pending template is pre-ticked, the date next to each row tells you what cycle is about to roll, and you can untick any you want to skip this round.
			</p>
			<p>
				Confirm, and Sakoram does this for each ticked template:
			</p>
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>Allocates a fresh bill number (<span class="font-mono text-xs">BIL-2026-NNNN</span>) — the next in your sequence.</li>
				<li>Copies the vendor, line items, category, VAT rate, and notes from the template.</li>
				<li>Sets <strong>issue date = today</strong> and <strong>due date = today + the template's payment terms</strong>.</li>
				<li>Saves the new row in your bills table with status <strong>unpaid</strong>.</li>
				<li>Advances the template's <em>next issue date</em> by one cycle (next month / next week / next quarter / next year).</li>
			</ol>
			<HelpCallout variant="info" title="Generated bills are real liabilities immediately">
				Unlike recurring <em>invoices</em> (which materialise as <em>drafts</em> for review), generated bills land in <strong>unpaid</strong> state right away — they're real obligations on your books. To pay one, open it on <NuxtLink to="/bills" class="text-(--ui-primary) hover:underline">
					Bills
				</NuxtLink> and click <em>Record payment</em>, which creates a payment voucher in your cash ledger.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Pause vs delete" icon="i-lucide-pause">
			<p>Two ways to stop a template from generating:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Pause</strong> — flips the template to inactive. It stays in your list, keeps its line items and schedule, but doesn't show up in the pending count. Use this for a temporary stop: lease on hold for a quarter, software subscription cancelled while you evaluate a competitor, etc. Click <strong>Resume</strong> when ready.
				</li>
				<li>
					<strong>Delete</strong> — removes the template permanently. Already-generated bills are <strong>untouched</strong> (they're real rows in the bills table, independent of the template). Use this when the arrangement is over for good.
				</li>
			</ul>
		</HelpSection>

		<HelpSection title="Sri Lankan tax angle" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="Input VAT inherits from the template">
				Each generated bill picks up the VAT rate from the template. The bill's VAT lands in your input VAT total on the <NuxtLink to="/reports/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink> — which you net against output VAT on issued invoices to compute what you actually pay the IRD each month. If the vendor's VAT rate changes (or they stop being VAT-registered), open the template detail page and update the <strong>VAT rate (%)</strong> field; future generations will use the new rate. Already-generated bills can be edited individually on the bills page.
			</HelpCallout>
			<p>
				Categorizing matters here too. Sakoram groups bills by category on the P&L and the <NuxtLink to="/reports/expenses-by-vendor" class="text-(--ui-primary) hover:underline">
					Expenses by vendor
				</NuxtLink> report, so picking the right category on the template means every generated bill is correctly classified for tax filings and management reporting without you having to fix it after the fact.
			</p>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Editing the template doesn't fix already-generated bills">
				Changing the bundle subtotal on the template only affects <em>future</em> generations. Bills you've already generated are independent — to update one, edit it directly on the bills page.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't generate every pending template blindly">
				The <strong>Generate pending</strong> modal pre-selects every template that's due. If a vendor is in dispute, a service was cancelled mid-cycle, or you've negotiated a one-off discount — untick them before confirming. Generated bills can be edited or deleted, but it's tidier to skip the generation entirely.
			</HelpCallout>
			<HelpCallout variant="warning" title="Bills generate as UNPAID — record payment when you actually pay">
				Sakoram doesn't auto-pay anything. After generating, the bill sits in your bills list with a balance. Once you've paid it (bank transfer, cheque, whatever), open the bill and click <em>Record payment</em> to create the payment voucher that closes out the balance.
			</HelpCallout>
			<HelpCallout variant="warning" title="Use the right document type">
				Recurring <em>bills</em> are for money YOU owe (vendor → you). Recurring <NuxtLink to="/recurring-invoices" class="text-(--ui-primary) hover:underline">
					invoices
				</NuxtLink> are for money owed TO you (you → client). The schedules look identical but the directions are opposite — easy to mix up if you set one up in a hurry.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Recurring bills help topic. Mirrors recurring-invoices but covers the
// vendor side: what a template is, when to use it, the manual
// generation flow, pause vs delete, and the gotchas (VAT inheritance,
// unpaid-not-draft generation, easy to confuse with recurring
// invoices).
</script>
