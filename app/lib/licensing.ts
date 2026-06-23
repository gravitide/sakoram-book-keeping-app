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
	pdf_templates: Tier.Plus,
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
	// A valid license supersedes the trial entirely: a paying customer is no
	// longer "on trial". Their tier is exactly what they bought (even if that's
	// below the Premium trial — they chose that plan), and the trial banner
	// goes away. Only when there's NO license do we grant the Premium trial.
	if (licenseTier !== null) {
		return {
			tier: licenseTier,
			isTrial: false,
			trialDaysLeft: 0,
			businessLimit: BUSINESS_LIMITS[licenseTier]
		};
	}
	const trialLeft = trial.trialStart
		? trialDaysRemaining(trial.trialStart, nowIso, trial.lastSeen)
		: 0;
	const onTrial = trialLeft > 0;
	const tier = onTrial ? Tier.Premium : Tier.Basic;
	return {
		tier,
		isTrial: onTrial,
		trialDaysLeft: trialLeft,
		businessLimit: BUSINESS_LIMITS[tier]
	};
}
