<template>
	<div class="select-none">
		<FeatureLock
			v-if="locked"
			title="Payroll"
			tier-label="Premium"
			feature="payroll"
		/>
		<header class="mb-6">
			<h1 class="text-2xl font-semibold">
				Payroll
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1">
				Everything for paying your team — overview, employee
				records, payslips, and cycle settings.
			</p>
		</header>

		<!-- One card per Payroll surface. Same shape as the Reports
			landing for consistency. Order roughly reflects how a payroll
			run flows: Dashboard for the overview, Employees to set up
			who's on payroll, Payslips to actually run + pay them,
			Settings to configure the cycle template. -->
		<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
			<NuxtLink
				v-for="r in sections"
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
		</div>
	</div>
</template>

<script setup lang="ts">
	import { useLicenseStore } from "~/stores/license";

	definePageMeta({ title: "Payroll" });

	const license = useLicenseStore();
	const locked = computed(() => !license.hasFeature("payroll"));

	interface PayrollTile {
		to: string
		label: string
		icon: string
		description: string
	}

	const sections: PayrollTile[] = [
		{
			to: "/payroll/dashboard",
			label: "Dashboard",
			icon: "i-lucide-layout-dashboard",
			description: "Upcoming cycle, KPIs, recent runs, and what's still outstanding."
		},
		{
			to: "/employees",
			label: "Employees",
			icon: "i-lucide-users-round",
			description: "Your payroll address book — identity, contact, salary, and bank details per employee."
		},
		{
			to: "/payslips",
			label: "Payslips",
			icon: "i-lucide-file-spreadsheet",
			description: "Per-employee, per-period pay records. Create, issue, and record payment."
		},
		{
			to: "/payslips/bulk",
			label: "Bulk run",
			icon: "i-lucide-list-checks",
			description: "Generate this month's payslips for every active employee in one go — auto-issue and auto-pay optional."
		},
		{
			to: "/settings/payroll",
			label: "Settings",
			icon: "i-lucide-calendar-clock",
			description: "Cycle template — period start / end / pay day. Drives 'next cycle' on the dashboard and the bulk run."
		}
	];
</script>
