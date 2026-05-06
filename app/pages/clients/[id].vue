<template>
	<div>
		<header class="mb-6 flex items-start justify-between gap-4">
			<div>
				<NuxtLink to="/clients" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) flex items-center gap-1">
					<UIcon name="i-lucide-arrow-left" class="size-4" />
					Back to clients
				</NuxtLink>
				<h1 class="text-2xl font-semibold mt-1 flex items-center gap-2">
					{{ isNew ? "New client" : form.name || "Client" }}
					<UBadge v-if="!isNew && isArchived" color="neutral" variant="subtle">
						Archived
					</UBadge>
				</h1>
			</div>
			<div v-if="!isNew" class="flex gap-2">
				<UButton
					:icon="isArchived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
					color="neutral"
					variant="outline"
					@click="toggleArchive"
				>
					{{ isArchived ? "Restore" : "Archive" }}
				</UButton>
			</div>
		</header>

		<UForm :schema="schema" :state="form" class="space-y-6" @submit="onSubmit">
			<UCard>
				<template #header>
					<div class="font-medium">
						Identity
					</div>
				</template>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Name" name="name" required>
						<UInput v-model="form.name" />
					</UFormField>
					<UFormField label="Contact person" name="contact_person">
						<UInput v-model="form.contact_person" />
					</UFormField>
					<UFormField label="Email" name="email">
						<UInput v-model="form.email" type="email" />
					</UFormField>
					<UFormField label="Phone" name="phone">
						<UInput v-model="form.phone" />
					</UFormField>
					<UFormField label="Tax / VAT ID" name="tax_id" class="md:col-span-2">
						<UInput v-model="form.tax_id" />
					</UFormField>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Address
					</div>
				</template>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<UFormField label="Address line 1" name="address_line1" class="md:col-span-2">
						<UInput v-model="form.address_line1" />
					</UFormField>
					<UFormField label="Address line 2" name="address_line2" class="md:col-span-2">
						<UInput v-model="form.address_line2" />
					</UFormField>
					<UFormField label="City" name="city">
						<UInput v-model="form.city" />
					</UFormField>
					<UFormField label="Postal code" name="postal_code">
						<UInput v-model="form.postal_code" />
					</UFormField>
					<UFormField label="Country" name="country" class="md:col-span-2">
						<UInput v-model="form.country" />
					</UFormField>
				</div>
			</UCard>

			<UCard>
				<template #header>
					<div class="font-medium">
						Notes
					</div>
				</template>
				<UTextarea v-model="form.notes" :rows="4" placeholder="Internal notes about this client" />
			</UCard>

			<div class="flex justify-end gap-2 pt-2">
				<UButton type="button" color="neutral" variant="outline" @click="router.push('/clients')">
					Cancel
				</UButton>
				<UButton type="submit" :loading="saving" icon="i-lucide-save">
					{{ isNew ? "Create client" : "Save changes" }}
				</UButton>
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
	const loading = ref(!isNew);
	const saving = ref(false);

	if (!isNew && clientId !== null) {
		const row = await store.get(clientId);
		if (!row) {
			throw createError({ statusCode: 404, statusMessage: "Client not found" });
		}
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
		loading.value = false;
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
				toast.add({ title: "Client created", color: "success", icon: "i-lucide-check" });
				await router.replace(`/clients/${id}`);
			} else if (clientId !== null) {
				await store.update(clientId, { ...form });
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
