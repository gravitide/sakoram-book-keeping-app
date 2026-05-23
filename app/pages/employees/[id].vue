<template>
	<div class="select-none">
		<!-- select-none on the page root: the management surface is for
			editing fields, not copying chrome / labels. Inputs stay
			selectable via the rule in main.css that puts user-select:text
			back on input / textarea / [contenteditable]. -->
		<NuxtLink to="/employees" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text) inline-flex items-center gap-1 mb-4">
			<UIcon name="i-lucide-arrow-left" class="size-4" />
			Back to employees
		</NuxtLink>

		<!-- Identity hero. Layout: avatar + name/chips on the left,
			action buttons cluster top-right. items-start so the buttons
			pin to the top edge of the row regardless of how the chips
			wrap underneath the name. -->
		<section class="mb-10">
			<div class="flex items-start gap-5 flex-wrap">
				<!-- Avatar — circular, primary-tinted background with the
					user's initials in the primary colour. Smaller and
					more "person-shaped" than the prior 128px rounded
					square (which read more like a company badge). Falls
					back to a generic user icon when initials aren't
					available (new employee, empty name). -->
				<div class="size-20 shrink-0 rounded-full bg-(--ui-primary)/15 flex items-center justify-center overflow-hidden">
					<span
						v-if="initials"
						class="font-semibold text-2xl tracking-tight text-(--ui-primary)"
					>
						{{ initials }}
					</span>
					<UIcon v-else name="i-lucide-user" class="size-8 text-(--ui-text-muted)" />
				</div>

				<div class="flex-1 min-w-0">
					<h1 class="text-3xl font-semibold leading-tight truncate flex items-center gap-3">
						{{ isNew ? "New employee" : (form.full_name || "Untitled employee") }}
						<UBadge v-if="!isNew && isArchived" color="neutral" variant="subtle">
							Archived
						</UBadge>
					</h1>
					<dl class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-(--ui-text-muted)">
						<div v-if="form.employee_number" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-hash" class="size-3.5" />
							<span class="tabular-nums">{{ form.employee_number }}</span>
						</div>
						<div v-if="form.designation" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-briefcase" class="size-3.5" />
							<span>{{ form.designation }}</span>
						</div>
						<div v-if="form.nic" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-id-card" class="size-3.5" />
							<span>NIC {{ form.nic }}</span>
						</div>
						<div v-if="form.email" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-mail" class="size-3.5" />
							<span>{{ form.email }}</span>
						</div>
						<div v-if="form.phone" class="flex items-center gap-1.5">
							<UIcon name="i-lucide-phone" class="size-3.5" />
							<span class="tabular-nums">{{ form.phone }}</span>
						</div>
						<div v-if="!form.employee_number && !form.designation && !form.nic && !form.email && !form.phone">
							{{ isNew
								? "Fill in the details below — name is the only required field."
								: "No details captured yet — add some below." }}
						</div>
					</dl>
				</div>

				<!-- Right cluster: header-level actions (Archive / Delete).
					Hidden for new employees since there's nothing to act
					on yet. Delete is for the "accidentally created an
					employee" case — the payslips FK has ON DELETE
					RESTRICT, so the DB blocks the hard-delete once any
					payslip is issued; the error surfaces as a friendly
					toast pointing the user at Archive instead. -->
				<div v-if="!isNew" class="flex items-center gap-2 shrink-0 ml-auto">
					<UButton
						:icon="isArchived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
						size="sm"
						variant="soft"
						color="neutral"
						@click="toggleArchive"
					>
						{{ isArchived ? "Restore employee" : "Archive employee" }}
					</UButton>
					<UButton
						icon="i-lucide-trash-2"
						size="sm"
						variant="soft"
						color="error"
						@click="confirmDelete = true"
					>
						Delete
					</UButton>
				</div>
			</div>
		</section>

		<UForm :schema="schema" :state="form" @submit="onSubmit">
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<SectionCard
					icon="i-lucide-id-card"
					title="Identity"
					subtitle="Who they are and how to reach them."
				>
					<UFormField label="Full name" name="full_name" required>
						<UInput v-model="form.full_name" placeholder="A. B. Perera" />
					</UFormField>
					<UFormField label="Employee number" name="employee_number" hint="Optional">
						<UInput
							v-model="form.employee_number"
							leading-icon="i-lucide-hash"
							placeholder="e.g. E001"
						/>
					</UFormField>
					<UFormField label="Designation" name="designation">
						<UInput
							v-model="form.designation"
							leading-icon="i-lucide-briefcase"
							placeholder="Accountant"
						/>
					</UFormField>
					<UFormField label="NIC" name="nic">
						<UInput
							v-model="form.nic"
							leading-icon="i-lucide-id-card"
							placeholder="200012345678"
						/>
					</UFormField>
					<UFormField label="Email" name="email">
						<UInput
							v-model="form.email"
							type="email"
							leading-icon="i-lucide-mail"
							placeholder="name@company.lk"
						/>
					</UFormField>
					<UFormField label="Phone" name="phone">
						<UInput
							v-model="form.phone"
							leading-icon="i-lucide-phone"
							placeholder="+94 ..."
						/>
					</UFormField>
				</SectionCard>

				<SectionCard
					icon="i-lucide-banknote"
					title="Employment"
					:subtitle="`Joining date and the headline monthly salary in ${currency.code}.`"
				>
					<UFormField label="Joining date" name="joining_date">
						<DateField v-model="form.joining_date" />
					</UFormField>
					<UFormField label="Basic monthly salary" name="basic_salary_cents">
						<MoneyInput v-model="form.basic_salary_cents" />
					</UFormField>
				</SectionCard>

				<SectionCard
					icon="i-lucide-map-pin"
					title="Address"
					subtitle="Optional — useful for HR records and EPF/ETF filings."
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
					icon="i-lucide-landmark"
					title="Bank for salary payments"
					subtitle="Printed on the payslip so the bank knows where to send the money."
				>
					<UFormField label="Bank name" name="bank_name">
						<UInput v-model="form.bank_name" />
					</UFormField>
					<UFormField label="Branch" name="bank_branch">
						<UInput v-model="form.bank_branch" />
					</UFormField>
					<UFormField label="Account number" name="bank_account_number">
						<UInput v-model="form.bank_account_number" />
					</UFormField>
					<UFormField label="Account name" name="bank_account_name">
						<UInput v-model="form.bank_account_name" />
					</UFormField>
				</SectionCard>

				<SectionCard
					icon="i-lucide-sticky-note"
					title="Internal notes"
					subtitle="Visible only to you — never appears on a payslip."
					class="lg:col-span-2"
				>
					<UFormField name="notes">
						<UTextarea
							v-model="form.notes"
							:rows="4"
							placeholder="Anything you want to remember about this employee"
							class="w-full"
						/>
					</UFormField>
				</SectionCard>
			</div>

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
							{{ isNew ? "Create employee" : "Save changes" }}
						</UButton>
					</div>
				</div>
			</div>
		</UForm>

		<!-- Delete confirmation. The DB protects employees with linked
			payslips via ON DELETE RESTRICT, so the destructive path is
			only available before any payslip is issued — see the
			handler below for the FK error fallback. -->
		<UModal v-model:open="confirmDelete" title="Delete this employee?">
			<template #body>
				<div class="space-y-3 text-sm">
					<p>
						This permanently removes <span class="font-medium">{{ form.full_name || "this employee" }}</span> from the address book.
					</p>
					<p class="text-(--ui-text-muted)">
						If a payslip has ever been issued for this employee,
						the database will refuse the delete — archive
						instead. Archived employees are hidden from pickers
						but their payslip history stays intact.
					</p>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2 w-full">
					<UButton color="neutral" variant="ghost" @click="confirmDelete = false">
						Cancel
					</UButton>
					<UButton color="error" :loading="deleting" icon="i-lucide-trash-2" @click="onDelete">
						Delete employee
					</UButton>
				</div>
			</template>
		</UModal>
	</div>
