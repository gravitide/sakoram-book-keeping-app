<template>
	<div class="space-y-6 select-text">
		<HelpSection title="What the page design is" icon="i-lucide-layout-template">
			<p>
				Your <strong>page design</strong> is the paper every document prints on: the letterhead, the footer, the page
				number, a seal or a watermark. There is <strong>one design per business</strong>, and every document uses it:
				quotes, invoices, bills, vouchers, payslips, credit notes, letters, statements and reports.
			</p>
			<p>
				Sakoram still lays out the document itself (the title, number, client, lines, totals and notes) inside the
				<strong>safe area</strong>. Everything you place in the designer is drawn <strong>behind</strong> the document.
			</p>
			<!-- No link to the settings page: this topic also opens inside the
				designer's own window, which must not navigate away. -->
			<p>
				Open it from <strong>Settings → PDF</strong> with <strong>Open page designer</strong>. It opens in its own window,
				so you can keep working in the main one.
			</p>
		</HelpSection>

		<HelpSection title="Start from a template" icon="i-lucide-copy">
			<p>
				<strong>Start from a template</strong> at the top of the side panel offers seven starting designs: Classic,
				Modern, Minimal and Compact (letterheads, each also setting its Document style), Full-page background,
				Pre-printed paper and Blank. Each preview uses your own logo, colour and paper.
			</p>
			<HelpCallout variant="tip" title="A template replaces your design">
				Picking one swaps out everything on the page. If you change your mind, <strong>Ctrl+Z</strong> brings your design back.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Adding things" icon="i-lucide-plus">
			<ul class="list-disc pl-5 space-y-1.5">
				<li>
					<strong>Image</strong>: a logo, seal or signature (PNG, JPEG, SVG or the first page of a PDF). It keeps its
					proportions when you resize it, and PNG and JPEG images can be cropped.
				</li>
				<li><strong>Background</strong>: artwork that covers the whole page, behind everything else.</li>
				<li>
					<strong>Text</strong>: your own words plus <strong>company fields</strong> that fill in from Company settings.
					Pick a font, size, bold, italic, alignment and colour. The width is fixed and the text wraps.
				</li>
				<li>
					<strong>Page number</strong>: one per design, in the same spot on every page it's shown on, as "Page 1 of 3",
					"1 / 3" or "1". It can hide itself on one-page documents. Without one, documents have no page numbers.
				</li>
				<li><strong>Line</strong>: a horizontal or vertical rule, with a thickness and a colour.</li>
			</ul>
			<p>
				You can also drop a file straight onto the page: Sakoram asks whether it's an image or a background. On the
				Pre-printed paper template it also offers <strong>A scan of your pre-printed paper</strong>. A background added to the
				Full-page background template takes the template's place for it.
			</p>
			<p>Use <strong>Insert field</strong> above a text box's text to add a company field:</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<thead class="bg-(--ui-bg-accented) text-left text-xs uppercase tracking-wide text-(--ui-text-muted)">
						<tr>
							<th class="px-3 py-2 font-medium">
								Field
							</th>
							<th class="px-3 py-2 font-medium">
								Fills in
							</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="t in PDF_TOKENS" :key="t.token" class="border-t border-(--ui-border)">
							<td class="px-3 py-2 font-mono text-xs whitespace-nowrap">
								{{ t.token }}
							</td>
							<td class="px-3 py-2 text-(--ui-text-muted)">
								{{ t.label }}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<HelpCallout variant="info" title="Empty fields drop out">
				If a field is empty, say you have no website, a line made only of empty fields is left out of your PDFs, and the
				separators around a missing field are tidied away. The designer still shows that line, faded, so you can find it.
			</HelpCallout>
		</HelpSection>

		<HelpSection title="Moving and sizing" icon="i-lucide-move">
			<p>
				<strong>Lock</strong> an item from its panel to stop it being clicked or moved on the page; a background is locked
				as soon as you add it. Locked items are listed under <strong>Locked</strong> in the side panel, where
				<strong>Unlock</strong> brings them back.
			</p>
			<p>
				Click something to select it, drag it to move it, and drag a handle to resize it. Items snap to the page edges,
				the centre, the safe area and each other; hold <strong>Alt</strong> while dragging to turn snapping off. The side
				panel shows the exact position and size in millimetres.
			</p>
			<div class="overflow-x-auto rounded-lg border border-(--ui-border) bg-(--ui-bg)">
				<table class="w-full text-sm">
					<tbody>
						<tr v-for="(k, i) in SHORTCUTS" :key="k.keys" :class="i > 0 ? 'border-t border-(--ui-border)' : ''">
							<td class="px-3 py-2 font-medium whitespace-nowrap">
								{{ k.keys }}
							</td>
							<td class="px-3 py-2 text-(--ui-text-muted)">
								{{ k.does }}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</HelpSection>

		<HelpSection title="The safe area and the printer margin" icon="i-lucide-square-dashed">
			<p>
				The <strong>dashed box</strong> is the safe area: where the document itself goes. Drag its guides on the page or type
				the four margins in the side panel. Items never push the document around.
			</p>
			<p>
				The <strong>red hatched band</strong> around the edge is the 5 mm most printers can't print. It's only there for
				reference: artwork may run into it, but it may be cut off on a home or office printer.
			</p>
			<p>
				An item that overlaps the safe area gets a small amber <strong>warning</strong>. That's allowed, since a
				watermark overlaps on purpose, but the document will print on top of it.
			</p>
		</HelpSection>

		<HelpSection title="Which pages" icon="i-lucide-files">
			<p>
				Every item has a <strong>Pages</strong> setting: <strong>Every page</strong>, <strong>First page</strong> only, or
				<strong>After the first</strong> (a smaller header on continuation pages, for example). Use the
				<strong>Page 1 / Page 2</strong> switch in the toolbar to see each.
			</p>
			<p>
				Zoom with the <strong>+</strong> and <strong>−</strong> buttons or the percentage menu; <strong>100%</strong> is the
				paper's real size on screen.
			</p>
		</HelpSection>

		<HelpSection title="Pre-printed paper" icon="i-lucide-scan">
			<p>
				If you print on paper that already has your letterhead, pick the <strong>Pre-printed paper</strong> template and
				drop a scan of a blank sheet on its slot. The scan is <strong>Guide only — not printed</strong>: it shows in the
				designer so you can line the safe area up with the printed parts, and never appears in a PDF. Any image can be
				made a guide from its panel.
			</p>
		</HelpSection>

		<HelpSection title="Saving" icon="i-lucide-save">
			<p>
				Nothing changes your documents until you press <strong>Save</strong> (or Ctrl+S). <strong>Discard</strong> goes
				back to the last saved design, and closing the window with unsaved changes asks first. <strong>Preview as PDF</strong>
				shows a two-page sample invoice in the design as it is now, saved or not.
			</p>
			<p>
				Switching business or locking it from the main window closes the designer, so it can never save into the wrong
				business.
			</p>
		</HelpSection>
	</div>
</template>

<script setup lang="ts">
	// Help: the page designer (app/pages/designer.vue). Spec:
	// docs/superpowers/specs/2026-11-27-page-designer-design.md.
	import { PDF_TOKENS } from "~/lib/pdf-tokens";

	const SHORTCUTS = [
		{ keys: "Arrow keys", does: "Nudge the selected item 1 mm (hold Shift for 5 mm)" },
		{ keys: "Ctrl+D", does: "Duplicate it" },
		{ keys: "Delete", does: "Delete it" },
		{ keys: "Ctrl+Z / Ctrl+Y", does: "Undo / redo, back to the last save" },
		{ keys: "H, or hold Space", does: "Hand tool: drag to move around the page (V goes back)" },
		{ keys: "Ctrl+S", does: "Save" },
		{ keys: "Esc", does: "Deselect" }
	];
</script>
