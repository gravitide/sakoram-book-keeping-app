<template>
	<!-- Minimal layout: no sidebar, no chrome. The welcome screen lives
	outside the per-tenant context, so we don't load settings or anything
	else that touches the DB here. -->
	<div class="h-screen flex flex-col bg-(--ui-bg-muted)">
		<TitleBar />
		<div class="flex-1 min-h-0 overflow-auto">
			<div class="min-h-full flex items-center justify-center p-6">
				<slot />
			</div>
		</div>
	</div>
</template>
