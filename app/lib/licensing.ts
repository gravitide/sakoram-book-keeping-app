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

export const TRIAL_DAYS = 30;

export interface TrialState { trialStart: string | null, lastSeen: string | null }
export interface Entitlement {
	tier: Tier
	isTrial: boolean
	trialDaysLeft: number
	businessLimit: number
}

function daysBetween(aIso: string, bIso: string): number {
	const a = Date.parse(`${aIso}T00:00:00Z`);
	const b = Date.parse(`${bIso}T00:00:00Z`);
	return Math.round((b - a) / 86_400_000);
}

// Effective "now" never goes backwards: a rolled-back clock can't buy trial days.
function effectiveNow(nowIso: string, lastSeenIso: string | null): string {
	if (!lastSeenIso) return nowIso;
	return daysBetween(lastSeenIso, nowIso) < 0 ? lastSeenIso : nowIso;
}

export function trialDaysRemaining(trialStart: string, nowIso: string, lastSeenIso: string | null): number {
	const eff = effectiveNow(nowIso, lastSeenIso);
	const elapsed = daysBetween(trialStart, eff);
	return Math.max(0, TRIAL_DAYS - elapsed);
}

// `licenseTier` is the verified tier of an entered key, or null if none/invalid.
export function effectiveEntitlement(
	licenseTier: Tier | null,
	trial: TrialState,
	nowIso: string
): Entitlement {
	const trialLeft = trial.trialStart
		? trialDaysRemaining(trial.trialStart, nowIso, trial.lastSeen)
		: 0;
	const trialTier = trialLeft > 0 ? Tier.Premium : null;
	const candidates = [licenseTier, trialTier].filter((t): t is Tier => t !== null);
	const tier = candidates.length ? Math.max(...candidates) as Tier : Tier.Basic;
	return {
		tier,
		isTrial: trialTier !== null && tier === Tier.Premium && licenseTier !== Tier.Premium,
		trialDaysLeft: trialLeft,
		businessLimit: BUSINESS_LIMITS[tier]
	};
}