</template>

<script setup lang="ts">
	import type { EmployeeInput, EmployeeRow } from "~/stores/employees";
	import { z } from "zod";
	import { useActiveCurrency } from "~/composables/useActiveCurrency";
	import { useEmployeesStore } from "~/stores/employees";

	definePageMeta({ title: "Employee" });

	const route = useRoute();
	const router = useRouter();
	const store = useEmployeesStore();
	const toast = useToast();
	// Drives the dynamic "salary in {code}" subtitle on the Employment
	// card — reactive so it updates when the user changes currency in
	// Company settings without a reload.
	const currency = useActiveCurrency();

	const idParam = String(route.params.id ?? "");
	const isNew = idParam === "new";
	const employeeId = isNew ? null : Number(idParam);
	if (!isNew && (!Number.isFinite(employeeId) || employeeId === null)) {
		throw createError({ statusCode: 404, statusMessage: "Employee not found" });
	}

	const form = reactive<EmployeeInput>({
		full_name: "",
		employee_number: "",
		nic: "",
		designation: "",
		email: "",
		phone: "",
		address_line1: "",
		address_line2: "",
		city: "",
		postal_code: "",
		country: "Sri Lanka",
		joining_date: null,
		basic_salary_cents: 0,
		bank_name: "",
		bank_branch: "",
		bank_account_number: "",
		bank_account_name: "",
		notes: ""
	});

	const isArchived = ref(false);
	const saving = ref(false);
	const confirmDelete = ref(false);
	const deleting = ref(false);

	const initials = computed(() => {
		const raw = form.full_name?.trim() ?? "";
		if (!raw) return "";
		const parts = raw.split(/\s+/).filter(Boolean);
		const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
		return letters || raw[0]?.toUpperCase() || "";
	});

	const hydrate = (row: EmployeeRow) => {
		form.full_name = row.full_name;
		form.employee_number = row.employee_number ?? "";
		form.nic = row.nic ?? "";
		form.designation = row.designation ?? "";
		form.email = row.email ?? "";
		form.phone = row.phone ?? "";
		form.address_line1 = row.address_line1 ?? "";
		form.address_line2 = row.address_line2 ?? "";
		form.city = row.city ?? "";
		form.postal_code = row.postal_code ?? "";
		form.country = row.country ?? "Sri Lanka";
		form.joining_date = row.joining_date;
		form.basic_salary_cents = row.basic_salary_cents;
		form.bank_name = row.bank_name ?? "";
		form.bank_branch = row.bank_branch ?? "";
		form.bank_account_number = row.bank_account_number ?? "";
		form.bank_account_name = row.bank_account_name ?? "";
		form.notes = row.notes ?? "";
		isArchived.value = row.is_archived === 1;
	};

	if (!isNew && employeeId !== null) {
		const row = await store.get(employeeId);
		if (!row) {
			throw createError({ statusCode: 404, statusMessage: "Employee not found" });
		}
		hydrate(row);
	}

	const formSnapshot = computed(() => JSON.stringify(form));
	const baseline = ref<string>(formSnapshot.value);
	const dirty = computed(() => formSnapshot.value !== baseline.value);
	const refreshBaseline = () => {
		baseline.value = formSnapshot.value;
	};

	const schema = z.object({
		full_name: z.string().trim().min(1, "Name is required"),
		email: z.union([z.literal(""), z.string().email("Invalid email")]),
		basic_salary_cents: z.number().int().min(0, "Must be zero or positive")
	});

	type Schema = z.output<typeof schema>;

	const onSubmit = async (_event: { data: Schema }) => {
		saving.value = true;
		try {
			if (isNew) {
				const id = await store.create({ ...form });
				toast.add({ title: "Employee created", color: "success", icon: "i-lucide-check" });
				await router.replace(`/employees/${id}`);
			} else if (employeeId !== null) {
				await store.update(employeeId, { ...form });
				refreshBaseline();
				toast.add({ title: "Employee updated", color: "success", icon: "i-lucide-check" });
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
			await router.push("/employees");
			return;
		}
		if (employeeId !== null) {
			const row = await store.get(employeeId);
			if (row) {
				hydrate(row);
				refreshBaseline();
				toast.add({ title: "Changes discarded", color: "info", icon: "i-lucide-rotate-ccw" });
			}
		}
	};

	const toggleArchive = async () => {
		if (employeeId === null) return;
		try {
			await store.setArchived(employeeId, !isArchived.value);
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

	const onDelete = async () => {
		if (employeeId === null) return;
		deleting.value = true;
		try {
			await store.remove(employeeId);
			toast.add({ title: "Employee deleted", color: "info", icon: "i-lucide-trash-2" });
			confirmDelete.value = false;
			await router.replace("/employees");
		} catch (err) {
			// SQLite throws a foreign-key constraint error when a payslip
			// still references this employee (ON DELETE RESTRICT). Translate
			// that into a friendly nudge toward Archive instead of dumping
			// the raw SQL error on the user.
			const raw = err instanceof Error ? err.message : String(err);
			const isFkError = /foreign key|constraint|RESTRICT/i.test(raw);
			toast.add({
				title: isFkError ? "Can't delete — has payslip history" : "Delete failed",
				description: isFkError
					? "This employee has at least one issued payslip. Archive instead — payslips need to stay intact."
					: raw,
				color: isFkError ? "warning" : "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			deleting.value = false;
		}
	};
</script>
