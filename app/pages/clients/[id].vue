<template>
	<div class="select-none">
		<!-- select-none on the page root: chrome / labels aren't
			selectable; form inputs stay selectable via the rule in
			main.css that puts user-select:text back on input / textarea
			/ [contenteditable] inside select-none containers. -->
		<!-- Crumb / back link --------------------------------------------- -->
		<NuxtLink to="/clients" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1 mb-4">
			<UIcon name="i-lucide-arrow-left" class="size-4" />
			Back to clients
		</NuxtLink>

		<!-- Identity hero -------------------------------------------------- -->
		<section class="mb-10">
			<div class="flex flex-col md:flex-row md:items-center gap-6">
				<!-- Avatar: initials over a tinted background. Clients don't
					have uploaded logos, but the visual weight of an avatar
					makes the page feel less flat than a bare form. -->
				<div
					class="size-32 shrink-0 rounded-2xl border border-(--ui-border) bg-(--ui-bg-muted) flex items-center justify-center overflow-hidden"
				>
					<span
						v-if="initials"
						class="font-semibold text-3xl tracking-tight text-(--ui-primary)"
					>
						{{ initials }}
					</span>
					<UIcon v-else name="i-lucide-user-round" class="size-10 text-(--ui-text-muted)" />
				</div>

				<!-- Identity summary -->
				<div class="flex-1 min-w-0">
					<h1 class="text-3xl font-semibold leading-tight truncate flex items-center gap-3">
						{{ isNew ? "New client" : (form.name || "Untitled client") }}
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
					<div v-if="!isNew" class="mt-4 flex flex-wrap items-center gap-2">
						<UButton
							:icon="isArchived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
							size="xs"
							variant="soft"
							color="neutral"
							@click="toggleArchive"
						>
							{{ isArchived ? "Restore client" : "Archive client" }}
						</UButton>
					</div>
				</div>
			</div>
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
						<UInput v-model="form.name" placeholder="Acme (Pvt) Ltd" />
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
							placeholder="hello@acme.lk"
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
					subtitle="Printed on every issued document for this client."
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
					subtitle="Visible only to you — never appears on a client-facing PDF."
					class="lg:col-span-2"
				>
					<UFormField name="notes">
						<UTextarea
							v-model="form.notes"
							:rows="4"
							placeholder="Anything you want to remember about this client"
							class="w-full"
						/>
					</UFormField>
				</SectionCard>
			</div>

			<!-- Sticky save bar — same pattern as Settings → Company. Pinned
				to the bottom of the scrollable <main> ancestor; appears only
				when the form is dirty. On a brand-new client the form
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
							{{ isNew ? "Create client" : "Save changes" }}
						</UButton>
					</div>
				</div>
			</div>
		</UForm>
	</div>
</template>

<script setup lang="ts">
	import type { ClientInput } from "~/stores/clients";
	import { z } from "zod";
	import { useClientsStore } from "~/stores/clients";

	definePageMeta({ title: "Client" });

	const route = useRoute();
	const router = useRouter();
	const store = useClientsStore();
	const toast = useToast();

	const idParam = String(route.params.id ?? "");
	const isNew = idParam === "new";
	const clientId = isNew ? null : Number(idParam);
	if (!isNew && (!Number.isFinite(clientId) || clientId === null)) {
		throw createError({ statusCode: 404, statusMessage: "Client not found" });
	}

	const form = reactive<ClientInput>({
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

	const isArchived = ref(false);
	const saving = ref(false);

	// Derive a 1–2-character avatar label from the name. Falls back to a
	// generic user icon if the field is empty (e.g. on the New client page
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

	if (!isNew && clientId !== null) {
		const row = await store.get(clientId);
		if (!row) {
			throw createError({ statusCode: 404, statusMessage: "Client not found" });
		}
		hydrate(row);
	}

	// Dirty tracking via JSON snapshot. Re-baselined after save / discard.
	// On the new-client path the baseline is the empty form, so any
	// keystroke flips dirty true and surfaces the sticky save bar.
	const formSnapshot = computed(() => JSON.stringify(form));
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};

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
				toast.add({ title: "Client created", color: "success", icon: "i-lucide-check" });
				await router.replace(`/clients/${id}`);
			} else if (clientId !== null) {
				await store.update(clientId, { ...form });
				refreshBaseline();
				toast.add({ title: "Client updated", color: "success", icon: "i-lucide-check" });
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
			await router.push("/clients");
			return;
		}
		if (clientId !== null) {
			const row = await store.get(clientId);
			if (row) {
				hydrate(row);
				refreshBaseline();
				toast.add({ title: "Changes discarded", color: "info", icon: "i-lucide-rotate-ccw" });
			}
		}
	};

	const toggleArchive = async () => {
		if (clientId === null) return;
		try {
			await store.setArchived(clientId, !isArchived.value);
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
</script>
