<template>
	<div class="select-none">
		<header class="mb-6">
			<h1 class="text-2xl font-semibold">
				Reports
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				Aggregated views of your books over a date range. All data
				comes from documents already in your tenant — nothing here
				edits the underlying records.
			</p>
		</header>

		<!-- One card per available report. Today only P&L ships;
			additional reports (VAT, aged receivables / payables, cash
			flow, sales / expenses by party, payroll register) land here
			one at a time as separate PRs. -->
		<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
			<NuxtLink
				v-for="r in reports"
				:key="r.to"
				:to="r.to"
				class="block group h-full"
			>
				<UCard class="h-full transition group-hover:border-(--ui-primary)">
					<div class="flex items-start gap-3">
						<div class="size-10 shrink-0 rounded-md bg-(--ui-primary)/15 flex items-center justify-center">
							<UIcon :name="r.icon" class="size-5 text-(--ui-primary)" />
						</div>
						<div class="min-w-0 flex-1">
							<div class="font-medium">
								{{ r.label }}
							</div>
							<p class="text-xs text-(--ui-text-muted) mt-0.5">
								{{ r.description }}
							</p>
						</div>
					</div>
				</UCard>
			</NuxtLink>

			<!-- Coming soon tiles — disabled and tinted, so users know
				what's on the roadmap without us having to write a doc. -->
			<UCard
				v-for="r in upcomingReports"
				:key="r.label"
				class="h-full opacity-60"
			>
				<div class="flex items-start gap-3">
					<div class="size-10 shrink-0 rounded-md bg-(--ui-bg-muted) flex items-center justify-center">
						<UIcon :name="r.icon" class="size-5 text-(--ui-text-muted)" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="font-medium flex items-center gap-2">
							{{ r.label }}
							<UBadge color="neutral" variant="subtle" size="sm">
								Coming
							</UBadge>
						</div>
						<p class="text-xs text-(--ui-text-muted) mt-0.5">
							{{ r.description }}
						</p>
					</div>
				</div>
			</UCard>
		</div>
	</div>
</template>

<script setup lang="ts">
	definePageMeta({ title: "Reports" });

	interface ReportTile {
		to: string
		label: string
		icon: string
		description: string
	}

	const reports: ReportTile[] = [
		{
			to: "/reports/profit-loss",
			label: "Profit & Loss",
			icon: "i-lucide-trending-up",
			description: "Income from issued invoices vs expenses from bills and payroll over a date range."
		},
		{
			to: "/reports/vat",
			label: "VAT report",
			icon: "i-lucide-percent",
			description: "Output VAT collected on issued invoices vs Input VAT paid on bills, net payable for the period."
		},
		{
			to: "/reports/aged-receivables",
			label: "Aged receivables",
			icon: "i-lucide-clock",
			description: "Outstanding invoices bucketed by days past due, per-client breakdown."
		}
	];

	// Roadmap surface. These match the Tier 1 reports listed in CLAUDE.md.
	// Keeping them visible (not hidden behind a doc) signals to the user
	// that the section is still being built out.
	const upcomingReports: { label: string, icon: string, description: string }[] = [
		{
			label: "Aged payables",
			icon: "i-lucide-clock-alert",
			description: "Outstanding bills bucketed by days past due, per-vendor breakdown."
		},
		{
			label: "Cash flow",
			icon: "i-lucide-arrow-left-right",
			description: "Receipts minus payments by month for any date range."
		},
		{
			label: "Sales by client",
			icon: "i-lucide-users",
			description: "Revenue per client with drill-down to underlying invoices."
		},
		{
			label: "Payroll register",
			icon: "i-lucide-users-round",
			description: "Every payslip in a period with earnings / deductions / net / paid columns."
		}
	];
</script>
