<template>
	<Html class="overflow-x-hidden">
		<Body class="font-sans antialiased">
			<!-- Toasts pop at the top-centre so they don't fight the
				sticky save bar pinned to the bottom-right of the
				content area on every detail / settings page. -->
			<UApp :toaster="{ position: 'top-center' }">
				<NuxtLayout>
					<NuxtPage />
				</NuxtLayout>
			</UApp>
		</Body>
	</Html>
</template>
