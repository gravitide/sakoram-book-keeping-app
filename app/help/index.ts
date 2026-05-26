// Help-system topic registry.
//
// Each topic is a Vue component under `topics/` that renders the
// structured help content (what / when / how-in-Sakoram / IRD-angle /
// mistakes). The registry below maps a stable slug to:
//
//   - title           — how the topic appears in lists + page H1
//   - summary         — one-liner shown on the /help index cards +
//                       the HelpButton tooltip
//   - category        — coarse grouping for the /help index
//   - icon            — Lucide name used on the index card
//   - relatedSlugs    — other topic slugs surfaced as "see also" at
//                       the bottom of the topic view
//   - component       — lazy import so the bundle doesn't carry every
//                       topic's content into the initial route chunk
//
// Adding a new topic means: drop a .vue under `app/help/topics/`,
// append an entry here, and you're done — the index page +
// per-slug page + HelpButton lookup all pick it up automatically.

import type { Component, DefineComponent } from "vue";

export type HelpCategory = "documents" | "reports" | "payroll" | "lists" | "general";

export interface HelpTopic {
	slug: string
	title: string
	summary: string
	category: HelpCategory
	icon: string
	relatedSlugs?: string[]
	component: () => Promise<{ default: Component | DefineComponent }>
}

export const HELP_TOPICS: HelpTopic[] = [
	{
		slug: "credit-notes",
		title: "Credit notes",
		summary: "Issuing a credit to refund an over-invoice, settle a return, or apply a goodwill discount.",
		category: "documents",
		icon: "i-lucide-rotate-ccw",
		component: () => import("./topics/credit-notes.vue")
	}
];

export const HELP_TOPICS_BY_SLUG: Record<string, HelpTopic> = Object.fromEntries(
	HELP_TOPICS.map((t) => [t.slug, t])
);

export const HELP_CATEGORIES: { key: HelpCategory, label: string, icon: string }[] = [
	{ key: "documents", label: "Documents", icon: "i-lucide-files" },
	{ key: "reports", label: "Reports", icon: "i-lucide-chart-pie" },
	{ key: "payroll", label: "Payroll", icon: "i-lucide-wallet" },
	{ key: "lists", label: "Lists", icon: "i-lucide-library" },
	{ key: "general", label: "General", icon: "i-lucide-book-open" }
];

export const groupedByCategory = (): { category: HelpCategory, label: string, icon: string, topics: HelpTopic[] }[] =>
	HELP_CATEGORIES
		.map((c) => ({
			category: c.key,
			label: c.label,
			icon: c.icon,
			topics: HELP_TOPICS.filter((t) => t.category === c.key)
		}))
		.filter((g) => g.topics.length > 0);
