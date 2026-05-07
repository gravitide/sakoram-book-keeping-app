<template>
	<div class="h-screen flex bg-(--ui-bg-muted)">
		<aside class="w-60 shrink-0 border-r border-(--ui-border) bg-(--ui-bg) flex flex-col">
			<UDropdownMenu :items="tenantMenuItems">
				<button
					type="button"
					class="w-full px-4 py-3 border-b border-(--ui-border) flex items-center gap-2 min-w-0 hover:bg-(--ui-bg-elevated) transition text-left"
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
							{{ tenants.tenants.length > 1 ? "Switch business" : "Sakoram Book Keeping" }}
						</div>
					</div>
					<UIcon name="i-lucide-chevrons-up-down" class="size-4 text-(--ui-text-muted) shrink-0" />
				</button>
			</UDropdownMenu>

			<nav class="flex-1 p-2 space-y-1 overflow-y-auto">
				<template v-for="item in nav" :key="item.to">
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

			<div class="px-4 py-3 border-t border-(--ui-border) text-xs text-(--ui-text-muted)">
				v{{ appVersion }}
			</div>
		</aside>

		<main class="flex-1 min-w-0 overflow-auto">
			<div class="px-8 py-6 max-w-7xl mx-auto">
				<slot />
			</div>
		</main>
	</div>
</template>

<script setup lang="ts">
// Layout mounts before any page; ensure the singleton settings row is loaded
// once for the whole app. Subsequent calls from pages no-op.

	import pkg from "~~/package.json";
	import { isValidThemeColor } from "~/lib/theme";
	import { useSettingsStore } from "~/stores/settings";
	import { useTenantsStore } from "~/stores/tenants";

	// Pulls from package.json so we never forget to update the sidebar
	// label when bumping the app version.
	const appVersion = pkg.version;

	const settings = useSettingsStore();
	const tenants = useTenantsStore();
	const router = useRouter();
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
	// Google Sans Flex is bundled via @font-face in main.css, so it's always
	// available regardless of what the user has installed on their machine.
	// User-chosen fonts that AREN'T installed locally fall through to it
	// instead of jumping straight to system-ui.
	const appFontStack = computed(() => {
		const f = settings.settings?.ui_font?.trim() || "Google Sans Flex";
		return `'${f}', 'Google Sans Flex', system-ui, sans-serif`;
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
	const nav = [
		{ to: "/", label: "Dashboard", icon: "i-lucide-layout-dashboard" },
		{ to: "/clients", label: "Clients", icon: "i-lucide-users" },
		{ to: "/quotes", label: "Quotes", icon: "i-lucide-file-text" },
		{ to: "/invoices", label: "Invoices", icon: "i-lucide-receipt" },
		{ to: "/bills", label: "Bills", icon: "i-lucide-file-input" },
		{ to: "/vouchers", label: "Vouchers", icon: "i-lucide-ticket" },
		{
			to: "/settings",
			label: "Settings",
			icon: "i-lucide-settings",
			children: [
				{ to: "/settings/company", label: "Company details", icon: "i-lucide-building-2" },
				{ to: "/settings/appearance", label: "Appearance", icon: "i-lucide-palette" },
				{ to: "/settings/businesses", label: "Businesses", icon: "i-lucide-briefcase" }
			]
		}
	] as const;
</script>
