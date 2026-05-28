/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTADO GLOBAL REACTIVO - Media Library (Svelte 5 Runes)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Estado global para media files usando el sistema de reactividad de Svelte 5.
 *
 * ⚠️ IMPORTANTE: No usar stores antiguos (writable, readable, derived).
 * Svelte 5 Runes proporciona reactividad fina sin boilerplate.
 */
export interface MediaFile {
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    key: string;
    bucket: string;
    publicUrl: string | null;
    url?: string;
    thumbnails?: Record<string, {
        url: string;
        width: number;
        height: number;
    }>;
    width?: number;
    height?: number;
    folderId?: string | null;
    altText?: string;
    caption?: string;
    metadata?: Record<string, unknown>;
    status: string;
    createdAt: string;
    updatedAt: string;
    createdById?: string;
}
export interface MediaFolder {
    id: string;
    name: string;
    slug: string;
    parentId?: string | null;
    path: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
}
export interface UploadProgress {
    filename: string;
    progress: number;
    status: "pending" | "uploading" | "success" | "error";
    error?: string;
}
export declare class MediaStore {
    files: MediaFile[];
    folders: MediaFolder[];
    isLoading: boolean;
    isUploading: boolean;
    selectedFile: MediaFile | null;
    selectedFolder: MediaFolder | null;
    error: string | null;
    searchQuery: string;
    filterType: string;
    viewMode: "list" | "grid";
    uploadProgress: UploadProgress[];
    totalCount: number;
    filteredFiles: MediaFile[];
    private getFilteredFiles;
    imageFiles: MediaFile[];
    videoFiles: MediaFile[];
    documentFiles: MediaFile[];
    fetchFiles(folderId?: string, search?: string): Promise<void>;
    fetchFileById(id: string): Promise<MediaFile | null>;
    uploadFiles(files: FileList | File[], folderId?: string): Promise<boolean>;
    updateFile(id: string, updates: Partial<MediaFile>): Promise<MediaFile | null>;
    deleteFile(id: string): Promise<boolean>;
    fetchFolders(): Promise<void>;
    createFolder(name: string, parentId?: string): Promise<MediaFolder | null>;
    selectFile(file: MediaFile | null): void;
    selectFolder(folder: MediaFolder | null): void;
    setSearchQuery(query: string): void;
    setFilterType(type: string): void;
    setViewMode(mode: "grid" | "list"): void;
    clearError(): void;
    reset(): void;
    getFileUrl(file: MediaFile, size?: "small" | "medium" | "large"): string;
    getFileIcon(mimeType: string): string;
    formatFileSize(bytes: number): string;
}
export declare const mediaStore: MediaStore;
//# sourceMappingURL=media.svelte.d.ts.map