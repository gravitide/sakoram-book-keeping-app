<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What is bank reconciliation?" icon="i-lucide-info">
			<p>
				<strong>Bank reconciliation</strong> is the practice of comparing your bank statement against your accounting records and matching every transaction. The goal: every line on the bank statement has a corresponding voucher in your books, and every voucher in your books shows up on the bank statement.
			</p>
			<p>
				Two reasons it matters: (1) it catches transactions you forgot to enter, and (2) it catches transactions the bank charged you that you didn't authorise (fraud, double-debits, wrong fees). If the IRD audits you, they may ask to see that your books reconcile to the bank statements.
			</p>
		</HelpSection>

		<HelpSection title="How to use it in Sakoram" icon="i-lucide-circle-play">
			<ol class="list-decimal pl-5 space-y-1.5">
				<li>
					Go to <NuxtLink to="/reconcile" class="text-(--ui-primary) hover:underline">
						Reconcile
					</NuxtLink> in the sidebar.
				</li>
				<li>
					Pick the bank account whose statement you're importing.
				</li>
				<li>
					Click <strong>Import statement</strong>. Pick the CSV file your bank exported.
				</li>
				<li>
					Map each CSV column to its meaning (Date / Description / Amount / Debit / Credit / Reference). Sakoram remembers your mapping per bank for next time.
				</li>
				<li>
					Pick the date format used in your CSV (most SL banks use <span class="font-mono text-xs">DD/MM/YYYY</span> or <span class="font-mono text-xs">DD-MMM-YYYY</span>).
				</li>
				<li>
					Click <strong>Import</strong>. Sakoram auto-suggests matches: any statement row whose amount + type matches an existing voucher within ±3 days gets a Suggested badge.
				</li>
				<li>
					For suggested rows: click <strong>Accept</strong> per row, or <strong>Accept all suggestions</strong> at the top.
				</li>
				<li>
					For unmatched rows: <strong>Find</strong> to manually pick a voucher, or <strong>Create</strong> to make a new voucher from the statement row (the form is pre-filled — just confirm).
				</li>
			</ol>
		</HelpSection>

		<HelpSection title="Common mistakes" icon="i-lucide-triangle-alert">
			<HelpCallout variant="warning" title="Wrong column mapping = wrong amounts">
				If you map the Description column as Amount by mistake, the import will silently fail to parse every row. Always check the preview row counts before confirming — it should show your statement's actual row count.
			</HelpCallout>
			<HelpCallout variant="warning" title="Cash vouchers don't reconcile">
				Vouchers with payment method = Cash don't have a bank account assigned (they're cash transactions). They're excluded from matching entirely. If you see a cash voucher in your books that should be on the bank statement, change its payment method to Bank transfer.
			</HelpCallout>
			<HelpCallout variant="warning" title="Don't delete the bank account with reconciliation history">
				Once you've imported statements for a bank account, you can't delete the bank — Sakoram will refuse. You'd need to delete the imports first. This is on purpose: deleting the bank would orphan all the reconciliation history.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Sri Lankan tax angle" icon="i-lucide-landmark">
			<HelpCallout variant="tax" title="Reconciled books = audit-ready books">
				The IRD doesn't audit casually, but when they do, the question is always the same: <em>can you prove the numbers in your VAT return came from real transactions?</em> A reconciled set of books — every voucher tied to a statement row — answers that in seconds. An unreconciled set of books takes weeks to defend.
			</HelpCallout>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
// Bank reconciliation help topic.
</script>
