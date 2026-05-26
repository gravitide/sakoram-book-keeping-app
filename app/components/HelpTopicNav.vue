<template>
	<!-- Sticky left-rail TOC. sticky-top sets where the nav locks
		under the page header as the content scrolls. The aside is
		hidden below lg — TOC only makes sense when there's room to
		spare horizontally. On narrower screens the topic still reads
		fine as one column. -->
	<aside class="hidden lg:block">
		<div class="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-2">
			<div class="text-xs uppercase tracking-wide text-(--ui-text-muted) font-medium mb-2 px-2">
				On this page
			</div>
			<nav v-if="entries.length > 0" class="space-y-0.5">
				<a
					v-for="e in entries"
					:key="e.id"
					:href="`#${e.id}`"
					class="flex items-start gap-2 px-2 py-1.5 rounded-md text-sm leading-snug transition cursor-pointer"
					:class="activeId === e.id
						? 'bg-(--ui-primary)/10 text-(--ui-primary) font-medium'
						: 'text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)'"
					@click.prevent="scrollTo(e.id)"
				>
					<UIcon
						v-if="e.icon"
						:name="e.icon"
						class="size-3.5 shrink-0 mt-0.5"
						:class="activeId === e.id ? 'text-(--ui-primary)' : 'text-(--ui-text-muted)/70'"
					/>
					<!-- Wrap long section titles instead of truncating with an
					ellipsis. This is help docs prose — the user reading
					the TOC wants to know what a link points at, not see
					"How to create one in Sako…". `break-words` lets the
					title flow onto a second line; `min-w-0` on the span
					is what actually lets it shrink inside the flex row. -->
					<span class="min-w-0 break-words">{{ e.title }}</span>
				</a>
			</nav>
			<div v-else class="text-xs text-(--ui-text-muted) px-2 py-1">
				Loading sections…
			</div>
		</div>
	</aside>
</template>

<script setup lang="ts">
// Left-rail "On this page" TOC for the /help/[slug] reader.
//
// Reads the reactive `entries` array provided by the page (each
// HelpSection registers itself there) and paints anchor links. An
// IntersectionObserver watches the registered sections and writes
// the active id back through the context so the link of the
// currently-scrolled section highlights.
//
// Only renders at lg+ — TOC needs horizontal room. The /help/[slug]
// page does its own grid swap (1 col below lg, [220px 1fr] at lg+).

	import type { TocEntry } from "~/help/toc";
	import { HelpTocKey } from "~/help/toc";

	const toc = inject(HelpTocKey, null);
	const entries = computed<TocEntry[]>(() =>
		toc?.entries.value ?? []
	);
	const activeId = computed<string | null>(() => toc?.activeId.value ?? null);

	// Click-to-scroll. Native anchor jumps would also work but we
	// suppress them via @click.prevent so we can:
	//   1. Smooth-scroll (anchor jumps snap)
	//   2. Mirror the picked id into activeId immediately for snappy
	//      visual feedback, instead of waiting for the observer.
	function scrollTo(id: string) {
		const el = document.getElementById(id);
		if (!el) return;
		el.scrollIntoView({ behavior: "smooth", block: "start" });
		toc?.setActiveId(id);
	}

	// IntersectionObserver: watches every registered section. As the
	// user scrolls, whichever section's header is closest to the top
	// of the viewport (~20% down) becomes active. Re-instantiates
	// whenever the entries list changes (sections register
	// asynchronously after the topic component lazy-loads).
	let observer: IntersectionObserver | null = null;
	const teardown = () => {
		observer?.disconnect();
		observer = null;
	};

	const wireObserver = () => {
		teardown();
		if (typeof window === "undefined") return;
		if (entries.value.length === 0) return;
		// `rootMargin: '-10% 0% -80% 0%'` makes the active band the top
		// ~10% of the viewport — close enough to the eye that scrolling
		// a section into reading position activates it.
		observer = new IntersectionObserver(
			(records) => {
				// Pick the topmost intersecting section as active.
				const visible = records
					.filter((r) => r.isIntersecting)
					.map((r) => r.target.id)
					.filter((id): id is string => Boolean(id));
				if (visible.length > 0) {
					// Resolve to the entry that appears first in `entries`
					// so document order wins on ties.
					const first = entries.value.find((e) => visible.includes(e.id));
					if (first) toc?.setActiveId(first.id);
				}
			},
			{ rootMargin: "-10% 0% -80% 0%", threshold: 0 }
		);
		for (const e of entries.value) {
			const el = document.getElementById(e.id);
			if (el) observer.observe(el);
		}
	};

	// Re-wire whenever the registered entries change (e.g. async
	// section registration after the topic component lazy-loads).
	watch(entries, () => {
		// nextTick: wait for DOM to commit any new sections so
		// getElementById finds them before we observe.
		nextTick(wireObserver);
	}, { immediate: true });

	onBeforeUnmount(teardown);
</script>
