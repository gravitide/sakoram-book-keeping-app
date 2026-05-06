<template>
	<!-- Minimal layout: no sidebar, no chrome. The welcome screen lives
	outside the per-tenant context, so we don't load settings or anything
	else that touches the DB here. -->
	<div class="h-screen w-full overflow-auto bg-(--ui-bg-muted)">
		<div class="min-h-full flex items-center justify-center p-6">
			<slot />
		</div>
	</div>
</template>
