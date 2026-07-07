// First-run Terms acceptance, stored per-machine in localStorage (like the
// other UI prefs). Versioned via TERMS_VERSION so a Terms change re-gates.
import { hasAcceptedTerms, TERMS_VERSION } from "~/lib/terms";

const VERSION_KEY = "sakoram.terms.acceptedVersion";
const AT_KEY = "sakoram.terms.acceptedAt";

export function useTerms() {
	const accepted = useState<boolean>("terms-accepted", () => {
		if (typeof localStorage === "undefined") return false;
		return hasAcceptedTerms(localStorage.getItem(VERSION_KEY));
	});

	const refresh = () => {
		if (typeof localStorage === "undefined") return;
		accepted.value = hasAcceptedTerms(localStorage.getItem(VERSION_KEY));
	};

	const accept = () => {
		try {
			localStorage.setItem(VERSION_KEY, TERMS_VERSION);
			localStorage.setItem(AT_KEY, new Date().toISOString());
		} catch { /* private mode — the gate will just re-show next launch */ }
		accepted.value = true;
	};

	return { TERMS_VERSION, accepted, accept, refresh };
}
