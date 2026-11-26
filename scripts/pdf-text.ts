// The visible text of a Typst-rendered PDF, page by page — so the render check
// can assert WHAT a page says (e.g. "no business identity on pre-printed
// paper"), not only that its bytes are unchanged.
//
// Deliberately narrow: it reads only what Typst 0.14 writes — uncompressed
// object dicts, FlateDecode content streams, Type0 / Identity-H fonts with a
// ToUnicode CMap, and per-page inline /Resources. Text drawn inside form
// XObjects (Typst uses none for text today) would be missed; the self-check
// in verify-pdf-render.ts (the business name IS found on a Built-in render)
// fails loudly if Typst ever changes that.

import type { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

interface PdfObject {
	dict: string
	stream: Buffer | null
}

const parseObjects = (pdf: Buffer): Map<number, PdfObject> => {
	const s = pdf.toString("latin1");
	const objects = new Map<number, PdfObject>();
	const head = /(\d+) 0 obj\b/g;
	let m: RegExpExecArray | null = head.exec(s);
	while (m) {
		const start = m.index + m[0].length;
		const end = s.indexOf("endobj", start);
		const body = s.slice(start, end);
		const streamAt = body.search(/stream\r?\n/);
		let stream: Buffer | null = null;
		let dict = body;
		if (streamAt >= 0) {
			dict = body.slice(0, streamAt);
			const dataStart = start + streamAt + body.slice(streamAt).match(/^stream\r?\n/)![0].length;
			const dataEnd = s.indexOf("endstream", dataStart);
			const raw = pdf.subarray(dataStart, dataEnd);
			stream = /\/FlateDecode/.test(dict) ? inflateSync(raw) : raw;
		}
		objects.set(Number(m[1]), { dict, stream });
		head.lastIndex = end;
		m = head.exec(s);
	}
	return objects;
};

// glyph code (hex) -> unicode text, from a ToUnicode CMap.
const parseCMap = (cmap: string): Map<string, string> => {
	const map = new Map<string, string>();
	const utf16 = (hex: string) => {
		let out = "";
		for (let i = 0; i < hex.length; i += 4) out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
		return out;
	};
	for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
		for (const [, src, dst] of block[1]!.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) map.set(src!.toLowerCase(), utf16(dst!));
	}
	for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
		for (const [, lo, hi, dst] of block[1]!.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
			const width = lo!.length;
			const base = Number.parseInt(dst!, 16);
			for (let c = Number.parseInt(lo!, 16), i = 0; c <= Number.parseInt(hi!, 16); c++, i++) {
				map.set(c.toString(16).padStart(width, "0"), utf16((base + i).toString(16).padStart(dst!.length, "0")));
			}
		}
	}
	return map;
};

// The bytes of a PDF literal string `( … )` starting at s[i] === "(".
const readLiteral = (s: string, i: number): { bytes: number[], end: number } => {
	const bytes: number[] = [];
	let depth = 0;
	for (let j = i; j < s.length; j++) {
		const ch = s[j]!;
		if (ch === "\\") {
			const next = s[j + 1]!;
			const oct = s.slice(j + 1).match(/^[0-7]{1,3}/);
			if (oct) {
				bytes.push(Number.parseInt(oct[0], 8));
				j += oct[0].length;
				continue;
			}
			const esc: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
			bytes.push(esc[next] ?? next.charCodeAt(0));
			j++;
			continue;
		}
		if (ch === "(") {
			if (depth++ === 0) continue;
		} else if (ch === ")") {
			if (--depth === 0) return { bytes, end: j };
		}
		bytes.push(ch.charCodeAt(0));
	}
	return { bytes, end: s.length };
};

const ref = (dict: string, key: string) => {
	const m = dict.match(new RegExp(`/${key}\\s+(\\d+) 0 R`));
	return m ? Number(m[1]) : null;
};

/** One string per page, in content order, runs concatenated (no separators). */
export const pdfPageTexts = (pdf: Buffer): string[] => {
	const objects = parseObjects(pdf);
	const cmaps = new Map<number, Map<string, string>>();
	const fontCMap = (fontId: number) => {
		if (!cmaps.has(fontId)) {
			const cmapId = ref(objects.get(fontId)?.dict ?? "", "ToUnicode");
			const cmap = cmapId === null ? null : objects.get(cmapId)?.stream;
			cmaps.set(fontId, cmap ? parseCMap(cmap.toString("latin1")) : new Map());
		}
		return cmaps.get(fontId)!;
	};

	const pages: string[] = [];
	for (const obj of objects.values()) {
		if (!/\/Type\s*\/Page(?![a-z])/i.test(obj.dict)) continue;
		const fonts = new Map<string, number>();
		const fontDict = obj.dict.match(/\/Font\s*<<([\s\S]*?)>>/);
		for (const [, name, id] of fontDict?.[1]?.matchAll(/\/(\w+)\s+(\d+) 0 R/g) ?? []) fonts.set(name!, Number(id));
		const contentsId = ref(obj.dict, "Contents");
		const content = contentsId === null ? "" : objects.get(contentsId)?.stream?.toString("latin1") ?? "";

		const runs: string[] = [];
		let cmap = new Map<string, string>();
		const tokens = /\/(\w+)\s+[\d.]+\s+Tf|\(/g;
		let t: RegExpExecArray | null = tokens.exec(content);
		while (t) {
			if (t[1] !== undefined) {
				const id = fonts.get(t[1]);
				cmap = id === undefined ? new Map() : fontCMap(id);
			} else {
				const { bytes, end } = readLiteral(content, t.index);
				let text = "";
				for (let k = 0; k + 1 < bytes.length; k += 2) {
					const code = ((bytes[k]! << 8) | bytes[k + 1]!).toString(16).padStart(4, "0");
					text += cmap.get(code) ?? "";
				}
				runs.push(text);
				tokens.lastIndex = end + 1;
			}
			t = tokens.exec(content);
		}
		pages.push(runs.join(""));
	}
	return pages;
};
