<template>
	<div class="select-none">
		<!-- select-none on the page root: this list is for navigating to
			employees, not copying cell text out of the table. -->
		<header class="mb-6 flex items-end justify-between gap-4 flex-wrap">
			<div>
				<h1 class="text-2xl font-semibold">
					Employees
				</h1>
				<p class="text-sm text-(--ui-text-muted)">
					{{ store.activeCount }} active · {{ store.archivedCount }} archived
				</p>
			</div>
			<UButton icon="i-lucide-plus" @click="newEmployee">
				New employee
			</UButton>
		</header>

		<UCard>
			<template #header>
				<div class="flex items-center justify-between gap-4 flex-wrap">
					<UInput
						v-model="store.search"
						placeholder="Search by name, employee #, designation, email, phone, NIC…"
						icon="i-lucide-search"
						class="md:w-96"
					/>
					<div class="flex items-center gap-3">
						<UCheckbox v-model="store.showArchived" label="Show archived" />
						<UButton
							size="md"
							variant="soft"
							color="neutral"
							icon="i-lucide-table-columns-split"
							title="Auto-size columns to their content"
							@click="autoFitColumns"
						>
							Auto-fit columns
						</UButton>
					</div>
				</div>
			</template>

			<div v-if="store.loading" class="py-12 text-center text-sm text-(--ui-text-muted)">
				Loading employees…
			</div>
			<div v-else-if="store.error" class="py-12 text-center text-sm text-(--ui-error)">
				{{ store.error }}
			</div>
			<div v-else-if="store.filtered.length === 0" class="py-12 text-center text-sm text-(--ui-text-muted)">
				<UIcon name="i-lucide-users-round" class="size-10 mx-auto mb-2 opacity-50" />
				<div v-if="store.employees.length === 0">
					No employees yet. Click <span class="font-medium">New employee</span> to add the first one.
				</div>
				<div v-else>
					No employees match your filters.
				</div>
			</div>

			<ResizableDataTable
				v-else
				ref="tableRef"
				:rows="store.filtered"
				state-key="employees-table"
				:row-actions="itemsFor"
				default-sort-field="full_name"
				:default-sort-order="1"
				@row-click="(row) => router.push(`/employees/${row.id}`)"
			>
				<!-- Name first so it's the leading (clickable) column on
					the row — Employee # is nullable and several employees
					may not have one assigned. -->
				<Column field="full_name" header="Name" sortable>
					<template #body="{ data }">
						<div class="truncate font-medium flex items-center gap-2">
							{{ data.full_name }}
							<UBadge v-if="data.is_archived === 1" color="neutral" variant="subtle" size="sm">
								Archived
							</UBadge>
						</div>
					</template>
				</Column>
				<Column field="employee_number" header="Employee #" sortable>
					<template #body="{ data }">
						<div class="truncate tabular-nums text-(--ui-text-muted)">
							{{ data.employee_number || "—" }}
						</div>
					</template>
				</Column>
				<Column field="designation" header="Designation" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.designation || "—" }}
						</div>
					</template>
				</Column>
				<Column field="nic" header="NIC" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.nic || "—" }}
						</div>
					</template>
				</Column>
				<Column field="phone" header="Phone" sortable>
					<template #body="{ data }">
						<div class="truncate text-(--ui-text-muted)">
							{{ data.phone || "—" }}
						</div>
					</template>
				</Column>
				<Column
					field="basic_salary_cents"
					header="Basic salary"
					sortable
					:style="{ textAlign: 'right' }"
				>
					<template #body="{ data }">
						<div class="truncate text-right tabular-nums">
							{{ formatMoney(data.basic_salary_cents) }}
						</div>
					</template>
				</Column>
			</ResizableDataTable>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { EmployeeRow } from "~/stores/employees";
	import { formatMoney } from "~/lib/money";
	import { useEmployeesStore } from "~/stores/employees";

	definePageMeta({ title: "Employees" });

	const store = useEmployeesStore();
	const toast = useToast();
	const router = useRouter();

	await store.load();

	const tableRef = ref<{ autoFit: () => void } | null>(null);
	const autoFitColumns = () => tableRef.value?.autoFit();

	const newEmployee = () => router.push("/employees/new");

	const toggleArchive = async (e: EmployeeRow) => {
		const goingToArchive = e.is_archived === 0;
		try {
			await store.setArchived(e.id, goingToArchive);
			toast.add({
				title: goingToArchive ? "Employee archived" : "Employee restored",
				color: "info",
				icon: goingToArchive ? "i-lucide-archive" : "i-lucide-archive-restore"
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

	// Two-group menu: lifecycle (Edit / Archive) + payroll actions.
	// Archived employees can still have payslips viewed but no new ones
	// created — hence the conditional on "Create payslip".
	function itemsFor(e: EmployeeRow) {
		const lifecycle = [
			{
				label: "Edit",
				icon: "i-lucide-pencil",
				onSelect: () => router.push(`/employees/${e.id}`)
			},
			{
				label: e.is_archived === 0 ? "Archive" : "Restore",
				icon: e.is_archived === 0 ? "i-lucide-archive" : "i-lucide-archive-restore",
				onSelect: () => {
					void toggleArchive(e);
				}
			}
		];
		const payroll: { label: string, icon: string, onSelect: () => void }[] = [
			{
				label: "View payslips",
				icon: "i-lucide-list",
				onSelect: () => router.push(`/payslips?employee=${e.id}`)
			}
		];
		if (e.is_archived === 0) {
			payroll.unshift({
				label: "Create payslip",
				icon: "i-lucide-receipt",
				onSelect: () => router.push(`/payslips?new=1&employee=${e.id}`)
			});
		}
		return [lifecycle, payroll];
	}
</script>
