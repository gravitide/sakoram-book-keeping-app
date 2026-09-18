<template>
	<div class="select-none">
		<!-- select-none on the page root: chrome / labels aren't
			selectable; form inputs stay selectable via the main.css
			rule that puts user-select:text back on input / textarea
			/ [contenteditable] inside select-none containers. -->
		<!-- Top toolbar row: back link on the left, action cluster on the
			right. Pinned above the hero so the buttons can't collide
			with the name / chip strip below as the viewport narrows.
			flex-wrap on the row lets the cluster spill onto a second
			toolbar row at very narrow widths instead of crashing into
			the title; the cluster itself stays inline (no dropdown
			collapse — the set of actions is small enough to fit). -->
		<div class="mb-4 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
			<NuxtLink to="/vendors" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1">
				<UIcon name="i-lucide-arrow-left" class="size-4" />
				Back to vendors
			</NuxtLink>

			<!-- Hidden for new vendors since there's nothing to act on.
				View bills moved into the shortcut cards below the hero —
				only record-level actions stay up here. Delete is blocked
				by the DB once any bill references the vendor — the handler
				catches the FK error and surfaces a friendly nudge toward
				Archive. -->
			<div v-if="!isNew" class="flex items-center gap-2 flex-wrap shrink-0">
				<UButton
					size="sm"
					:icon="isArchived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
					variant="soft"
					color="neutral"
					@click="toggleArchive"
				>
					{{ isArchived ? "Restore vendor" : "Archive vendor" }}
				</UButton>
				<!-- Visual separator before the destructive action so a stray
					click on Archive doesn't land on Delete. -->
				<div class="h-6 w-px bg-(--ui-border-accented) mx-1" />
				<UButton
					size="sm"
					icon="i-lucide-trash-2"
					variant="soft"
					color="error"
					@click="confirmDelete = true"
				>
					Delete
				</UButton>
			</div>
		</div>

		<!-- Identity hero. Avatar + name + chips only — actions moved
			to the top row above so they can't crash into this content
			as the viewport narrows. -->
		<section class="mb-10">
			<div class="flex items-start gap-5 flex-wrap">
				<!-- Avatar — circular, primary-tinted background with the
					vendor's initials. Falls back to a generic store
					icon when initials aren't available. -->
				<div class="size-20 shrink-0 rounded-full bg-(--ui-primary)/15 flex items-center justify-center overflow-hidden">
					<span
						v-if="initials"
						class="font-semibold text-2xl tracking-tight text-(--ui-primary)"
					>
						{{ initials }}
					</span>
					<UIcon v-else name="i-lucide-store" class="size-8 text-(--ui-text-muted)" />
				</div>

				<!-- Identity summary -->
				<div class="flex-1 min-w-0">
					<h1 class="text-3xl font-semibold leading-tight truncate flex items-center gap-3">
						{{ isNew ? "New vendor" : (form.name || "Untitled vendor") }}
						<UBadge v-if="!isNew && isArchived" color="neutral" variant="subtle">
							Archived
						</UBadge>
					</h1>
					<dl class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-(--ui-text-muted)">
						<div v-if="form.contact_person" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-user" class="size-3.5" />
							<span>{{ form.contact_person }}</span>
						</div>
						<div v-if="form.email" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-mail" class="size-3.5" />
							<span>{{ form.email }}</span>
						</div>
						<div v-if="form.phone" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-phone" class="size-3.5" />
							<span class="tabular-nums">{{ form.phone }}</span>
						</div>
						<div v-if="form.tax_id" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-receipt" class="size-3.5" />
							<span>Tax ID {{ form.tax_id }}</span>
						</div>
						<div v-if="!form.contact_person && !form.email && !form.phone && !form.tax_id">
							{{ isNew
								? "Fill in the details below — name is the only required field."
								: "No contact details captured yet — add some below." }}
						</div>
					</dl>
				</div>
			</div>
		</section>

		<!-- Activity shortcut cards — live per-vendor numbers, mirroring the
			client page's row. Bills = info blue; Payable = warning amber
			while we owe them money (click jumps to the bills list
			pre-filtered to this vendor's outstanding bills), success green
			once settled. Numbers come from SQL aggregates in loadStats(),
			refreshed on keep-alive re-entry. -->
		<section v-if="!isNew" class="mb-10 grid grid-cols-1 md:grid-cols-2 gap-4">
			<button
				type="button"
				class="group text-left rounded-lg border border-(--ui-info)/40 bg-(--ui-info)/10 hover:border-(--ui-info)/80 hover:bg-(--ui-info)/15 transition p-4 flex items-start gap-3 cursor-pointer shadow-md shadow-black/10"
				@click="viewBills"
			>
				<span class="size-10 shrink-0 rounded-md bg-(--ui-info)/20 flex items-center justify-center">
					<UIcon name="i-lucide-file-input" class="size-5 text-(--ui-info)" />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-xs font-medium uppercase tracking-wider text-(--ui-info)">Bills</span>
					<span class="block text-2xl font-semibold tabular-nums leading-tight">{{ stats.loaded ? stats.billsTotal : "—" }}</span>
					<span class="block text-xs text-(--ui-text-muted) mt-0.5">
						{{ !stats.loaded ? "Loading…"
							: stats.billsTotal === 0 ? "None yet — view all"
								: stats.billsOpen > 0 ? `${stats.billsOpen} awaiting payment · view all` : "View all" }}
					</span>
				</span>
				<UIcon name="i-lucide-arrow-right" class="size-4 mt-1 text-(--ui-info)/50 group-hover:text-(--ui-info) group-hover:translate-x-0.5 transition" />
			</button>

			<!-- Payable card carries the money headline: what we still owe
				this vendor. Two equally visible states: warning amber with
				money due (click = bills list filtered to the outstanding
				ones), success green when settled. -->
			<button
				type="button"
				class="group text-left rounded-lg border transition p-4 flex items-start gap-3 shadow-md shadow-black/10"
				:class="stats.billsOpen > 0
					? 'border-(--ui-warning)/50 bg-(--ui-warning)/10 hover:border-(--ui-warning) hover:bg-(--ui-warning)/15 cursor-pointer'
					: 'border-(--ui-success)/40 bg-(--ui-success)/10 cursor-default'"
				:disabled="stats.billsOpen === 0"
				@click="viewOutstandingBills"
			>
				<span
					class="size-10 shrink-0 rounded-md flex items-center justify-center"
					:class="stats.billsOpen > 0 ? 'bg-(--ui-warning)/20' : 'bg-(--ui-success)/20'"
				>
					<UIcon
						:name="stats.billsOpen > 0 ? 'i-lucide-hand-coins' : 'i-lucide-circle-check'"
						class="size-5"
						:class="stats.billsOpen > 0 ? 'text-(--ui-warning)' : 'text-(--ui-success)'"
					/>
				</span>
				<span class="min-w-0 flex-1">
					<span
						class="block text-xs font-medium uppercase tracking-wider"
						:class="stats.billsOpen > 0 ? 'text-(--ui-warning)' : 'text-(--ui-success)'"
					>Payable</span>
					<span
						class="block text-2xl font-semibold tabular-nums leading-tight truncate"
						:class="stats.billsOpen > 0 ? 'text-(--ui-warning)' : 'text-(--ui-success)'"
					>
						{{ stats.loaded ? formatLKR(stats.payableCents) : "—" }}
					</span>
					<span class="block text-xs text-(--ui-text-muted) mt-0.5">
						{{ !stats.loaded ? "Loading…"
							: stats.billsOpen === 0 ? "All settled — nothing due"
								: `Across ${stats.billsOpen} bill${stats.billsOpen === 1 ? "" : "s"} · view outstanding` }}
					</span>
				</span>
				<UIcon
					v-if="stats.billsOpen > 0"
					name="i-lucide-arrow-right"
					class="size-4 mt-1 text-(--ui-warning)/50 group-hover:text-(--ui-warning) group-hover:translate-x-0.5 transition"
				/>
			</button>
		</section>

		<!-- Form -------------------------------------------------------------- -->
		<UForm :schema="schema" :state="form" @submit="onSubmit">
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<SectionCard
					icon="i-lucide-id-card"
					title="Identity"
					subtitle="Who they are and how to reach them."
				>
					<UFormField label="Name" name="name" required>
						<UInput v-model="form.name" placeholder="Acme Suppliers (Pvt) Ltd" />
					</UFormField>
					<UFormField label="Contact person" name="contact_person">
						<UInput
							v-model="form.contact_person"
							leading-icon="i-lucide-user"
							placeholder="Person to address"
						/>
					</UFormField>
					<UFormField label="Email" name="email">
						<UInput
							v-model="form.email"
							type="email"
							leading-icon="i-lucide-mail"
							placeholder="ar@acme.lk"
						/>
					</UFormField>
					<UFormField label="Phone" name="phone">
						<UInput
							v-model="form.phone"
							leading-icon="i-lucide-phone"
							placeholder="+94 ..."
						/>
					</UFormField>
					<UFormField label="Tax / VAT ID" name="tax_id">
						<UInput v-model="form.tax_id" />
					</UFormField>
				</SectionCard>

				<SectionCard
					icon="i-lucide-map-pin"
					title="Address"
					subtitle="Used on bill PDFs so payments reach the right place."
				>
					<UFormField label="Address line 1" name="address_line1">
						<UInput v-model="form.address_line1" />
					</UFormField>
					<UFormField label="Address line 2" name="address_line2">
						<UInput v-model="form.address_line2" />
					</UFormField>
					<div class="grid grid-cols-3 gap-3">
						<UFormField label="City" name="city" class="col-span-2">
							<UInput v-model="form.city" />
						</UFormField>
						<UFormField label="Postal" name="postal_code">
							<UInput v-model="form.postal_code" />
						</UFormField>
					</div>
					<UFormField label="Country" name="country">
						<UInput v-model="form.country" />
					</UFormField>
				</SectionCard>

				<SectionCard
					icon="i-lucide-sticky-note"
					title="Internal notes"
					subtitle="Visible only to you — never appears on a bill PDF."
					class="lg:col-span-2"
				>
					<UFormField name="notes">
						<UTextarea
							v-model="form.notes"
							:rows="4"
							placeholder="Anything you want to remember about this vendor"
							class="w-full"
						/>
					</UFormField>
				</SectionCard>
			</div>

			<!-- Sticky save bar — same pattern as Settings → Company. Pinned
				to the bottom of the scrollable <main> ancestor; appears only
				when the form is dirty. On a brand-new vendor the form
				starts dirty after the first keystroke, so the bar surfaces
				naturally. -->
			<div
				class="sticky bottom-0 -mx-2 mt-6 transition-all duration-200"
				:class="dirty
					? 'opacity-100 translate-y-0 pointer-events-auto'
					: 'opacity-0 translate-y-3 pointer-events-none'"
			>
				<div class="rounded-xl backdrop-blur-md bg-(--ui-bg)/90 border border-(--ui-border) shadow-lg px-4 py-3 flex items-center justify-between gap-4">
					<div class="flex items-center gap-2 text-sm">
						<span class="relative flex size-2">
							<span class="absolute inline-flex h-full w-full rounded-full bg-(--ui-warning) opacity-75 animate-ping" />
							<span class="relative inline-flex size-2 rounded-full bg-(--ui-warning)" />
						</span>
						<span class="text-(--ui-text)">{{ isNew ? "Ready to save" : "Unsaved changes" }}</span>
					</div>
					<div class="flex items-center gap-2">
						<UButton
							variant="ghost"
							color="neutral"
							:disabled="saving"
							@click="onDiscard"
						>
							{{ isNew ? "Cancel" : "Discard" }}
						</UButton>
						<UButton
							:loading="saving"
							:disabled="!dirty"
							icon="i-lucide-save"
							type="submit"
						>
							{{ isNew ? "Create vendor" : "Save changes" }}
						</UButton>
					</div>
				</div>
			</div>
		</UForm>

		<!-- Delete confirmation. The DB protects vendors with linked
			bills via the FK constraint, so the destructive path is
			only available before any bill is recorded — see the
			handler for the FK error fallback. -->
		<UModal v-model:open="confirmDelete" title="Delete this vendor?">
			<template #body>
				<div class="space-y-3 text-sm">
					<p>
						This permanently removes <span class="font-medium">{{ form.name || "this vendor" }}</span> from the address book.
					</p>
					<p class="text-(--ui-text-muted)">
						If a bill has ever been recorded for this vendor,
						the database will refuse the delete — archive
						instead. Archived vendors are hidden from pickers
						but their bill history stays intact.
					</p>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="ghost" @click="confirmDelete = false">
						Cancel
					</UButton>
					<UButton color="error" :loading="deleting" icon="i-lucide-trash-2" @click="onDelete">
						Delete vendor
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
	import type { VendorInput } from "~/stores/vendors";
	import { z } from "zod";
	import { selectOne } from "~/lib/db";
	import { billDerivedFrom } from "~/lib/derived-status";
	import { formatLKR } from "~/lib/money";
	import { useBillsStore } from "~/stores/bills";
	import { useVendorsStore } from "~/stores/vendors";

	definePageMeta({ title: "Vendor" });

	const route = useRoute();
	const router = useRouter();
	const store = useVendorsStore();
	// Used by the viewBills handler — set the bills list's
	// vendorFilter before navigating so the user lands pre-filtered.
	const billsStore = useBillsStore();
	const toast = useToast();

	const idParam = String(route.params.id ?? "");
	const isNew = idParam === "new";
	const vendorId = isNew ? null : Number(idParam);
	if (!isNew && (!Number.isFinite(vendorId) || vendorId === null)) {
		throw createError({ statusCode: 404, statusMessage: "Vendor not found" });
	}

	const form = reactive<VendorInput>({
		name: "",
		contact_person: "",
		email: "",
		phone: "",
		address_line1: "",
		address_line2: "",
		city: "",
		postal_code: "",
		country: "Sri Lanka",
		tax_id: "",
		notes: ""
	});

	// Pristine copy of the form, captured before any hydrate. The /new route
	// is ONE kept-alive instance: after a successful create we navigate to
	// the new row's page, and without resetting here the next "New" visit
	// reopens this instance with the last submission still typed in and the
	// save bar already up — one click away from a duplicate.
	const BLANK_FORM = { ...form };

	const isArchived = ref(false);
	const confirmDelete = ref(false);
	const deleting = ref(false);
	const saving = ref(false);

	// Derive a 1–2-character avatar label from the name. Falls back to a
	// generic store icon if the field is empty (e.g. on the New vendor page
	// before the user types anything).
	const initials = computed(() => {
		const raw = form.name?.trim() ?? "";
		if (!raw) return "";
		const parts = raw.split(/\s+/).filter(Boolean);
		const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
		return letters || raw[0]?.toUpperCase() || "";
	});

	const hydrate = (row: { name: string, contact_person: string | null, email: string | null, phone: string | null, address_line1: string | null, address_line2: string | null, city: string | null, postal_code: string | null, country: string | null, tax_id: string | null, notes: string | null, is_archived: number }) => {
		form.name = row.name;
		form.contact_person = row.contact_person ?? "";
		form.email = row.email ?? "";
		form.phone = row.phone ?? "";
		form.address_line1 = row.address_line1 ?? "";
		form.address_line2 = row.address_line2 ?? "";
		form.city = row.city ?? "";
		form.postal_code = row.postal_code ?? "";
		form.country = row.country ?? "Sri Lanka";
		form.tax_id = row.tax_id ?? "";
		form.notes = row.notes ?? "";
		isArchived.value = row.is_archived === 1;
	};

	if (!isNew && vendorId !== null) {
		const row = await store.get(vendorId);
		if (!row) {
			throw createError({ statusCode: 404, statusMessage: "Vendor not found" });
		}
		hydrate(row);
	}

	// Dirty tracking via JSON snapshot. Re-baselined after save / discard.
	// On the new-vendor path the baseline is the empty form, so any
	// keystroke flips dirty true and surfaces the sticky save bar.
	const formSnapshot = computed(() => JSON.stringify(form));
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};

	// Kept-alive page: re-hydrate on every re-activation so a row archived
	// (or deleted) from the list isn't shown as its stale cached copy — see
	// useRehydrateOnActivate. Not for /new, which has no row behind it.
	if (!isNew && vendorId !== null) {
		useRehydrateOnActivate({
			isDirty: () => dirty.value,
			exists: async () => (await store.get(vendorId)) != null,
			rehydrate: async () => {
				const row = await store.get(vendorId);
				if (!row) return;
				hydrate(row);
				refreshBaseline();
			},
			noun: "vendor",
			listRoute: "/vendors"
		});
	}

	const schema = z.object({
		name: z.string().trim().min(1, "Name is required"),
		email: z.union([z.literal(""), z.string().email("Invalid email")])
	});

	type Schema = z.output<typeof schema>;

	const onSubmit = async (_event: { data: Schema }) => {
		saving.value = true;
		try {
			if (isNew) {
				const id = await store.create({ ...form });
				toast.add({ title: "Vendor created", color: "success", icon: "i-lucide-check" });
				Object.assign(form, BLANK_FORM);
				refreshBaseline();
				await router.replace(`/vendors/${id}`);
			} else if (vendorId !== null) {
				await store.update(vendorId, { ...form });
				refreshBaseline();
				toast.add({ title: "Vendor updated", color: "success", icon: "i-lucide-check" });
			}
		} catch (err) {
			toast.add({
				title: "Save failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			saving.value = false;
		}
	};

	const onDiscard = async () => {
		if (isNew) {
			await router.push("/vendors");
			return;
		}
		if (vendorId !== null) {
			const row = await store.get(vendorId);
			if (row) {
				hydrate(row);
				refreshBaseline();
				toast.add({ title: "Changes discarded", color: "info", icon: "i-lucide-rotate-ccw" });
			}
		}
	};

	const toggleArchive = async () => {
		if (vendorId === null) return;
		try {
			await store.setArchived(vendorId, !isArchived.value);
			isArchived.value = !isArchived.value;
			toast.add({
				title: isArchived.value ? "Archived" : "Restored",
				color: "info",
				icon: isArchived.value ? "i-lucide-archive" : "i-lucide-archive-restore"
			});
		} catch (err) {
			toast.add({
				title: "Action failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	// Jump to the bills list pre-filtered to this vendor. Filter lives
	// on the destination store; clear the others and set the vendor
	// before routing.
	const viewBills = () => {
		if (vendorId === null) return;
		billsStore.search = "";
		billsStore.clearStatusFilters();
		billsStore.clearDateFilters();
		billsStore.vendorFilter = vendorId;
		void router.push("/bills");
	};

	// Payable-card click: same jump, but pre-ticks the outstanding status
	// chips so the list shows only what still needs paying.
	const viewOutstandingBills = () => {
		if (vendorId === null) return;
		billsStore.search = "";
		billsStore.clearDateFilters();
		billsStore.statusFilters = ["unpaid", "partial", "overdue"];
		billsStore.vendorFilter = vendorId;
		void router.push("/bills");
	};

	// Local YYYY-MM-DD "today" (not UTC — toISOString would drift a day near
	// midnight for +ve timezones).
	const todayISO = (): string => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	// Live per-vendor numbers for the shortcut cards between the hero and
	// the form. SQL aggregates, not store sums — the bills store may not
	// be loaded when the user lands here directly, and the derived-status
	// subquery gives the same paid/balance math the list pages use.
	// Reloaded on keep-alive re-entry so paying a bill elsewhere and
	// coming back shows fresh numbers.
	const stats = reactive({
		loaded: false,
		billsTotal: 0,
		billsOpen: 0,
		payableCents: 0
	});
	const loadStats = async () => {
		if (vendorId === null) return;
		const b = await selectOne<{ total: number, open: number, payable: number }>(
			`SELECT COUNT(*) AS total,
				COALESCE(SUM(CASE WHEN _status IN ('unpaid', 'partial', 'overdue') THEN 1 ELSE 0 END), 0) AS open,
				COALESCE(SUM(CASE WHEN _status IN ('unpaid', 'partial', 'overdue') THEN _balance ELSE 0 END), 0) AS payable
			 FROM ${billDerivedFrom(todayISO())} WHERE vendor_id = ?`,
			[vendorId]
		);
		stats.billsTotal = b?.total ?? 0;
		stats.billsOpen = b?.open ?? 0;
		stats.payableCents = b?.payable ?? 0;
		stats.loaded = true;
	};
	if (!isNew) void loadStats();
	// Keep-alive: setup runs once, so refresh the aggregates every time
	// the user navigates back to this cached page.
	onActivated(() => {
		if (!isNew) void loadStats();
	});

	const onDelete = async () => {
		if (vendorId === null) return;
		deleting.value = true;
		try {
			await store.remove(vendorId);
			toast.add({ title: "Vendor deleted", color: "info", icon: "i-lucide-trash-2" });
			confirmDelete.value = false;
			await router.replace("/vendors");
		} catch (err) {
			// bills FK references vendors(id) with NO ACTION. SQLite
			// throws when a bill still references this vendor —
			// translate that to a friendly nudge toward Archive
			// instead of dumping the raw SQL error on the user.
			const raw = err instanceof Error ? err.message : String(err);
			const isFkError = /foreign key|constraint|RESTRICT/i.test(raw);
			toast.add({
				title: isFkError ? "Can't delete — has bill history" : "Delete failed",
				description: isFkError
					? "This vendor has at least one bill. Archive instead — those bills need to stay intact."
					: raw,
				color: isFkError ? "warning" : "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			deleting.value = false;
		}
	};
</script>
