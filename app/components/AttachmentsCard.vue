<template>
	<UCard>
		<template #header>
			<div class="app-chrome flex items-center justify-between gap-3 flex-wrap">
				<div>
					<div class="app-chrome font-medium">
						Attachments
					</div>
					<div class="text-xs text-(--ui-text-muted) mt-0.5">
						<span v-if="store.attachments.length === 0">No files attached yet — add a scan or snap a photo from your phone.</span>
						<span v-else>{{ store.attachments.length }} file{{ store.attachments.length === 1 ? "" : "s" }} attached.</span>
					</div>
				</div>
				<div v-if="!disabled" class="flex gap-2">
					<UButton
						size="xs"
						variant="soft"
						icon="i-lucide-upload"
						:loading="uploadingLocal"
						@click="onUploadLocal"
					>
						Upload
					</UButton>
					<UButton
						size="xs"
						variant="soft"
						icon="i-lucide-smartphone"
						@click="showPhoneModal = true"
					>
						Upload using phone
					</UButton>
				</div>
			</div>
		</template>

		<div v-if="store.attachments.length === 0" class="py-6 text-center text-sm text-(--ui-text-muted)">
			<UIcon name="i-lucide-paperclip" class="size-8 mx-auto mb-2 opacity-50" />
			<div v-if="disabled">
				{{ disabledHint || "Attachments can't be added right now." }}
			</div>
			<div v-else>
				Attach receipts, signed copies, or supporting scans.
			</div>
		</div>
		<div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
			<div
				v-for="att in store.attachments"
				:key="att.id"
				class="group relative rounded-lg border border-(--ui-border) overflow-hidden bg-(--ui-bg-muted)"
			>
				<button
					type="button"
					class="block w-full aspect-square"
					:title="`Open ${att.filename}`"
					@click="openAttachment(att.file_path)"
				>
					<img
						:src="thumbSrc(att.file_path)"
						:alt="att.filename"
						class="w-full h-full object-cover"
					>
				</button>
				<div class="px-2 py-1.5 text-xs">
					<div class="truncate text-(--ui-text)" :title="att.filename">
						{{ att.filename }}
					</div>
					<div class="text-(--ui-text-muted) flex items-center gap-1">
						<UIcon
							:name="att.source === 'phone' ? 'i-lucide-smartphone' : 'i-lucide-monitor'"
							class="size-3"
						/>
						{{ formatBytes(att.size_bytes) }}
					</div>
				</div>
				<UButton
					v-if="!disabled"
					color="error"
					variant="solid"
					size="xs"
					icon="i-lucide-trash-2"
					class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition"
					:title="`Delete ${att.filename}`"
					@click="onDeleteAttachment(att.id)"
				/>
			</div>
		</div>

		<PhoneUploadModal
			v-if="showPhoneModal"
			:document-type="documentType"
			:document-id="documentId"
			@uploaded="onPhonePhoto"
			@close="showPhoneModal = false"
		/>
	</UCard>
</template>

<script setup lang="ts">
// Attachments card — reused by the quote / invoice / bill / voucher
// detail pages. Files are stored on disk by Rust (the local file-import
// command or the phone-upload server); this card adds / lists / removes
// the metadata rows via the document_attachments store.
//
// `disabled` hides the upload + delete affordances but still shows the
// thumbnails — used by the voucher page, which is read-only until the
// user explicitly enters edit mode.

	import type { AttachmentFile, DocumentType } from "~/stores/document_attachments";
	import { convertFileSrc, invoke } from "@tauri-apps/api/core";
	import { useDocumentAttachmentsStore } from "~/stores/document_attachments";

	interface Props {
		documentType: DocumentType
		documentId: number
		disabled?: boolean
		disabledHint?: string
	}
	const props = withDefaults(defineProps<Props>(), { disabled: false, disabledHint: "" });

	const toast = useToast();
	const store = useDocumentAttachmentsStore();

	const showPhoneModal = ref(false);
	const uploadingLocal = ref(false);

	const formatBytes = (n: number): string => {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
		return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	};

	const thumbSrc = (path: string): string => convertFileSrc(path);

	const openAttachment = async (path: string) => {
		try {
			await invoke("open_path", { path });
		} catch (err) {
			toast.add({
				title: "Couldn't open file",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onUploadLocal = async () => {
		uploadingLocal.value = true;
		try {
			const added = await store.addLocal(props.documentType, props.documentId);
			if (added) {
				toast.add({ title: "Attachment added", color: "success", icon: "i-lucide-check" });
			}
		} catch (err) {
			toast.add({
				title: "Upload failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		} finally {
			uploadingLocal.value = false;
		}
	};

	// Fired by PhoneUploadModal for each photo the phone pushes over the LAN.
	const onPhonePhoto = async (file: AttachmentFile) => {
		try {
			await store.add(props.documentType, props.documentId, file, "phone");
			toast.add({ title: "Photo attached from phone", color: "success", icon: "i-lucide-smartphone" });
		} catch (err) {
			toast.add({
				title: "Couldn't attach photo",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	const onDeleteAttachment = async (id: number) => {
		try {
			await store.remove(id);
			toast.add({ title: "Attachment removed", color: "info", icon: "i-lucide-trash-2" });
		} catch (err) {
			toast.add({
				title: "Delete failed",
				description: err instanceof Error ? err.message : String(err),
				color: "error",
				icon: "i-lucide-circle-alert"
			});
		}
	};

	onMounted(() => {
		store.load(props.documentType, props.documentId).catch(() => { /* surfaced on interaction */ });
	});
</script>
