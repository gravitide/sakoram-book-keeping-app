<template>
	<div class="h-screen flex flex-col bg-(--ui-bg-muted)">
		<TitleBar :show-sidebar-toggle="true" />
		<div class="flex-1 min-h-0 flex">
			<aside v-show="!sidebarCollapsed" class="app-chrome w-60 shrink-0 m-2 mt-0 rounded-lg border border-(--ui-border) bg-(--ui-bg) shadow-md shadow-black/10 flex flex-col overflow-hidden">
				<UDropdownMenu :items="tenantMenuItems">
					<button
						type="button"
						class="w-full px-4 py-3 border-b border-(--ui-border) flex items-center gap-2 min-w-0 hover:bg-(--ui-bg-accented) transition text-left"
						title="Switch business"
					>
						<div class="size-9 shrink-0 rounded-md bg-(--ui-bg-muted) border border-(--ui-border) flex items-center justify-center overflow-hidden">
							<img
								v-if="settings.logoSrc"
								:src="settings.logoSrc"
								alt="Logo"
								class="max-w-full max-h-full object-contain"
							>
							<UIcon v-else name="i-lucide-building-2" class="size-5 text-(--ui-primary)" />
						</div>
						<div class="leading-tight min-w-0 flex-1">
							<div class="font-semibold text-sm truncate">
								{{ tenants.activeTenant?.name ?? settings.businessName }}
							</div>
							<!-- Only a functional "Switch business" hint when there's
								more than one tenant; a single business shows just its
								name (no app-tagline filler). -->
							<div v-if="tenants.tenants.length > 1" class="text-xs text-(--ui-text-muted)">
								Switch business
							</div>
						</div>
						<UIcon name="i-lucide-chevrons-up-down" class="size-4 text-(--ui-text-muted) shrink-0" />
					</button>
				</UDropdownMenu>

				<OverlayScrollbar class="flex-1 min-h-0">
					<nav class="p-2 space-y-1">
						<template v-for="item in nav" :key="item.to ?? item.label">
							<!-- Optional rule above this item to break the list into
					logical groups (documents / contacts / settings). -->
							<div
								v-if="item.divider"
								class="my-2 border-t border-(--ui-border)"
								aria-hidden="true"
							/>
							<!-- Section heading: a non-clickable label that groups the items
								below it by money-flow direction (INCOMING / OUTGOING / BANKING). -->
							<div
								v-if="item.heading"
								class="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-(--ui-text-dimmed) select-none"
							>
								{{ item.label }}
							</div>
							<!-- Two flavours: navigation items (item.to) render
							as NuxtLink, action items (item.action) render
							as a button. The action flavour is currently
							only used by the Help item which spawns a
							separate Tauri WebviewWindow instead of
							navigating — see useHelpWindow. -->
							<button
								v-else-if="item.action"
								type="button"
								class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text) cursor-pointer text-left"
								@click="item.action"
							>
								<UIcon :name="item.icon" class="size-4" />
								{{ item.label }}
							</button>
							<!-- Group parent (has children): the label still navigates to
							its landing page; the chevron on the right (or a double-click on the header) collapses/expands
							the group's sub-items. Collapsed state is persisted per
							group (by its `to`) to localStorage. -->
							<div v-else-if="item.children" class="flex items-stretch" @dblclick="toggleGroup(item.to)">
								<NuxtLink
									:to="item.to"
									class="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)"
									active-class=""
									exact-active-class="!bg-(--ui-primary)/10 !text-(--ui-primary) font-medium"
								>
									<UIcon :name="item.icon" class="size-4" />
									{{ item.label }}
									<UIcon v-if="item.feature && !license.hasFeature(item.feature)" name="i-lucide-lock" class="size-3 text-(--ui-text-dimmed) ml-auto shrink-0" />
								</NuxtLink>
								<button
									type="button"
									class="px-1.5 flex items-center justify-center rounded-md text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text) cursor-pointer shrink-0"
									:aria-label="isGroupCollapsed(item.to) ? `Expand ${item.label}` : `Collapse ${item.label}`"
									@click="toggleGroup(item.to)"
								>
									<UIcon
										name="i-lucide-chevron-down"
										class="size-4 transition-transform"
										:class="isGroupCollapsed(item.to) ? '-rotate-90' : ''"
									/>
								</button>
							</div>
							<NuxtLink
								v-else
								:to="item.to"
								class="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)"
								active-class="!bg-(--ui-primary)/10 !text-(--ui-primary) font-medium"
								exact-active-class="!bg-(--ui-primary)/10 !text-(--ui-primary) font-medium"
							>
								<UIcon :name="item.icon" class="size-4" />
								{{ item.label }}
								<UIcon v-if="item.feature && !license.hasFeature(item.feature)" name="i-lucide-lock" class="size-3 text-(--ui-text-dimmed) ml-auto shrink-0" />
							</NuxtLink>

							<!-- Sub-items: collapsible per group via the chevron above. -->
							<div v-if="item.children && !isGroupCollapsed(item.to)" class="ml-3 pl-3 border-l border-(--ui-border) space-y-1">
								<template v-for="child in item.children" :key="child.to">
									<NuxtLink
										:to="child.to"
										class="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)"
										active-class="!text-(--ui-primary) font-medium"
									>
										<UIcon :name="child.icon" class="size-3.5" />
										{{ child.label }}
										<UIcon v-if="child.feature && !license.hasFeature(child.feature)" name="i-lucide-lock" class="size-3 text-(--ui-text-dimmed) ml-auto shrink-0" />
									</NuxtLink>

									<!-- Third level: in-page section anchors. Shown only while
							the user is on this child's own page, so the Settings
							group doesn't balloon on every other route. The active
							section is matched on the URL hash. -->
									<div
										v-if="child.sections && route.path === child.to"
										class="ml-3 pl-3 border-l border-(--ui-border) space-y-0.5 mt-0.5"
									>
										<NuxtLink
											v-for="section in child.sections"
											:key="section.hash"
											:to="`${child.to}${section.hash}`"
											class="flex items-center gap-2 px-3 py-1 rounded-md text-xs hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)"
											:class="route.hash === section.hash
												? '!text-(--ui-primary) font-medium'
												: 'text-(--ui-text-muted)'"
											@click="scrollToSection(section.hash)"
										>
											<UIcon :name="section.icon" class="size-3" />
											{{ section.label }}
										</NuxtLink>
									</div>
								</template>
							</div>
						</template>
					</nav>
				</OverlayScrollbar>

				<div class="px-4 py-3 border-t border-(--ui-border) flex items-center justify-between gap-2">
					<!-- Wordmark replaces the version label as the footer
						identity. The PNG/SVG is drawn for a light background;
						in dark mode we invert + hue-rotate 180° so the dark
						strokes read as light while the coloured glyph flips
						back to its original hue. `title` keeps the version
						readable on hover for the user who wants it. -->
					<img
						:src="sakoramLogo"
						alt="Sakoram"
						:title="`Sakoram - The desktop bookkeeper! · v${appVersion}`"
						class="h-5 w-auto select-none dark:invert dark:hue-rotate-180"
						draggable="false"
					>
					<UButton
						icon="i-lucide-info"
						size="xs"
						variant="ghost"
						color="neutral"
						title="About Sakoram"
						aria-label="About Sakoram"
						@click="aboutOpen = true"
					/>
				</div>

				<UModal v-model:open="aboutOpen" title="About Sakoram">
					<template #content>
						<!-- About is read-only chrome (version, description,
							credits, links) — no inputs, no copyable data —
							so drop drag-select on the whole body. Matches
							the convention applied to other read-only
							surfaces across the app. -->
						<div class="p-6 space-y-5 select-none">
							<div class="flex flex-col items-center text-center gap-2">
								<!-- The wordmark PNG is designed for a light background.
								In dark mode we invert + 180° hue-rotate so the dark
								text reads as light while the coloured icon flips back
								to its original hue. -->
								<img
									:src="sakoramLogo"
									alt="Sakoram"
									class="h-14 w-auto dark:invert dark:hue-rotate-180"
								>
								<div class="text-sm text-(--ui-text-muted) tabular-nums">
									The desktop bookkeeper! · Version {{ appVersion }}
								</div>
							</div>

							<p class="text-sm leading-relaxed">
								A single-user desktop bookkeeping app — quotes, invoices, bills,
								and vouchers with professional PDFs. Multi-business by design,
								runs fully offline, your data stays on this machine.
							</p>

							<dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
								<dt class="text-(--ui-text-muted)">
									Active business
								</dt>
								<dd class="font-medium truncate">
									{{ settings.businessName }}
								</dd>

								<dt class="text-(--ui-text-muted)">
									Built with
								</dt>
								<dd>
									Tauri · Nuxt · Typst
								</dd>

								<dt class="text-(--ui-text-muted)">
									Plan
								</dt>
								<dd class="font-medium">
									{{ ["Basic", "Plus", "Premium"][license.tier] }}
									<span v-if="license.isTrial" class="text-(--ui-text-muted) font-normal"> · trial, {{ license.trialDaysLeft }} day{{ license.trialDaysLeft === 1 ? "" : "s" }} left</span>
									<span v-else-if="license.buyerName" class="text-(--ui-text-muted) font-normal"> · licensed to {{ license.buyerName }}</span>
								</dd>

								<dt class="text-(--ui-text-muted)">
									Website
								</dt>
								<dd>
									<button
										type="button"
										class="text-(--ui-primary) hover:underline inline-flex items-center gap-1 cursor-pointer"
										@click="openLink('https://sakoram.gravitide.dev')"
									>
										sakoram.gravitide.dev
										<UIcon name="i-lucide-external-link" class="size-3.5" />
									</button>
								</dd>

								<dt class="text-(--ui-text-muted)">
									Made by
								</dt>
								<dd>
									<button
										type="button"
										class="text-(--ui-primary) hover:underline inline-flex items-center gap-1 cursor-pointer"
										@click="openLink('https://gravitide.dev')"
									>
										Gravitide
										<UIcon name="i-lucide-external-link" class="size-3.5" />
									</button>
								</dd>
							</dl>

							<div class="text-xs text-(--ui-text-muted) border-t border-(--ui-border) pt-4">
								© {{ copyrightYear }} Gravitide. All rights reserved.
							</div>
						</div>
					</template>
					<template #footer>
						<div class="flex justify-end w-full">
							<UButton color="neutral" variant="ghost" @click="aboutOpen = false">
								Close
							</UButton>
						</div>
					</template>
				</UModal>
			</aside>

			<div class="flex-1 min-w-0 flex flex-col min-h-0">
				<TrialBanner />
				<main ref="mainEl" class="flex-1 min-h-0 overflow-auto">
					<!-- Content cap: 96rem (1536px) — matches Tailwind's `2xl`
					breakpoint. Wider than the default `max-w-7xl` (1280px) so
					multi-column list pages have more room on a wide desktop
					monitor without stretching edge-to-edge on ultrawide. -->
					<!-- Bottom pad matches the sidebar's m-2 outer gap (8px)
						so the main content's lower edge lines up with the
						sidebar's floating card. Other sides stay at 16px. -->
					<div class="p-4 pb-2 max-w-[96rem] mx-auto">
						<slot />
					</div>
				</main>
			</div>
		</div>

		<!-- Dev-only floating chip showing the active Tailwind
			breakpoint + viewport width. Self-gates on `import.meta.dev`
			so the production build excludes it. -->
		<BreakpointBadge />
	</div>
