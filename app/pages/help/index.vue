<template>
	<div class="select-none">
		<header class="mb-6">
			<h1 class="text-2xl font-semibold">
				Help &amp; guides
			</h1>
			<p class="text-sm text-(--ui-text-muted) mt-1 max-w-3xl">
				Plain-English explanations of what each Sakoram concept means in the real business world, when you'd use it, and how to drive the app to do it. Tuned for Sri Lankan businesses — examples are in LKR, fiscal year is April–March, tax notes reference the IRD where relevant.
			</p>
		</header>

		<!-- Topics grouped by category. Same card shape as the
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
	import { groupedByCategory } from "~/help";

	definePageMeta({ title: "Help" });

	const grouped = computed(() => groupedByCategory());
</script>
