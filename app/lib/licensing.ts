// Feature-tier registry + pure entitlement helpers. Single source of truth for
// which features belong to which tier (see the design spec section 2). Pure and
// unit-tested; the Pinia store and gating surfaces consume these.

export enum Tier { Basic = 0, Plus = 1, Premium = 2 }

// Every gated feature key -> the minimum tier that includes it. A key absent
// here is treated as Basic (available to all) — we never want a typo to lock a
// core feature.
export const FEATURES: Record<string, Tier> = {
	// Plus
	recurring: Tier.Plus,
	credit_notes: Tier.Plus,
	statements: Tier.Plus,
	reconcile: Tier.Plus,
	"reports.aged_receivables": Tier.Plus,
	"reports.aged_payables": Tier.Plus,
	"reports.cash_flow": Tier.Plus,
	"reports.sales_by_client": Tier.Plus,
	"reports.expenses_by_vendor": Tier.Plus,
	pdf_protection: Tier.Plus,
	encryption: Tier.Plus,
	// Premium
	payroll: Tier.Premium,
	// Explicitly-Basic keys (documented; same as omitting them)
	invoices: Tier.Basic,
	"reports.profit_loss": Tier.Basic,
	"reports.vat": Tier.Basic
};

export const BUSINESS_LIMITS: Record<Tier, number> = {
	[Tier.Basic]: 2,
	[Tier.Plus]: Number.POSITIVE_INFINITY,
	[Tier.Premium]: Number.POSITIVE_INFINITY
};

export function hasFeature(tier: Tier, key: string): boolean {
	const required = FEATURES[key] ?? Tier.Basic;
	return tier >= required;
}
