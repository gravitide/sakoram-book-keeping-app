// Help-topic TOC (table of contents) — the inject contract that
// links HelpSection (the source of section metadata) to HelpTopicNav
// (the sidebar that renders the TOC).
//
// Flow:
//   /help/[slug].vue provides the context
//     ↓
//   HelpTopicView renders the topic component
//     ↓
//   each HelpSection inside the topic injects the context
//     ↓
//   on mount each section registers { id, title, icon, order }
//     ↓
//   HelpTopicNav reads the reactive entries array and paints the TOC
//
// The modal surface deliberately does NOT provide this context, so
// HelpSection's `inject(HelpTocKey, null)` returns null there and the
// registration is skipped. Modal is the quick-reference shape; TOC
// only makes sense in the wider /help/[slug] page where reading
// long-form is the actual use case.

import type { InjectionKey, Ref } from "vue";

export interface TocEntry {
	id: string
	title: string
	icon?: string
	/// Document order — auto-assigned in registration order so the
	/// TOC can sort reliably even if components register out of
	/// mount order (rare, but happens with async children).
	order: number
}

export interface HelpTocContext {
	entries: Ref<TocEntry[]>
	register: (entry: Omit<TocEntry, "order">) => void
	unregister: (id: string) => void
	/// Id of the section currently in view. HelpTopicNav writes to
	/// this from an IntersectionObserver and HelpSection callers can
	/// ignore it — purely an output for the nav to read.
	activeId: Ref<string | null>
	setActiveId: (id: string | null) => void
}

export const HelpTocKey: InjectionKey<HelpTocContext> = Symbol("HelpToc");

// Slugify a section title → a stable URL-safe id. Used when a
// HelpSection caller doesn't pass an explicit `id` prop. Keeps
// alphanumerics + dashes; strips everything else. Matches the
// behaviour every other docs site uses.
export const slugifyTitle = (s: string): string =>
	s
		.toLowerCase()
		.normalize("NFKD")
		// Strip combining marks (any Unicode "Mark" category char). After
		// NFKD this catches the diacritical-accent residue without using
		// an opaque char-code range.
		.replace(/\p{M}/gu, "")
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
