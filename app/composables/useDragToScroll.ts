import type { Ref } from "vue";
import { onBeforeUnmount, onMounted } from "vue";

/**
 * Make a horizontally-scrolling container drag-to-pan with the mouse.
 *
 * Wired onto the wrapper around a PrimeVue DataTable, this turns the
 * table itself into a scroll surface: when columns extend past the
 * viewport (a frequent state once the user widens columns past the
 * `min-width`), the user can press anywhere in the body and drag to
 * pan instead of having to aim for the horizontal scrollbar.
 *
 * Interaction rules:
 *  - Only the primary (left) mouse button starts a drag. Right-click
 *    still opens the row context menu untouched.
 *  - Drags that start on headers, buttons, anchors, inputs, the column
 *    resizer, or any element marked `role="button" / menuitem"` are
 *    ignored so the underlying control keeps its click.
 *  - We watch `mousemove` on `document` (not the scroller) so a drag
 *    that strays outside the table still pans, and a quick exit
 *    doesn't strand the dragging state.
 *  - If the pointer moves more than 5 px before mouseup, we register a
 *    one-shot capture-phase `click` handler that swallows the click —
 *    that way a pan ending over a different row doesn't navigate.
 *
 * `targetSelector` is the inner scrollable element (for PrimeVue
 * DataTable: `.p-datatable-table-container`). `hostRef` is the wrapper
 * the composable scopes its query to, so multiple tables on a page
 * don't collide.
 */
export function useDragToScroll(targetSelector: string, hostRef: Ref<HTMLElement | null>) {
	let cleanup: (() => void) | null = null;

	onMounted(() => {
		const host = hostRef.value;
		if (!host) return;
		const scroller = host.querySelector(targetSelector) as HTMLElement | null;
		if (!scroller) return;

		let isDown = false;
		let startX = 0;
		let initialScrollLeft = 0;
		let moved = false;

		const onMouseDown = (e: MouseEvent) => {
			if (e.button !== 0) return;
			const target = e.target as HTMLElement;
			// Skip interactive elements so their own click handlers still fire.
			if (target.closest([
				"th",
				"button",
				"a",
				"input",
				"textarea",
				"select",
				".p-datatable-column-resizer",
				"[role='button']",
				"[role='menuitem']"
			].join(","))) {
				return;
			}

			isDown = true;
			moved = false;
			startX = e.pageX;
			initialScrollLeft = scroller.scrollLeft;
			scroller.style.cursor = "grabbing";
		};

		const onMouseMove = (e: MouseEvent) => {
			if (!isDown) return;
			const walk = e.pageX - startX;
			if (!moved && Math.abs(walk) > 5) moved = true;
			if (moved) {
				e.preventDefault();
				scroller.scrollLeft = initialScrollLeft - walk;
			}
		};

		const onMouseUp = () => {
			if (!isDown) return;
			isDown = false;
			scroller.style.cursor = "";
			if (moved) {
				// Eat the trailing click so an accidental drag-ending-on-a-row
				// doesn't open whatever row the pointer happened to land on.
				const swallow = (ev: MouseEvent) => {
					ev.stopPropagation();
					ev.preventDefault();
					document.removeEventListener("click", swallow, true);
				};
				document.addEventListener("click", swallow, true);
			}
		};

		scroller.addEventListener("mousedown", onMouseDown);
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);

		cleanup = () => {
			scroller.removeEventListener("mousedown", onMouseDown);
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};
	});

	onBeforeUnmount(() => {
		cleanup?.();
	});
}
