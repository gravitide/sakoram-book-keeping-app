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
	// General — the entry-point topic for new users. Linked from every
	// document + report topic's relatedSlugs as the "back to basics"
	// anchor.
	{
		slug: "bookkeeping-basics",
		title: "Bookkeeping basics",
		summary: "New to all this? Start here. The four questions bookkeeping answers, how the documents fit together, and where to begin.",
		category: "general",
		icon: "i-lucide-graduation-cap",
		relatedSlugs: ["invoices", "bills", "vouchers", "profit-loss"],
		component: () => import("./topics/bookkeeping-basics.vue")
	},
	{
		slug: "security",
		title: "Security & encryption",
		summary: "Password-protect a business with at-rest database encryption (+ recovery key), and lock generated PDFs against editing. Two separate protections.",
		category: "general",
		icon: "i-lucide-shield-check",
		relatedSlugs: ["bookkeeping-basics", "backup-google-drive"],
		component: () => import("./topics/security.vue")
	},
	{
		slug: "backup-google-drive",
		title: "Backing up to Google Drive",
		summary: "Keep a copy of your books in your own Google Drive, and restore it on any computer. Manual backups with a reminder — not sync.",
		category: "general",
		icon: "i-lucide-cloud-upload",
		relatedSlugs: ["security", "bookkeeping-basics"],
		component: () => import("./topics/backup-google-drive.vue")
	},
	// Documents
	{
		slug: "invoices",
		title: "Invoices",
		summary: "Billing a client for work done or goods delivered. The status lifecycle, recording payment, SL VAT obligations.",
		category: "documents",
		icon: "i-lucide-receipt",
		relatedSlugs: ["quotes", "recurring-invoices", "credit-notes", "customer-statements", "vouchers", "vat", "sales-by-client"],
		component: () => import("./topics/invoices.vue")
	},
	{
		slug: "recurring-invoices",
		title: "Recurring invoices",
		summary: "Templates that generate the same invoice on a schedule — monthly retainers, subscriptions, rent. User-initiated generation, no surprises.",
		category: "documents",
		icon: "i-lucide-repeat",
		relatedSlugs: ["invoices", "vouchers", "vat"],
		component: () => import("./topics/recurring-invoices.vue")
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
		relatedSlugs: ["invoices", "customer-statements", "vouchers"],
		component: () => import("./topics/credit-notes.vue")
	},
	{
		slug: "bills",
		title: "Bills",
		summary: "Recording money you owe — supplier invoices, expense tracking by category, paying via vouchers.",
		category: "documents",
		icon: "i-lucide-file-input",
		relatedSlugs: ["vouchers", "invoices", "vat", "expenses-by-vendor", "recurring-bills"],
		component: () => import("./topics/bills.vue")
	},
	{
		slug: "recurring-bills",
		title: "Recurring bills",
		summary: "Templates that generate the same vendor bill on a schedule — rent, subscriptions, retainers. User-initiated generation, no surprises.",
		category: "documents",
		icon: "i-lucide-repeat-2",
		relatedSlugs: ["bills", "vouchers", "vat", "expenses-by-vendor", "recurring-invoices"],
		component: () => import("./topics/recurring-bills.vue")
	},
	{
		slug: "vouchers",
		title: "Vouchers",
		summary: "The cash ledger — every record of money actually moving in or out. Receipt vs payment, why it's the source of truth.",
		category: "documents",
		icon: "i-lucide-ticket",
		relatedSlugs: ["invoices", "bills", "payslips", "cash-flow", "reconciliation"],
		component: () => import("./topics/vouchers.vue")
	},
	{
		slug: "customer-statements",
		title: "Customer statements",
		summary: "Printable per-client snapshot of every outstanding invoice — the collections document you send when chasing payment.",
		category: "documents",
		icon: "i-lucide-file-clock",
		relatedSlugs: ["invoices", "aged-receivables", "credit-notes"],
		component: () => import("./topics/customer-statements.vue")
	},
	{
		slug: "reconciliation",
		title: "Bank reconciliation",
		summary: "Import a CSV bank statement, match its rows against existing vouchers, create vouchers from unmatched rows. Audit-ready books in minutes.",
		category: "documents",
		icon: "i-lucide-scale",
		relatedSlugs: ["vouchers", "bills", "invoices"],
		component: () => import("./topics/reconciliation.vue")
	},
	// Payroll
	{
		slug: "payslips",
		title: "Payslips",
		summary: "Per-employee, per-period pay records. Earnings + deductions, bulk monthly runs, EPF / ETF / PAYE context.",
		category: "payroll",
		icon: "i-lucide-file-spreadsheet",
		relatedSlugs: ["statutory-paye", "vouchers", "payroll-register"],
		component: () => import("./topics/payslips.vue")
	},
	{
		slug: "statutory-paye",
		title: "EPF, ETF & PAYE",
		summary: "Sri Lankan statutory payroll, auto-computed: EPF 8/12%, ETF 3%, and the progressive PAYE (APIT) tax table. How to configure and override it.",
		category: "payroll",
		icon: "i-lucide-landmark",
		relatedSlugs: ["payslips", "payroll-register", "vouchers"],
		component: () => import("./topics/statutory-paye.vue")
	},
	// Reports
	{
		slug: "profit-loss",
		title: "Profit & Loss",
		summary: "Income vs expenses for any period (accrual basis). The single most-used report — what it includes, how to read it, why it differs from cash flow.",
		category: "reports",
		icon: "i-lucide-trending-up",
		relatedSlugs: ["cash-flow", "vat", "invoices", "bills"],
		component: () => import("./topics/profit-loss.vue")
	},
	{
		slug: "vat",
		title: "VAT report",
		summary: "Output vs input VAT, net payable to the IRD. How to use it for your monthly VAT return.",
		category: "reports",
		icon: "i-lucide-percent",
		relatedSlugs: ["invoices", "bills", "profit-loss"],
		component: () => import("./topics/vat.vue")
	},
	{
		slug: "aged-receivables",
		title: "Aged receivables",
		summary: "Who owes you money RIGHT NOW, bucketed by how overdue it is. The collections-priority report.",
		category: "reports",
		icon: "i-lucide-clock",
		relatedSlugs: ["invoices", "customer-statements", "aged-payables", "cash-flow"],
		component: () => import("./topics/aged-receivables.vue")
	},
	{
		slug: "aged-payables",
		title: "Aged payables",
		summary: "Who you owe money to RIGHT NOW, bucketed by how overdue it is. The treasury-planning report.",
		category: "reports",
		icon: "i-lucide-clock-alert",
		relatedSlugs: ["bills", "aged-receivables", "cash-flow"],
		component: () => import("./topics/aged-payables.vue")
	},
	{
		slug: "cash-flow",
		title: "Cash flow",
		summary: "Receipts vs payments by month (cash basis). The 'did the bank balance grow?' view, distinct from P&L.",
		category: "reports",
		icon: "i-lucide-arrow-left-right",
		relatedSlugs: ["profit-loss", "vouchers", "aged-receivables"],
		component: () => import("./topics/cash-flow.vue")
	},
	{
		slug: "sales-by-client",
		title: "Sales by client",
		summary: "Per-client revenue breakdown for any period. The concentration-risk + top-customer view.",
		category: "reports",
		icon: "i-lucide-users-round",
		relatedSlugs: ["invoices", "profit-loss", "expenses-by-vendor", "vat"],
		component: () => import("./topics/sales-by-client.vue")
	},
	{
		slug: "expenses-by-vendor",
		title: "Expenses by vendor",
		summary: "Per-vendor spend breakdown for any period. Mirror of sales-by-client for the bills side.",
		category: "reports",
		icon: "i-lucide-store",
		relatedSlugs: ["bills", "profit-loss", "sales-by-client", "vat"],
		component: () => import("./topics/expenses-by-vendor.vue")
	},
	{
		slug: "payroll-register",
		title: "Payroll register",
		summary: "Every payslip in a period, in one table — gross, deductions, net, paid. The accountant hand-off.",
		category: "reports",
		icon: "i-lucide-clipboard-list",
		relatedSlugs: ["payslips", "statutory-paye", "profit-loss", "vouchers"],
		component: () => import("./topics/payroll-register.vue")
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
