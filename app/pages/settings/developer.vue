<template>
	<div class="select-none">
		<!-- Developer options are per-machine UI prefs (localStorage via
			useUiState), not business data — so there is no save bar: each
			switch applies the moment it is flipped, and nothing here rides
			along in a backup. Everything defaults OFF in every build, dev
			and production alike. -->
		<header class="mb-6 max-w-2xl mx-auto">
			<h1 class="text-2xl font-semibold">
				Developer
			</h1>
			<p class="text-sm text-(--ui-text-muted)">
				Diagnostic aids for designing and troubleshooting the interface. These
				apply to this computer only and are off unless you turn them on.
			</p>
		</header>

		<div class="space-y-6 max-w-2xl mx-auto">
			<UCard id="breakpoint-badge" class="scroll-mt-6">
				<template #header>
					<div class="font-medium">
						Layout
					</div>
				</template>

				<div class="flex items-start justify-between gap-4">
					<div>
						<div class="text-sm font-medium">
							Show breakpoint badge
						</div>
						<div class="text-xs text-(--ui-text-muted) mt-1">
							A small chip in the bottom-right corner showing the active
							layout breakpoint (XS – 2XL) and the window width in pixels.
						</div>
					</div>
					<USwitch
						:model-value="showBreakpointBadge"
						aria-label="Show breakpoint badge"
						@update:model-value="setShowBreakpointBadge"
					/>
				</div>
			</UCard>
		</div>
	</div>
</template>

<script setup lang="ts">
	definePageMeta({ title: "Developer" });

	const { showBreakpointBadge, setShowBreakpointBadge } = useUiState();
</script>
