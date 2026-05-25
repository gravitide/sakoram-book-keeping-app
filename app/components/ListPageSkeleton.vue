<template>
	<!-- Content-shaped skeleton for every list page (quotes / invoices /
		bills / vouchers / payslips). Mirrors the real layout: filter
		strip with search + chips, action bar with stat chip, table
		header row, body rows. animate-pulse runs on the root so all
		placeholders breathe in sync. Used by `usePageLoading` callers
		via a `v-if="isLoading"` swap above the real card. -->
	<UCard class="animate-pulse">
		<template #header>
			<div class="space-y-3">
				<!-- Row 1: search input + FK picker + advanced popover trigger. -->
				<div class="flex gap-2 items-center flex-wrap">
					<div class="h-9 w-64 rounded-md bg-(--ui-bg-muted)" />
					<div class="h-9 w-40 rounded-md bg-(--ui-bg-muted)" />
					<div class="h-9 w-28 rounded-md bg-(--ui-bg-muted)" />
				</div>
				<!-- Row 2: chip-style multi-select status filters. Count
					driven by `chipCount` so each list can request the
					number of statuses it actually has. -->
				<div class="flex gap-2 flex-wrap">
					<div
						v-for="i in chipCount"
						:key="`chip-skel-${i}`"
						class="h-6 w-20 rounded-full bg-(--ui-bg-muted)"
					/>
				</div>
			</div>
		</template>

		<!-- Table action bar: Auto-fit columns button + filtered-rows
			summary StatChip. -->
		<div class="flex justify-between items-center mb-3">
			<div class="h-7 w-32 rounded-md bg-(--ui-bg-muted)" />
			<div class="h-6 w-48 rounded-md bg-(--ui-bg-muted)" />
		</div>

		<!-- Table header row + body rows. The grid uses `columnCount`
			cells (each list can pass its own column count for a closer
			match). Default 6 covers most list pages without tweaking. -->
		<div
			class="grid gap-3 pb-3 border-b border-(--ui-border)"
			:style="{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }"
		>
			<div
				v-for="i in columnCount"
				:key="`th-skel-${i}`"
				class="h-3 rounded bg-(--ui-bg-muted)"
			/>
		</div>
		<div
			v-for="r in rowCount"
			:key="`tr-skel-${r}`"
			class="grid gap-3 py-3 border-b border-(--ui-border)/40 last:border-0"
			:style="{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }"
		>
			<div
				v-for="c in columnCount"
				:key="`td-skel-${r}-${c}`"
				class="h-3 rounded bg-(--ui-bg-muted)"
				:class="(r + c) % 2 === 0 ? 'opacity-90' : 'opacity-60'"
			/>
		</div>
	</UCard>
</template>

<script setup lang="ts">
	withDefaults(defineProps<{
		/// Number of placeholder status chips in the filter strip row 2.
		/// Each list page has a different count (invoices: 5, vouchers: 2,
		/// etc); pages can pass their own to match.
		chipCount?: number
		/// Number of table columns. Default 6 matches most list pages
		/// without tweaking; pages with wider tables (vouchers: 7) or
		/// narrower (categories: 4) can pass their own.
		columnCount?: number
		/// Number of body rows in the placeholder table. Default 10 gives
		/// the page enough vertical real-estate to read as a table without
		/// pushing the paginator off-screen.
		rowCount?: number
	}>(), {
		chipCount: 4,
		columnCount: 6,
		rowCount: 10
	});
</script>
