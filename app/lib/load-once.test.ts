import { describe, expect, it } from "vitest";
import { createLoadOnce } from "./load-once";

const deferred = () => {
	let resolve!: () => void;
	let reject!: (e: Error) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

describe("createLoadOnce", () => {
	// The bug in settings + business_banks: `if (!loaded && !loading) await load()`.
	// A SECOND caller arriving mid-load saw `loading === true`, skipped the
	// await, and returned immediately with state still null — so
	// payslips.createPayslip read settings?.fiscal_year_start_month ?? 1 and
	// stamped January instead of April.
	it("makes a concurrent caller WAIT for the in-flight load", async () => {
		const gate = deferred();
		let loaded = false;
		let calls = 0;
		const ensureLoaded = createLoadOnce(async () => {
			calls++;
			await gate.promise;
			loaded = true;
		}, () => loaded);

		const first = ensureLoaded();
		let secondSettled = false;
		const second = ensureLoaded().then(() => {
			secondSettled = true;
		});

		await Promise.resolve();
		expect(secondSettled).toBe(false); // must not return while still loading
		gate.resolve();
		await Promise.all([first, second]);

		expect(calls).toBe(1); // shared, not duplicated
		expect(loaded).toBe(true);
	});

	it("skips the load entirely once loaded", async () => {
		let calls = 0;
		const ensureLoaded = createLoadOnce(async () => {
			calls++;
		}, () => true);
		await ensureLoaded();
		expect(calls).toBe(0);
	});

	it("retries after a failed load instead of caching the failure", async () => {
		let attempts = 0;
		let loaded = false;
		const ensureLoaded = createLoadOnce(async () => {
			attempts++;
			if (attempts === 1) throw new Error("db not ready");
			loaded = true;
		}, () => loaded);

		await expect(ensureLoaded()).rejects.toThrow("db not ready");
		await ensureLoaded();
		expect(attempts).toBe(2);
		expect(loaded).toBe(true);
	});
});
