<template>
	<div v-if="topic" class="select-text">
		<!-- Top toolbar — back link on the left, no right cluster.
			Help pages are read-only content.

			pb-3 + border-b gives the toolbar visual presence — without
			the line it bleeds straight into the content below since
			the right side of the row is empty (vs detail pages which
			have an action cluster filling the right and don't need
			the rule). Same treatment will work on any future
			toolbar-with-just-a-back-link page. -->
		<div class="mb-6 pb-3 border-b border-(--ui-border) flex items-center justify-between gap-4">
			<!-- Preserves `?popout=1` when in popout mode so this back
				link doesn't accidentally drop us out of the help-window
				layout. See useHelpLink for the full rationale. -->
			<NuxtLink :to="helpLink.linkTo()" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				All help topics
			</NuxtLink>
			<!-- Pop-out to a separate Tauri WebviewWindow. Hidden
				when already inside the popout (popout=1 query) — no
				point offering "pop out" from a popped-out window. -->
			<UButton
				v-if="isTauri && topic && !isPopoutMode"
				size="sm"
				color="neutral"
				variant="outline"
				icon="i-lucide-picture-in-picture"
				title="Open this guide in a separate window"
				@click="popOut"
			>
				Pop out
			</UButton>
		</div>

		<!-- Docs-style two-column layout: nav on the left, content on
			the right. lg:grid-cols-[220px_1fr] is the standard docs
			width split — narrow enough that long topic titles read
			cleanly but wide enough to fit "What is a credit note?"
			without truncation. Below lg the nav hides and content
			takes the full width (HelpTopicNav's `hidden lg:block`
			handles this). The gap-8 gives the columns breathing room
			without crushing either.

			No `items-start` here on purpose — both grid items need to
			stretch to the row height so the nav's inner `position:
			sticky` div has a tall enough containing block to actually
			stick within. With `items-start` the aside was shrinking
			to its content height, leaving zero slide room and making
			the nav scroll away with the content.

			pb-16 on the grid wrapper so the topic's last line doesn't
			sit flush against the bottom of the scroll viewport — the
			layout's pb-2 is tuned to align with the sidebar floor and
			deliberately tight, so any long-form reading surface needs
			to add its own breathing room. -->
		<div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 pb-16">
			<HelpTopicNav />
			<!-- max-w-3xl: long-form prose reads better at ~65-75ch.
				Wider lines tax the eye on a desktop monitor. -->
			<article class="max-w-3xl min-w-0">
				<HelpTopicView :topic="topic" />
			</article>
		</div>
	</div>
	<div v-else class="select-none py-12 text-center text-sm text-(--ui-text-muted)">
		<UIcon name="i-lucide-circle-help" class="size-10 mx-auto mb-2 opacity-50" />
		<div class="font-medium mb-1">
			Help topic not found
		</div>
		<div class="mb-4">
			"{{ slug }}" isn't a registered topic.
		</div>
		<NuxtLink to="/help" class="text-(--ui-primary) hover:underline text-sm">
			Browse all topics
		</NuxtLink>
	</div>
</template>

<script setup lang="ts">
// Per-topic full-page reading view. Same content as the HelpModal
// shows but in a wider, two-column reading surface with a TOC nav
// on the left — the shape for "study carefully," vs the modal's
// "quick glance."
//
// Provides the HelpToc context that HelpSection components inside
// the topic body register themselves into. HelpTopicNav reads the
// resulting reactive array to paint the left rail. The modal
// surface does NOT provide this context, so sections rendered
// there just no-op the registration step.
//
// select-text on the root so the user can copy snippets out of the
// help (vs most app surfaces which set select-none — reference
// docs that you can't copy from are annoying).

	import type { TocEntry } from "~/help/toc";
	import { useHelpLink } from "~/composables/useHelpLink";
	import { useHelpWindow } from "~/composables/useHelpWindow";
	import { HELP_TOPICS_BY_SLUG } from "~/help";
	import { HelpTocKey } from "~/help/toc";

	const route = useRoute();
	const slug = computed(() => String(route.params.slug ?? ""));

	const topic = computed(() => HELP_TOPICS_BY_SLUG[slug.value]);

	definePageMeta({ title: "Help" });

	// When loaded inside the popout WebviewWindow (URL carries
	// `?popout=1`), switch to the help-window layout — strips the
	// main app sidebar / tenant switcher so the popout reads as a
	// proper docs window. In-app navigation (sidebar Help link, See-
	// also tiles in the main window) hits this same page without the
	// query and gets the default layout.
	if (route.query.popout === "1") {
		setPageLayout("help-window");
	}

	watchEffect(() => {
		if (topic.value) {
			useHead({ title: `Help — ${topic.value.title}` });
		}
	});

	// ---- TOC provide / context wiring ----
	//
	// Sections register themselves via inject; we keep them in
	// document order using a monotonic `nextOrder` counter, and
	// re-sort on every register so the nav paints in mount order.
	// `activeId` is written by HelpTopicNav from its
	// IntersectionObserver and read back here only so it's reactive
	// to other consumers (none today, but the contract is symmetric).

	const entries = ref<TocEntry[]>([]);
	const activeId = ref<string | null>(null);
	let nextOrder = 0;

	provide(HelpTocKey, {
		entries,
		activeId,
		register: (entry) => {
			// Idempotent — protects against double-registration if a
			// HelpSection ever gets re-mounted (e.g. <Suspense> retry).
			if (entries.value.some((e) => e.id === entry.id)) return;
			entries.value = [...entries.value, { ...entry, order: nextOrder++ }]
				.sort((a, b) => a.order - b.order);
		},
		unregister: (id) => {
			entries.value = entries.value.filter((e) => e.id !== id);
		},
		setActiveId: (id) => {
			activeId.value = id;
		}
	});

	// Reset the entries array when the topic slug changes — otherwise
	// the previous topic's sections linger as stale TOC entries while
	// the new topic's mount their replacements.
	watch(slug, () => {
		entries.value = [];
		activeId.value = null;
		nextOrder = 0;
	});

	// ---- Pop-out to a separate Tauri WebviewWindow ----
	// Same composable the HelpModal uses; renders a button on the
	// page's top toolbar when the Tauri runtime is available so
	// users who arrived via in-app nav can still escalate to a
	// floating window if they want one. Hidden when we're ALREADY
	// in a popped-out window — popping out from a popout is silly.
	const { openHelpWindow, isTauri } = useHelpWindow();
	const helpLink = useHelpLink();
	const isPopoutMode = helpLink.isPopoutMode;
	const popOut = async () => {
		if (!topic.value) return;
		await openHelpWindow({ slug: topic.value.slug });
	};
</script>
