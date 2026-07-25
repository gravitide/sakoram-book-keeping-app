<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is a recurring invoice?" icon="i-lucide-info">
			<p>
				A <strong>recurring invoice</strong> is a <em>template</em> — not a real invoice. It's a stored recipe ("send Acme Co Rs 50,000 + VAT every month for retainer work") that Sakoram tracks so you can mint the actual invoice with one click when each cycle comes due.
			</p>
			<p>
				The template carries the client, the schedule (weekly / monthly / quarterly / yearly), the line items, the payment terms, the VAT rate, and which business bank account to bill from. Each time you click <strong>Generate now</strong> (or run a bulk generation from the list page), Sakoram creates a fresh row in your invoices list and advances the template's <em>next issue date</em> by one cycle.
			</p>
			<HelpCallout variant="tip" title="Templates are inert — nothing happens automatically">
				Sakoram <strong>never auto-generates invoices in the background</strong>. The "pending count" on the recurring-invoices page tells you what's due; you click to materialise them. This is deliberate — silently auto-issuing would be scary (what if you wanted to skip a month because the client is on holiday, or pause for a contract renegotiation?). Industry tools like Xero and QuickBooks work the same way.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="When would you set one up?" icon="i-lucide-clipboard-list">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Monthly retainer.</strong> "Acme Co — Rs 50,000 + VAT for ongoing support, billed on the 1st of every month." The classic case.
				</li>
				<li>
					<strong>Subscription billing.</strong> Software access, hosting, maintenance plans — anything where the client pays the same amount on a regular cadence.
				</li>
				<li>
					<strong>Rent or licence fees.</strong> If you sublet office space or licence equipment, the predictable monthly bill is a perfect template.
				</li>
				<li>
					<strong>Annual contracts.</strong> Yearly memberships, certifications, insurance pass-throughs. Set the frequency to <em>Yearly</em> and Sakoram surfaces it once a year.
				</li>
			</ul>
			<HelpCallout variant="warning" title="Not for one-off work">
				If the amount changes every month, or the work is bespoke each time, just create a normal invoice from <NuxtLink to="/invoices" class="text-(--ui-primary) hover:underline">
					Invoices
				</NuxtLink>. Recurring templates only pay off when the same line items repeat at a fixed cadence.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="How to set one up in Sakoram" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Go to <NuxtLink to="/recurring-invoices" class="text-(--ui-primary) hover:underline">
						Recurring
					</NuxtLink> in the sidebar and click <strong>New recurring</strong>.
				</li>
				<li>
					Give it a <strong>template name</strong> ("Acme — monthly retainer"), pick the client, choose the frequency, and set the start date. Click <strong>Create template</strong>.
				</li>
				<li>
					You land on the detail page. Add <strong>line items</strong> just like an invoice — what's being billed, the unit price, VAT rate.
				</li>
				<li>
					Tune the <strong>defaults</strong> on the right: project title (becomes the PDF subtitle on each generated invoice), VAT rate, payment terms (Net-N — added to each generated invoice's issue date to compute the due date), and the bank account to bill from.
				</li>
				<li>
					Optionally set an <strong>end date</strong> in the schedule card — past that, Sakoram stops surfacing this template as pending. Leave blank for an open-ended schedule.
				</li>
				<li>
					Click <strong>Save changes</strong> in the sticky save bar. The template is now armed.
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="The generation flow" icon="i-lucide-play">
			<p>
				When a template's next issue date arrives, it shows up in the <strong>"Generate pending"</strong> count on the recurring-invoices page header. Click that button to see what's due — every pending template is pre-ticked, the date next to each row tells you what cycle is about to roll, and you can untick any you want to skip this round.
			</p>
			<p>
				Confirm, and Sakoram does this for each ticked template:
			</p>
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>Allocates a fresh invoice number (<span class="font-mono text-xs">INV-NNNN</span>) — the next in your sequence.</li>
				<li>Copies the client, line items, project title, VAT rate, notes, and bank from the template.</li>
				<li>Sets <strong>issue date = today</strong> and <strong>due date = today + the template's payment terms</strong>.</li>
				<li>Saves the new row in your invoices table with status <strong>draft</strong>.</li>
				<li>Advances the template's <em>next issue date</em> by one cycle (next month / next week / next quarter / next year).</li>
			</ol>
			<HelpCallout variant="info" title="Generated invoices are always drafts">
				They are <strong>not</strong> auto-issued. The user (you) still has to open each one on <NuxtLink to="/invoices" class="text-(--ui-primary) hover:underline">
					Invoices
				</NuxtLink> and click <em>Mark sent</em>. That's the safety net for one-off edits — a rate change, a special discount, an off-month adjustment — before the invoice goes to the client.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Pause vs delete" icon="i-lucide-pause">
			<p>Two ways to stop a template from generating:</p>
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Pause</strong> — flips the template to inactive. It stays in your list, keeps its line items and schedule, but doesn't show up in the pending count. Use this for a temporary stop: client paused the retainer for a quarter, you'll resume in January, etc. Click <strong>Resume</strong> when you're ready to start generating again.
				</li>
				<li>
					<strong>Delete</strong> — removes the template permanently. Already-generated invoices are <strong>untouched</strong> (they're real rows in the invoices table, independent of the template). Use this when the arrangement is over for good.
				</li>
			</ul>
		</HelpSection>

		<HelpSection title="Sri Lankan tax angle" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="VAT inherits from the template">
				Each generated invoice picks up the VAT rate from the template. If the rate is wrong on the template, every future generation is wrong too — open the template detail page and fix the <strong>VAT rate (%)</strong> field. Already-generated invoices that are still drafts can be edited individually; once issued, you'd need a credit note to correct them.
			</HelpCallout>
			<p>
				The IRD treats generated invoices exactly like any other invoice — they appear on your <NuxtLink to="/reports/vat" class="text-(--ui-primary) hover:underline">
					VAT report
				</NuxtLink>, count toward your monthly output VAT, and follow the same gapless-numbering rules. There's nothing special about "recurring" from the tax authority's perspective; it's just an internal convenience.
			</p>
			<p>
				Number gapless-ness still matters — if you generate three invoices then realise one was a mistake and delete it, the sequence will have a gap. The fix is the same as for any deleted invoice: re-create one with the gap's number using the editable Number field on the New Invoice modal.
			</p>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Editing the template doesn't fix already-generated invoices">
				Changing the unit price on the template only affects <em>future</em> generations. Invoices you've already generated are independent — to update one, edit it directly on the invoices list (drafts only — once issued, it's locked).
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't generate every pending template blindly">
				The <strong>Generate pending</strong> modal pre-selects every template that's due. If a client is on holiday this month, on a payment hold, or in a renegotiation — untick them before confirming. Generated drafts can be deleted, but it's tidier to skip the generation entirely than to clean up afterwards.
			</HelpCallout>
			<HelpCallout variant="warning" title="Generated invoices are DRAFTS — you still have to send them">
				After bulk-generating, head to <NuxtLink to="/invoices" class="text-(--ui-primary) hover:underline">
					Invoices
				</NuxtLink>, filter to <em>Draft</em>, and click each one to review and mark sent. They don't go out to clients automatically — Sakoram doesn't email.
			</HelpCallout>
			<HelpCallout variant="warning" title="Bank changes don't backfill">
				If you change the bank picker on the template, only future generations use the new bank. Already-generated invoices keep their original bank snapshot frozen at generation time. That's by design — historical invoices shouldn't silently change.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Recurring invoices help topic. Walks through what a template is,
// when to use one, the manual generation flow, pause vs delete,
// and the gotchas (VAT inheritance, draft generation, no auto-issue).
</script>
