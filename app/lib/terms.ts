// Bump this date whenever the Terms copy materially changes — the acceptance
// gate re-shows for everyone whose stored version no longer matches.
export const TERMS_VERSION = "2026-07-07";

export function hasAcceptedTerms(storedVersion: string | null): boolean {
	return storedVersion === TERMS_VERSION;
}
