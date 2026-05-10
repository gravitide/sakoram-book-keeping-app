<template>
	<div class="h-screen flex flex-col bg-(--ui-bg-muted)">
		<TitleBar :show-sidebar-toggle="true" />
		<div class="flex-1 min-h-0 flex">
			<aside v-show="!sidebarCollapsed" class="app-chrome w-60 shrink-0 m-2 mt-0 rounded-lg border border-(--ui-border) bg-(--ui-bg) shadow-lg shadow-black/20 flex flex-col overflow-hidden">
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
							<div class="text-xs text-(--ui-text-muted)">
								{{ tenants.tenants.length > 1 ? "Switch business" : "Sakoram Bookkeeping" }}
							</div>
						</div>
						<UIcon name="i-lucide-chevrons-up-down" class="size-4 text-(--ui-text-muted) shrink-0" />
					</button>
				</UDropdownMenu>

				<nav class="flex-1 p-2 space-y-1 overflow-y-auto">
					<template v-for="item in nav" :key="item.to">
						<!-- Optional rule above this item to break the list into
					logical groups (documents / contacts / settings). -->
						<div
							v-if="item.divider"
							class="my-2 border-t border-(--ui-border)"
							aria-hidden="true"
						/>
						<NuxtLink
							:to="item.to"
							class="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)"
							:active-class="item.children ? '' : '!bg-(--ui-primary)/10 !text-(--ui-primary) font-medium'"
							exact-active-class="!bg-(--ui-primary)/10 !text-(--ui-primary) font-medium"
						>
							<UIcon :name="item.icon" class="size-4" />
							{{ item.label }}
						</NuxtLink>

						<!-- Sub-items: render directly under the parent. Always visible
					(no click-to-expand) because the tree is small enough that
					discoverability beats compactness here. -->
						<div v-if="item.children" class="ml-3 pl-3 border-l border-(--ui-border) space-y-1">
							<NuxtLink
								v-for="child in item.children"
								:key="child.to"
								:to="child.to"
								class="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text)"
								active-class="!text-(--ui-primary) font-medium"
							>
								<UIcon :name="child.icon" class="size-3.5" />
								{{ child.label }}
							</NuxtLink>
						</div>
					</template>
				</nav>

				<div class="px-4 py-3 border-t border-(--ui-border) text-xs text-(--ui-text-muted) flex items-center justify-between">
					<span>v{{ appVersion }}</span>
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
						<div class="p-6 space-y-5">
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
									Bookkeeping · Version {{ appVersion }}
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
									Made by
								</dt>
								<dd>
									Gravitide
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

			<main class="flex-1 min-w-0 overflow-auto">
				<!-- Content cap: 96rem (1536px) — matches Tailwind's `2xl`
				breakpoint. Wider than the default `max-w-7xl` (1280px) so
				multi-column list pages have more room on a wide desktop
				monitor without stretching edge-to-edge on ultrawide. -->
				<div class="pl-4 pr-8 py-6 max-w-[96rem] mx-auto">
					<slot />
				</div>
			</main>
		</div>
	</div>
</template>

<script setup lang="ts">
// Layout mounts before any page; ensure the singleton settings row is loaded
// once for the whole app. Subsequent calls from pages no-op.

	import pkg from "~~/package.json";
	// Sakoram brand wordmark — bundled into the build by Vite (resolves at
	// compile time, no runtime fetch). Wide PNG, rendered in the About modal.
	import sakoramLogo from "~/assets/sakoram-wordmark.svg?url";
	import { isValidThemeColor } from "~/lib/theme";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	// Pulls from package.json so we never forget to update the sidebar
	// label when bumping the app version.
	const appVersion = pkg.version;
	const copyrightYear = new Date().getFullYear();

	// Sidebar-footer About modal. Lives at the layout level so any page
	// gets it for free; the toggle is the small info button next to the
	// version number.
	const aboutOpen = ref(false);

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
		const f = settings.settings?.ui_font?.trim() || "Inter";
		return `'${f}', 'Inter', system-ui, sans-serif`;
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

	// Sidebar nav — Settings is a parent with two children. Sub-items are
	// always visible (no click-to-expand) since the tree is small.
	// Group order: Dashboard → documents (quotes/invoices/bills/vouchers)
	// → contacts (clients/vendors) → settings. `divider: true` draws a thin
	// rule above the item so the eye can pick out group boundaries without
	// reading every label.
	const nav = [
		{ to: "/", label: "Dashboard", icon: "i-lucide-layout-dashboard" },
		{ to: "/quotes", label: "Quotes", icon: "i-lucide-file-text", divider: true },
		{ to: "/invoices", label: "Invoices", icon: "i-lucide-receipt" },
		{ to: "/bills", label: "Bills", icon: "i-lucide-file-input" },
		{ to: "/vouchers", label: "Vouchers", icon: "i-lucide-ticket" },
		{
			to: "/employees",
			label: "Payroll",
			icon: "i-lucide-wallet",
			divider: true,
			children: [
				{ to: "/employees", label: "Employees", icon: "i-lucide-users-round" },
				{ to: "/payslips", label: "Payslips", icon: "i-lucide-file-spreadsheet" }
			]
		},
		{
			to: "/clients",
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
			to: "/settings",
			label: "Settings",
			icon: "i-lucide-settings",
			divider: true,
			children: [
				{ to: "/settings/company", label: "Company details", icon: "i-lucide-building-2" },
				{ to: "/settings/pdf", label: "PDF", icon: "i-lucide-file-text" },
				{ to: "/settings/appearance", label: "Appearance", icon: "i-lucide-palette" },
				{ to: "/settings/businesses", label: "Businesses", icon: "i-lucide-briefcase" }
			]
		}
	] as const;
</script>
