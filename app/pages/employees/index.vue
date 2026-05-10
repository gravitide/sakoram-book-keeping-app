<template>
	<div>
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
					<UCheckbox v-model="store.showArchived" label="Show archived" />
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

			<table v-else class="w-full text-sm">
				<thead class="text-left text-xs uppercase tracking-wide text-(--ui-text-muted) border-b border-(--ui-border)">
					<tr>
						<SortableTh
							th-class="py-2 pl-3 pr-2 font-medium"
							:active="list.sortKey === 'employee_number'"
							:dir="list.sortDir"
							@sort="list.toggleSort('employee_number')"
						>
							Employee #
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'full_name'"
							:dir="list.sortDir"
							@sort="list.toggleSort('full_name')"
						>
							Name
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'designation'"
							:dir="list.sortDir"
							@sort="list.toggleSort('designation')"
						>
							Designation
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'nic'"
							:dir="list.sortDir"
							@sort="list.toggleSort('nic')"
						>
							NIC
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium"
							:active="list.sortKey === 'phone'"
							:dir="list.sortDir"
							@sort="list.toggleSort('phone')"
						>
							Phone
						</SortableTh>
						<SortableTh
							th-class="py-2 px-2 font-medium text-right"
							:active="list.sortKey === 'basic_salary_cents'"
							:dir="list.sortDir"
							@sort="list.toggleSort('basic_salary_cents')"
						>
							Basic salary
						</SortableTh>
						<th class="py-2 pl-2 pr-3 w-10" />
					</tr>
				</thead>
				<tbody>
					<!-- Right-click any row → same actions menu as the
						overflow ⋯ button. Reka UI's as-child trigger keeps
						the <tr> as the actual DOM element so the table
						layout stays valid. Same pattern the payslips list
						uses. -->
					<UContextMenu
						v-for="e in list.paged"
						:key="e.id"
						:items="itemsFor(e)"
					>
						<tr
							class="border-b border-(--ui-border)/60 last:border-0 hover:bg-(--ui-bg-muted) cursor-pointer"
							@click="openEmployee(e)"
						>
							<td class="py-2 pl-3 pr-2 font-medium tabular-nums text-(--ui-text-muted)">
								{{ e.employee_number || "—" }}
							</td>
							<td class="py-2 px-2 font-medium">
								<span class="flex items-center gap-2">
									{{ e.full_name }}
									<UBadge v-if="e.is_archived === 1" color="neutral" variant="subtle" size="sm">
										Archived
									</UBadge>
								</span>
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted)">
								{{ e.designation || "—" }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted)">
								{{ e.nic || "—" }}
							</td>
							<td class="py-2 px-2 text-(--ui-text-muted)">
								{{ e.phone || "—" }}
							</td>
							<td class="py-2 px-2 text-right tabular-nums">
								{{ formatMoney(e.basic_salary_cents) }}
							</td>
							<td class="py-2 pl-2 pr-3 text-right" @click.stop>
								<UDropdownMenu :items="itemsFor(e)">
									<UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
								</UDropdownMenu>
							</td>
						</tr>
					</UContextMenu>
				</tbody>
			</table>

			<ListPagination
				v-model:page="list.page"
				v-model:page-size="list.pageSize"
				:total="list.total"
				:total-pages="list.totalPages"
				:range-start="list.rangeStart"
				:range-end="list.rangeEnd"
			/>
		</UCard>
	</div>
</template>

<script setup lang="ts">
	import type { EmployeeRow } from "~/stores/employees";
	import { useListView } from "~/composables/useListView";
	import { formatMoney } from "~/lib/money";
	import { useEmployeesStore } from "~/stores/employees";

	definePageMeta({ title: "Employees" });

	const store = useEmployeesStore();
	const toast = useToast();
	const router = useRouter();

	await store.load();

	const list = useListView<EmployeeRow>(
		() => store.filtered,
		[
			{ key: "employee_number", getValue: (e) => e.employee_number },
			{ key: "full_name", getValue: (e) => e.full_name },
			{ key: "designation", getValue: (e) => e.designation },
			{ key: "nic", getValue: (e) => e.nic },
			{ key: "phone", getValue: (e) => e.phone },
			{ key: "basic_salary_cents", getValue: (e) => e.basic_salary_cents }
		],
		{ defaultSortKey: "full_name", defaultDir: "asc" }
	);

	const newEmployee = () => router.push("/employees/new");
	const openEmployee = (e: EmployeeRow) => router.push(`/employees/${e.id}`);
	const createPayslip = (e: EmployeeRow) => router.push(`/payslips/new?employee=${e.id}`);

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

	const itemsFor = (e: EmployeeRow) => {
		const lifecycle = [
			{
				label: "Edit",
				icon: "i-lucide-pencil",
				onSelect: () => openEmployee(e)
			},
			{
				label: e.is_archived === 0 ? "Archive" : "Restore",
				icon: e.is_archived === 0 ? "i-lucide-archive" : "i-lucide-archive-restore",
				onSelect: () => toggleArchive(e)
			}
		];
		if (e.is_archived === 1) return [lifecycle];
		const payroll = [
			{
				label: "Create payslip",
				icon: "i-lucide-receipt",
				onSelect: () => createPayslip(e)
			}
		];
		return [lifecycle, payroll];
	};
</script>
