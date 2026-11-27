import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLatestDebounced } from "./latest-debounced";

// A run whose promise the test settles by hand, in any order.
function manualRuns() {
	const calls: Array<{ input: string, resolve: (v: string) => void, reject: (e: unknown) => void }> = [];
	const run = (input: string) => new Promise<string>((resolve, reject) => {
		calls.push({ input, resolve, reject });
	});
	return { calls, run };
}

describe("createLatestDebounced", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs once, with the last input, after the changes stop for the delay", async () => {
		const { calls, run } = manualRuns();
		const runner = createLatestDebounced({ delayMs: 500, run, onResult: () => {} });
		runner.schedule("a");
		await vi.advanceTimersByTimeAsync(300);
		runner.schedule("b");
		await vi.advanceTimersByTimeAsync(499);
		expect(calls).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(calls.map((c) => c.input)).toEqual(["b"]);
	});

	it("delivers only the newest run's result when an older one finishes later", async () => {
		const { calls, run } = manualRuns();
		const results: string[] = [];
		const runner = createLatestDebounced({ delayMs: 500, run, onResult: (r) => results.push(r) });
		runner.schedule("old");
		await vi.advanceTimersByTimeAsync(500);
		runner.schedule("new");
		await vi.advanceTimersByTimeAsync(500);
		calls[1]!.resolve("NEW");
		calls[0]!.resolve("OLD");
		await vi.runAllTimersAsync();
		expect(results).toEqual(["NEW"]);
	});

	it("reports busy from the first change until the newest run settles", async () => {
		const { calls, run } = manualRuns();
		const busy: boolean[] = [];
		const runner = createLatestDebounced({ delayMs: 500, run, onResult: () => {}, onBusy: (b) => busy.push(b) });
		runner.schedule("a");
		expect(busy).toEqual([true]);
		await vi.advanceTimersByTimeAsync(500);
		runner.schedule("b");
		await vi.advanceTimersByTimeAsync(500);
		calls[0]!.resolve("A");
		await vi.runAllTimersAsync();
		expect(busy.at(-1)).toBe(true);
		calls[1]!.resolve("B");
		await vi.runAllTimersAsync();
		expect(busy.at(-1)).toBe(false);
	});

	it("hands the newest run's failure to onError and drops a stale one", async () => {
		const { calls, run } = manualRuns();
		const errors: unknown[] = [];
		const runner = createLatestDebounced({ delayMs: 10, run, onResult: () => {}, onError: (e) => errors.push(e) });
		runner.schedule("a");
		await vi.advanceTimersByTimeAsync(10);
		runner.schedule("b");
		await vi.advanceTimersByTimeAsync(10);
		calls[0]!.reject(new Error("stale"));
		calls[1]!.reject(new Error("fresh"));
		await vi.runAllTimersAsync();
		expect(errors).toEqual([new Error("fresh")]);
	});

	it("cancel drops the pending run and any result still in flight", async () => {
		const { calls, run } = manualRuns();
		const results: string[] = [];
		const busy: boolean[] = [];
		const runner = createLatestDebounced({ delayMs: 10, run, onResult: (r) => results.push(r), onBusy: (b) => busy.push(b) });
		runner.schedule("a");
		await vi.advanceTimersByTimeAsync(10);
		runner.schedule("b");
		runner.cancel();
		await vi.runAllTimersAsync();
		calls[0]!.resolve("A");
		await vi.runAllTimersAsync();
		expect(calls).toHaveLength(1);
		expect(results).toEqual([]);
		expect(busy.at(-1)).toBe(false);
	});

	it("runNow skips the delay", async () => {
		const { calls, run } = manualRuns();
		const runner = createLatestDebounced({ delayMs: 500, run, onResult: () => {} });
		runner.runNow("x");
		await vi.advanceTimersByTimeAsync(0);
		expect(calls.map((c) => c.input)).toEqual(["x"]);
	});
});
