// Tests for the pure parts of the R2 release-manifest builder. The AWS calls
// and stdin/stdout glue live in the CLI entry point and the workflow, which
// are verified by a real dispatch run instead.

import { describe, expect, it } from "vitest";
import { normalizeVersion, pickArtifact } from "../scripts/release-manifest.mjs";

// Shaped like a real `aws s3api list-objects-v2 --output json` Contents array.
// CI uploads BOTH an .msi and an NSIS -setup.exe for Windows.
const WINDOWS_LISTING = [
	{
		Key: "sakoram/0.113.2/Sakoram_0.113.2_x64_en-US.msi",
		Size: 61000000,
		LastModified: "2026-06-07T17:36:52+00:00"
	},
	{
		Key: "sakoram/0.113.2/Sakoram_0.113.2_x64-setup.exe",
		Size: 64821760,
		LastModified: "2026-06-07T17:36:58+00:00"
	}
];

describe("normalizeVersion", () => {
	it("strips a leading v", () => {
		expect(normalizeVersion("v0.113.2")).toBe("0.113.2");
		expect(normalizeVersion("V0.113.2")).toBe("0.113.2");
	});

	it("passes a bare version through, trimming whitespace", () => {
		expect(normalizeVersion("0.148.1")).toBe("0.148.1");
		expect(normalizeVersion("  0.148.1  ")).toBe("0.148.1");
	});

	it("rejects junk", () => {
		expect(() => normalizeVersion("")).toThrow();
		expect(() => normalizeVersion("latest")).toThrow();
		expect(() => normalizeVersion("0.1")).toThrow();
	});
});

describe("pickArtifact", () => {
	it("prefers the NSIS setup.exe over the msi for windows", () => {
		const artifact = pickArtifact(WINDOWS_LISTING, "windows");
		expect(artifact.filename).toBe("Sakoram_0.113.2_x64-setup.exe");
		expect(artifact.size).toBe(64821760);
	});

	it("reports the object's upload date, not today", () => {
		expect(pickArtifact(WINDOWS_LISTING, "windows").released).toBe("2026-06-07");
	});

	it("matches the historical productName filenames too", () => {
		const legacy = [{
			Key: "sakoram/0.78.3/Sakoram.Bookkeeping_0.78.3_aarch64.dmg",
			Size: 58236928,
			LastModified: "2026-05-25T02:59:10+00:00"
		}];
		expect(pickArtifact(legacy, "mac").filename).toBe("Sakoram.Bookkeeping_0.78.3_aarch64.dmg");
	});

	it("picks the newest upload when a version folder was re-uploaded", () => {
		const duplicated = [
			{ Key: "sakoram/1.0.0/Sakoram_1.0.0_x64-setup.exe", Size: 1, LastModified: "2026-01-01T00:00:00+00:00" },
			{ Key: "sakoram/1.0.0/Sakoram_1.0.0_x64-setup.exe", Size: 2, LastModified: "2026-02-01T00:00:00+00:00" }
		];
		expect(pickArtifact(duplicated, "windows").size).toBe(2);
	});

	it("throws when the platform has no artifact in the folder", () => {
		expect(() => pickArtifact(WINDOWS_LISTING, "mac")).toThrow(/no mac artifact/i);
	});

	it("throws on an unknown platform", () => {
		expect(() => pickArtifact(WINDOWS_LISTING, "solaris")).toThrow(/unknown platform/i);
	});

	it("tolerates an empty or missing listing", () => {
		expect(() => pickArtifact([], "windows")).toThrow(/no windows artifact/i);
		expect(() => pickArtifact(undefined, "windows")).toThrow(/no windows artifact/i);
	});
});
