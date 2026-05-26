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
		slug: "invoices",
		title: "Invoices",
		summary: "Billing a client for work done or goods delivered. The status lifecycle, recording payment, SL VAT obligations.",
		category: "documents",
		icon: "i-lucide-receipt",
		relatedSlugs: ["quotes", "credit-notes", "vouchers"],
		component: () => import("./topics/invoices.vue")
	},
	{
		slug: "quotes",
		title: "Quotes",
		summary: "Sending a price estimate before doing the work. Accept / reject lifecycle, converting accepted quotes into invoices.",
		category: "documents",
		icon: "i-lucide-file-text",
		relatedSlugs: ["invoices"],
		component: () => import("./topics/quotes.vue")
	},
	{
		slug: "credit-notes",
		title: "Credit notes",
		summary: "Issuing a credit to refund an over-invoice, settle a return, or apply a goodwill discount.",
		category: "documents",
		icon: "i-lucide-rotate-ccw",
		relatedSlugs: ["invoices", "vouchers"],
		component: () => import("./topics/credit-notes.vue")
	},
	{
		slug: "bills",
		title: "Bills",
		summary: "Recording money you owe — supplier invoices, expense tracking by category, paying via vouchers.",
		category: "documents",
		icon: "i-lucide-file-input",
		relatedSlugs: ["vouchers", "invoices"],
		component: () => import("./topics/bills.vue")
	},
	{
		slug: "vouchers",
		title: "Vouchers",
		summary: "The cash ledger — every record of money actually moving in or out. Receipt vs payment, why it's the source of truth.",
		category: "documents",
		icon: "i-lucide-ticket",
		relatedSlugs: ["invoices", "bills", "payslips"],
		component: () => import("./topics/vouchers.vue")
	},
	{
		slug: "payslips",
		title: "Payslips",
		summary: "Per-employee, per-period pay records. Earnings + deductions, bulk monthly runs, EPF / ETF / PAYE context.",
		category: "payroll",
		icon: "i-lucide-file-spreadsheet",
		relatedSlugs: ["vouchers"],
		component: () => import("./topics/payslips.vue")
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
