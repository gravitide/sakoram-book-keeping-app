// Pure helpers for reading vue-router query values. A query value is
// `string | null | (string | null)[]` — every page that reads one used to
// hand-roll the Array.isArray / typeof dance. Kept in app/lib so it's
// unit-testable without a router (see useQueryTrigger for the consumer).

export type QueryValue = string | null | undefined | (string | null)[];

/// First non-empty string value, or null.
export const queryString = (raw: QueryValue): string | null => {
	const v = Array.isArray(raw) ? raw[0] : raw;
	return typeof v === "string" && v !== "" ? v : null;
};

/// A query value as a finite integer (row ids), or null.
export const queryInt = (raw: QueryValue): number | null => {
	const s = queryString(raw);
	if (s === null) return null;
	const n = Number(s);
	return Number.isInteger(n) ? n : null;
};

/// A copy of `query` without `keys` — what to `router.replace` with once a
/// one-shot param has been consumed.
export const withoutQueryKeys = <Q extends Record<string, unknown>>(query: Q, keys: string[]): Partial<Q> => {
	const next: Record<string, unknown> = { ...query };
	for (const k of keys) delete next[k];
	return next as Partial<Q>;
};
