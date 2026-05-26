<template>
	<!-- pb-12 so the last category's card row doesn't hug the bottom
		of the scroll viewport. Same rationale as the topic reader —
		layout's pb-2 is tight by design. -->
	<div class="select-none pb-12">
		<header class="mb-6">
			<h1 class="text-2xl font-semibold">
				Help &amp; guides
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1 max-w-3xl">
				Plain-English explanations of what each Sakoram concept means in the real business world, when you'd use it, and how to drive the app to do it. Tuned for Sri Lankan businesses — examples are in LKR, fiscal year is April–March, tax notes reference the IRD where relevant.
			</p>
		</header>

		<!-- "Start here" hero — the bookkeeping-basics topic gets
			full-width treatment with a primary-tinted background so
			new users have an obvious entry point. We exclude this
			slug from the categorized grid below to avoid showing it
			twice. -->
		<NuxtLink
			v-if="basics"
			:to="`/help/${basics.slug}`"
			class="block group mb-8"
		>
			<UCard class="transition group-hover:border-(--ui-primary) bg-(--ui-primary)/8 border-(--ui-primary)/30">
				<div class="flex items-start gap-4">
					<div class="size-12 shrink-0 rounded-lg bg-(--ui-primary)/20 flex items-center justify-center">
						<UIcon :name="basics.icon" class="size-6 text-(--ui-primary)" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2 mb-0.5">
							<span class="text-xs uppercase tracking-wide text-(--ui-primary) font-medium">
								Start here
							</span>
							<UIcon name="i-lucide-arrow-right" class="size-3.5 text-(--ui-primary)/70" />
						</div>
						<div class="font-medium text-base">
							{{ basics.title }}
						</div>
						<p class="text-sm text-(--ui-text-muted) mt-1">
							{{ basics.summary }}
						</p>
					</div>
				</div>
			</UCard>
		</NuxtLink>

		<!-- Topics grouped by category, with the basics slug filtered
			out (it's in the hero above). Same card shape as the
			/reports + /payroll + /lists landing pages so the help
			library feels like a first-class part of the app. -->
		<div v-if="grouped.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
			<UIcon name="i-lucide-book-open" class="size-10 mx-auto mb-2 opacity-50" />
			No help topics published yet.
		</div>

		<div v-for="group in grouped" :key="group.category" class="mb-8">
			<div class="flex items-center gap-2 mb-3 text-xs uppercase tracking-wide text-(--ui-text-muted)">
				<UIcon :name="group.icon" class="size-3.5" />
				{{ group.label }}
			</div>
			<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
				<NuxtLink
					v-for="t in group.topics"
					:key="t.slug"
					:to="`/help/${t.slug}`"
					class="block group h-full"
				>
					<UCard class="h-full transition group-hover:border-(--ui-primary)">
						<div class="flex items-start gap-3">
							<div class="size-10 shrink-0 rounded-md bg-(--ui-primary)/15 flex items-center justify-center">
								<UIcon :name="t.icon" class="size-5 text-(--ui-primary)" />
							</div>
							<div class="min-w-0 flex-1">
								<div class="font-medium">
									{{ t.title }}
								</div>
								<p class="text-xs text-(--ui-text-muted) mt-0.5">
									{{ t.summary }}
								</p>
							</div>
						</div>
					</UCard>
				</NuxtLink>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
	import { groupedByCategory, HELP_TOPICS_BY_SLUG } from "~/help";

	definePageMeta({ title: "Help" });

	// Bookkeeping-basics gets its own "Start here" hero card above the
	// grid, so we exclude it from the categorized listing to avoid
	// rendering it twice. If the slug isn't registered (e.g. removed
	// later), the hero just doesn't render and the grid falls back to
	// showing every topic — graceful degrade.
	const BASICS_SLUG = "bookkeeping-basics";
	const basics = computed(() => HELP_TOPICS_BY_SLUG[BASICS_SLUG]);

	const grouped = computed(() =>
		groupedByCategory()
			.map((g) => ({
				...g,
				topics: g.topics.filter((t) => t.slug !== BASICS_SLUG)
			}))
			.filter((g) => g.topics.length > 0)
	);
</script>