</template>

<script setup lang="ts">
// Layout mounts before any page; ensure the singleton settings row is loaded
// once for the whole app. Subsequent calls from pages no-op.

	import { open as openExternal } from "@tauri-apps/plugin-shell";
	import pkg from "~~/package.json";
	// Sakoram brand wordmark — bundled into the build by Vite (resolves at
	// compile time, no runtime fetch). Wide PNG, rendered in the About modal.
	import sakoramLogo from "~/assets/sakoram-wordmark.svg?url";
	import { useHelpWindow } from "~/composables/useHelpWindow";
	import { isValidThemeColor } from "~/lib/theme";
	import { useLicenseStore } from "~/stores/license";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	// Sidebar Help item handler — spawns the docs window (or focuses
	// it if already open). See useHelpWindow + app/layouts/help-window.vue.
	const helpWindow = useHelpWindow();

	// Pulls from package.json so we never forget to update the sidebar
	// label when bumping the app version.
	const appVersion = pkg.version;
	const copyrightYear = new Date().getFullYear();

	// Hand external URLs to the OS default browser. A plain `<a href>` in
	// a Tauri webview would navigate the in-app window (no chrome to come
	// back from) — `@tauri-apps/plugin-shell`'s `open()` shells out
	// instead. Capability is already granted in capabilities/main.json.
	const openLink = (url: string) => {
		openExternal(url).catch(() => { /* best-effort */ });
	};

	// Sidebar-footer About modal. Lives at the layout level so any page
	// gets it for free; the toggle is the small info button next to the
	// version number.
	const aboutOpen = ref(false);

	const license = useLicenseStore();
	const settings = useSettingsStore();
	const tenants = useTenantsStore();
	const router = useRouter();
	const { sidebarCollapsed } = useUiState();
	const appConfig = useAppConfig() as { ui: { colors: { primary: string } } };

	// Tenant switcher menu — lists every business the user has, plus links
	// to the welcome screen (where they can create a new business or pick
	// from logos) and to the Businesses settings page (rename/delete).
	const tenantMenuItems = computed(() => {
		const others = tenants.tenants
			.filter((t) => t.id !== tenants.activeTenantId)
			.map((t) => ({
				label: t.name,
				icon: "i-lucide-building-2",
				onSelect: async () => {
					try {
						await tenants.activate(t.id);
						window.location.assign("/");
					} catch (err) {
						console.error("Could not switch business:", err);
					}
				}
			}));

		const sections: { label: string, icon: string, onSelect: () => void }[][] = [];
		if (others.length > 0) sections.push(others);
		sections.push([
			{
				label: "Manage businesses",
				icon: "i-lucide-settings",
				onSelect: () => {
					void router.push("/settings/businesses");
				}
			},
			{
				label: "Add another business",
				icon: "i-lucide-plus",
				onSelect: () => {
					void router.push("/welcome");
				}
			}
		]);
		return sections;
	});

	// Apply the UI font by overriding Tailwind's `--font-sans` CSS variable
	// at the :root level. We can't just write `font-family` on <html> because
	// Tailwind v4's preflight rule `body { font-family: var(--font-sans) }`
	// wins on specificity. Overriding the variable cascades through every
	// element that uses it — including teleported overlays (popovers, modals,
	// the calendar popup) which live outside the layout tree.
	// Inter is bundled via @font-face in main.css, so it's always
	// available regardless of what the user has installed on their machine.
	// User-chosen fonts that AREN'T installed locally fall through to it
	// instead of jumping straight to system-ui.
	const appFontStack = computed(() => {
		const f = settings.settings?.ui_font?.trim() || "Akt";
		return `'${f}', 'Akt', 'Inter', system-ui, sans-serif`;
	});

	watch(appFontStack, (stack) => {
		if (typeof document !== "undefined") {
			document.documentElement.style.setProperty("--font-sans", stack);
		}
	}, { immediate: true });

	// Apply theme color whenever settings load or change. NuxtUI is
	// reactive on appConfig.ui.colors.primary — flipping it updates every
	// component that uses the primary color.
	watch(
		() => settings.settings?.theme_color,
		(name) => {
			if (isValidThemeColor(name)) appConfig.ui.colors.primary = name;
		},
		{ immediate: true }
	);

	onMounted(() => {
		settings.ensureLoaded().catch(() => { /* surfaced on dashboard */ });
	});

	// Reactive current route — used to reveal a child's in-page section
	// anchors (third nav level) only while that child's page is open.
	const route = useRoute();

	// Scroll a section anchor into view. The `:to` on the link still
	// updates the URL hash (which drives the active-section highlight),
	// but the visible scroll has to be done by hand: the main content
	// scrolls inside its own container, so Vue Router's hash handling —
	// which only moves the window — does nothing here. scrollIntoView
	// walks up to the real scrollable ancestor and respects scroll-margin.
	const scrollToSection = (hash: string) => {
		if (typeof document === "undefined") return;
		const el = document.getElementById(hash.replace(/^#/, ""));
		el?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	// Snap the main scroll container back to the top whenever the user
	// navigates between pages. Vue Router's default scroll-to-top only
	// touches the window, but our content scrolls inside <main> (the
	// floating-sidebar layout), so we have to reset it ourselves.
	// Watching `route.path` rather than the full route keeps in-page
	// hash links — the third-level section anchors on /settings/pdf and
	// /settings/appearance — from triggering an unwanted top-snap.
	const mainEl = ref<HTMLElement | null>(null);
	watch(() => route.path, () => {
		mainEl.value?.scrollTo({ top: 0 });
	});

	// Sidebar nav — Settings is a parent with two children. Sub-items are
	// always visible (no click-to-expand) since the tree is small.
	// Group order: Dashboard → documents (quotes/invoices/bills/vouchers)
	// → contacts (clients/vendors) → settings. `divider: true` draws a thin
	// rule above the item so the eye can pick out group boundaries without
	// reading every label.
	//
	// A child may carry `sections`: in-page #anchors rendered as a third
	// level, shown only when the user is on that child's route.
	// Collapsible nav groups. Collapsed group keys (the group's `to`) persist
	// to localStorage so the user's layout survives reloads / tenant switches.
	const COLLAPSED_GROUPS_KEY = "sidebar-collapsed-groups";
	const collapsedGroups = ref<Set<string>>(new Set());
	onMounted(() => {
		try {
			const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
			if (raw) collapsedGroups.value = new Set(JSON.parse(raw) as string[]);
		} catch { /* ignore malformed storage */ }
	});
	const isGroupCollapsed = (key?: string): boolean => !!key && collapsedGroups.value.has(key);
	const toggleGroup = (key?: string): void => {
		if (!key) return;
		const next = new Set(collapsedGroups.value);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		collapsedGroups.value = next;
		try {
			localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]));
		} catch { /* ignore */ }
	};

	interface NavSection { hash: string, label: string, icon: string }
	interface NavChild { to: string, label: string, icon: string, sections?: NavSection[], feature?: string }
	interface NavItem { to?: string, label: string, icon?: string, divider?: boolean, children?: NavChild[], action?: () => void, heading?: boolean, feature?: string }

	const nav: NavItem[] = [
		{ to: "/", label: "Dashboard", icon: "i-lucide-layout-dashboard" },
		{ to: "/calendar", label: "Calendar", icon: "i-lucide-calendar-days" },
		// Documents grouped by money-flow direction. Incoming = sales side
		// (clients pay us); Outgoing = purchase side (we pay vendors);
		// Banking = cash ledger + reconciliation, which cut both ways.
		{ heading: true, label: "Incoming", divider: true },
		{ to: "/quotes", label: "Quotes", icon: "i-lucide-file-text" },
		{ to: "/invoices", label: "Invoices", icon: "i-lucide-receipt" },
		{ to: "/recurring-invoices", label: "Recurring invoices", icon: "i-lucide-repeat", feature: "recurring" },
		{ to: "/credit-notes", label: "Credit notes", icon: "i-lucide-rotate-ccw", feature: "credit_notes" },
		{ heading: true, label: "Outgoing", divider: true },
		{ to: "/bills", label: "Bills", icon: "i-lucide-file-input" },
		{ to: "/recurring-bills", label: "Recurring bills", icon: "i-lucide-repeat-2", feature: "recurring" },
		{ heading: true, label: "Banking", divider: true },
		{ to: "/vouchers", label: "Vouchers", icon: "i-lucide-ticket" },
		{ to: "/reconcile", label: "Reconcile", icon: "i-lucide-scale", feature: "reconcile" },
		{
			// `/payroll` is the landing card grid (mirrors `/reports`).
			// Dashboard lives at `/payroll/dashboard` so the top-level
			// link can land on the overview-of-overview page.
			to: "/payroll",
			label: "Payroll",
			icon: "i-lucide-wallet",
			divider: true,
			feature: "payroll",
			children: [
				{ to: "/payroll/dashboard", label: "Dashboard", icon: "i-lucide-layout-dashboard", feature: "payroll" },
				{ to: "/employees", label: "Employees", icon: "i-lucide-users-round", feature: "payroll" },
				{ to: "/payslips", label: "Payslips", icon: "i-lucide-file-spreadsheet", feature: "payroll" },
				// Cycle template (period_start_day / period_end_day /
				// pay_day) lives at /settings/payroll for historical
				// reasons but its natural home in the nav is the Payroll
				// group — the user is more likely to look for it there
				// than under Settings.
				{
					to: "/settings/payroll",
					label: "Settings",
					icon: "i-lucide-calendar-clock",
					feature: "payroll",
					sections: [
						{ hash: "#cycle", label: "Cycle template", icon: "i-lucide-calendar-clock" },
						{ hash: "#statutory", label: "EPF / ETF", icon: "i-lucide-landmark" },
						{ hash: "#paye", label: "PAYE (APIT)", icon: "i-lucide-percent" }
					]
				}
			]
		},
		{
			to: "/reports",
			label: "Reports",
			icon: "i-lucide-chart-pie",
			divider: true,
			children: [
				{ to: "/reports/profit-loss", label: "Profit & Loss", icon: "i-lucide-trending-up" },
				{ to: "/reports/vat", label: "VAT", icon: "i-lucide-percent" },
				{ to: "/reports/aged-receivables", label: "Aged receivables", icon: "i-lucide-clock", feature: "reports.aged_receivables" },
				{ to: "/reports/aged-payables", label: "Aged payables", icon: "i-lucide-clock-alert", feature: "reports.aged_payables" },
				{ to: "/reports/cash-flow", label: "Cash flow", icon: "i-lucide-arrow-left-right", feature: "reports.cash_flow" },
				{ to: "/reports/sales-by-client", label: "Sales by client", icon: "i-lucide-users-round", feature: "reports.sales_by_client" },
				{ to: "/reports/expenses-by-vendor", label: "Expenses by vendor", icon: "i-lucide-store", feature: "reports.expenses_by_vendor" },
				{ to: "/reports/payroll-register", label: "Payroll register", icon: "i-lucide-clipboard-list", feature: "payroll" }
			]
		},
		{
			// `/lists` is the landing card grid (mirrors `/reports` +
			// `/payroll`). The underlying list pages stay at their
			// existing top-level URLs — this index just gives the
			// group a proper landing instead of jumping straight to
			// Clients.
			to: "/lists",
			label: "Lists",
			icon: "i-lucide-library",
			divider: true,
			children: [
				{ to: "/clients", label: "Clients", icon: "i-lucide-users" },
				{ to: "/vendors", label: "Vendors", icon: "i-lucide-store" },
				{ to: "/categories", label: "Bill categories", icon: "i-lucide-tags" }
			]
		},
		{
			// Per-business configuration — the data here belongs to the
			// business and (mostly) travels with the export bundle. Includes
			// all security for this business: database encryption + PDF
			// protection both live on the Security page.
			to: "/settings",
			label: "Business",
			icon: "i-lucide-building-2",
			divider: true,
			children: [
				{
					to: "/settings/company",
					label: "Business details",
					icon: "i-lucide-building-2",
					sections: [
						{ hash: "#company", label: "Company", icon: "i-lucide-building-2" },
						{ hash: "#address", label: "Address", icon: "i-lucide-map-pin" },
						{ hash: "#bank-accounts", label: "Bank accounts", icon: "i-lucide-landmark" },
						{ hash: "#defaults", label: "Defaults", icon: "i-lucide-sliders-horizontal" }
					]
				},
				{
					to: "/settings/pdf",
					label: "PDF",
					icon: "i-lucide-file-text",
					sections: [
						{ hash: "#font", label: "Font", icon: "i-lucide-type" },
						{ hash: "#templates", label: "Templates", icon: "i-lucide-layout-template" },
						{ hash: "#header-logo", label: "Header logo", icon: "i-lucide-image" },
						{ hash: "#footer-notes", label: "Footer notes", icon: "i-lucide-file-text" }
					]
				},
				{
					to: "/settings/security",
					label: "Security",
					icon: "i-lucide-shield-check",
					sections: [
						{ hash: "#encryption", label: "Database", icon: "i-lucide-database" },
						{ hash: "#pdf-protection", label: "PDF protection", icon: "i-lucide-file-text" }
					]
				}
			]
		},
		{
			// App-wide preferences + multi-tenant administration — not tied
			// to any single business (Appearance is per-machine; Businesses
			// manages the whole tenant set).
			to: "/settings/appearance",
			label: "Settings",
			icon: "i-lucide-settings",
			divider: true,
			children: [
				{
					to: "/settings/appearance",
					label: "Appearance",
					icon: "i-lucide-palette",
					sections: [
						{ hash: "#ui-font", label: "UI font", icon: "i-lucide-type" },
						{ hash: "#theme-color", label: "Theme color", icon: "i-lucide-palette" },
						{ hash: "#theme", label: "Theme", icon: "i-lucide-sun-moon" },
						{ hash: "#zoom", label: "Zoom", icon: "i-lucide-zoom-in" }
					]
				},
				{ to: "/settings/businesses", label: "Businesses", icon: "i-lucide-briefcase" },
				{ to: "/settings/license", label: "License", icon: "i-lucide-key-round" }
			]
		},
		{
			// Help library — plain-English bookkeeping explainers,
			// when-to-use-it scenarios, and how-to-do-it-in-Sakoram
			// walkthroughs. Per-page HelpButton (the ? icon) drops
			// users straight into the relevant topic via a modal;
			// this entry spawns the dedicated docs WebviewWindow.
			// Note `action` instead of `to` — the docs live in a
			// separate window, not inside the main app's layout.
			action: () => {
				void helpWindow.openHelpWindow();
			},
			label: "Help",
			icon: "i-lucide-book-open",
			divider: true
		}
	];
</script>
