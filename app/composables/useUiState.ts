// App-wide UI toggles that survive route changes (and a page reload).
//
// `useState` gives us a single shared ref keyed by name; localStorage
// persistence is layered on top so the user's last collapse state
// sticks across app launches. Cheap and good enough — no need for a
// dedicated Pinia store.

const STORAGE_KEY = "sakoram.ui.sidebarCollapsed";

export function useUiState() {
	const sidebarCollapsed = useState<boolean>("ui-sidebar-collapsed", () => {
		if (typeof localStorage === "undefined") return false;
		return localStorage.getItem(STORAGE_KEY) === "1";
	});

	const toggleSidebar = () => {
		sidebarCollapsed.value = !sidebarCollapsed.value;
		try {
			localStorage.setItem(STORAGE_KEY, sidebarCollapsed.value ? "1" : "0");
		} catch { /* private mode etc. — fine to ignore */ }
	};

	return { sidebarCollapsed, toggleSidebar };
}
