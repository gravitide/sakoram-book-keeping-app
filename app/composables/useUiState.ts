// App-wide UI toggles that survive route changes (and a page reload).
//
// `useState` gives us a single shared ref keyed by name; localStorage
// persistence is layered on top so the user's last choice sticks
// across app launches. Cheap and good enough — no need for a
// dedicated Pinia store.

const SIDEBAR_KEY = "sakoram.ui.sidebarCollapsed";
const ZOOM_KEY = "sakoram.ui.zoomLevel";

// Discrete zoom steps surfaced in the Appearance picker. 100 is the
// browser-default 16px root font-size; everything else scales the
// rem cascade (Tailwind / NuxtUI units are rem-based).
export const ZOOM_LEVELS = [80, 85, 90, 95, 100, 105, 110, 115, 125, 150] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];
const DEFAULT_ZOOM: ZoomLevel = 100;

const isZoomLevel = (n: number): n is ZoomLevel =>
	(ZOOM_LEVELS as readonly number[]).includes(n);

export function useUiState() {
	const sidebarCollapsed = useState<boolean>("ui-sidebar-collapsed", () => {
		if (typeof localStorage === "undefined") return false;
		return localStorage.getItem(SIDEBAR_KEY) === "1";
	});

	const toggleSidebar = () => {
		sidebarCollapsed.value = !sidebarCollapsed.value;
		try {
			localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed.value ? "1" : "0");
		} catch { /* private mode etc. — fine to ignore */ }
	};

	const zoomLevel = useState<ZoomLevel>("ui-zoom-level", () => {
		if (typeof localStorage === "undefined") return DEFAULT_ZOOM;
		const raw = localStorage.getItem(ZOOM_KEY);
		const n = raw ? Number(raw) : DEFAULT_ZOOM;
		return isZoomLevel(n) ? n : DEFAULT_ZOOM;
	});

	const setZoomLevel = (next: ZoomLevel) => {
		if (!isZoomLevel(next)) return;
		zoomLevel.value = next;
		try {
			localStorage.setItem(ZOOM_KEY, String(next));
		} catch { /* idem */ }
	};

	return { sidebarCollapsed, toggleSidebar, zoomLevel, setZoomLevel };
}
