<template>
	<Html class="overflow-x-hidden">
		<Body class="font-sans antialiased">
			<!-- Toasts pop at the top-centre so they don't fight the
				sticky save bar pinned to the bottom-right of the
				content area on every detail / settings page. -->
			<UApp :toaster="{ position: 'top-center' }">
				<!-- Top-of-viewport progress bar that animates whenever
					a route transition is in flight. Combined with the
					"data load in onMounted, not top-level await"
					pattern on list pages, this gives the user a clear
					"something is happening" cue without freezing the
					UI — the new page renders instantly with its own
					in-place loading indicator. -->
				<NuxtLoadingIndicator color="var(--ui-primary)" :height="2" />
				<NuxtLayout>
					<NuxtPage />
				</NuxtLayout>
			</UApp>
		</Body>
	</Html>
</template>
