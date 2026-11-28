import { describe, expect, it } from "vitest";
import { insertToken, resolveDesignLines, resolveDesignText } from "./page-design-text";

const EMPTY = { business_name: "", address: "", city: "", phone: "", email: "", website: "", tax_id: "" };
const values = (v: Partial<typeof EMPTY>) => ({ ...EMPTY, ...v });

describe("resolveDesignText", () => {
	it("fills a company field", () => {
		expect(resolveDesignText("{business_name}", values({ business_name: "Gravitide" }))).toEqual(["Gravitide"]);
	});

	it("drops lines whose fields are all empty and tidies the separators left behind", () => {
		const text = "{address}, {city}\n{phone} · {email}\n{website}";
		expect(resolveDesignText(text, values({ city: "Colombo" }))).toEqual(["Colombo"]);
	});

	it("collapses a separator around an empty field in the middle", () => {
		const text = "{business_name} · {website} · {phone}";
		expect(resolveDesignText(text, values({ business_name: "Gravitide", phone: "077 123 4567" }))).toEqual(["Gravitide · 077 123 4567"]);
	});

	it("drops a labelled line whose only field is empty", () => {
		expect(resolveDesignText("Web: {website}", values({}))).toEqual([]);
	});

	it("keeps text with no fields as typed", () => {
		expect(resolveDesignText("Thank you", values({}))).toEqual(["Thank you"]);
	});

	it("keeps blank lines the user typed", () => {
		expect(resolveDesignText("Line one\n\nLine three", values({}))).toEqual(["Line one", "", "Line three"]);
	});

	it("leaves an unknown field exactly as typed", () => {
		expect(resolveDesignText("{unknown}", values({}))).toEqual(["{unknown}"]);
	});

	it("keeps a line where at least one field has a value", () => {
		expect(resolveDesignText("{phone} | {email}", values({ email: "hi@x.lk" }))).toEqual(["hi@x.lk"]);
	});
});

describe("resolveDesignLines", () => {
	const v = values({ phone: "011 234", website: "" });

	it("prints like resolveDesignText, none faded", () => {
		expect(resolveDesignLines("{phone}\n{website}", v)).toEqual([{ text: "011 234", faded: false }]);
	});

	it("keeps a line whose fields are all empty, faded and labelled, when asked (the designer)", () => {
		expect(resolveDesignLines("{phone}\n{website}", v, { keepEmpty: true })).toEqual([
			{ text: "011 234", faded: false },
			{ text: "Website", faded: true }
		]);
	});
});

describe("insertToken", () => {
	it("inserts at the caret and puts the caret after the token", () => {
		expect(insertToken("Call  today", 5, 5, "{phone}")).toEqual({ text: "Call {phone} today", caret: 12 });
	});

	it("replaces a selection", () => {
		expect(insertToken("Web: xxx", 5, 8, "{website}")).toEqual({ text: "Web: {website}", caret: 14 });
	});
});
