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
// ═══════════════════════════════════════════════════════════════════════════
// Configuración
// ═══════════════════════════════════════════════════════════════════════════
const API_URL = import.meta.env.VITE_API_URL ?? "";
// ═══════════════════════════════════════════════════════════════════════════
// MediaStore - Estado Reactivo Global
// ═══════════════════════════════════════════════════════════════════════════
export class MediaStore {
    // ─── Estado Core ───
    files = $state([]);
    folders = $state([]);
    isLoading = $state(false);
    isUploading = $state(false);
    selectedFile = $state(null);
    selectedFolder = $state(null);
    error = $state(null);
    searchQuery = $state("");
    filterType = $state(""); // "image", "video", "document", ""
    viewMode = $state("grid");
    uploadProgress = $state([]);
    // ─── Estado Derivado ───
    totalCount = $derived(this.files.length);
    filteredFiles = $derived(this.getFilteredFiles());
    getFilteredFiles() {
        let result = this.files;
        // Filter by folder
        if (this.selectedFolder) {
            result = result.filter(f => f.folderId === this.selectedFolder.id);
        }
        else {
            result = result.filter(f => !f.folderId);
        }
        // Filter by search query
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            result = result.filter(f => f.filename.toLowerCase().includes(q) ||
                f.originalName.toLowerCase().includes(q));
        }
        // Filter by type
        if (this.filterType) {
            result = result.filter(f => f.mimeType.startsWith(`${this.filterType}/`));
        }
        return result;
    }
    imageFiles = $derived(this.files.filter(f => f.mimeType.startsWith("image/")));
    videoFiles = $derived(this.files.filter(f => f.mimeType.startsWith("video/")));
    documentFiles = $derived(this.files.filter(f => f.mimeType.includes("pdf") ||
        f.mimeType.includes("doc") ||
        f.mimeType.includes("text")));
    // ═══════════════════════════════════════════════════════════════════════════
    // Métodos CRUD - Files
    // ═══════════════════════════════════════════════════════════════════════════
    async fetchFiles(folderId, search) {
        this.isLoading = true;
        this.error = null;
        try {
            const params = new URLSearchParams();
            if (folderId)
                params.set("folderId", folderId);
            if (search)
                params.set("search", search);
            params.set("limit", "100");
            const response = await fetch(`${API_URL}/api/media?${params}`, {
                credentials: "include"
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            this.files = data.docs || [];
        }
        catch (err) {
            this.error = err instanceof Error ? err.message : "Failed to fetch files";
            console.error("[MediaStore] fetchFiles error:", err);
        }
        finally {
            this.isLoading = false;
        }
    }
    async fetchFileById(id) {
        try {
            const response = await fetch(`${API_URL}/api/media/${id}`, {
                credentials: "include"
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const file = await response.json();
            this.selectedFile = file;
            return file;
        }
        catch (err) {
            this.error = err instanceof Error ? err.message : `Failed to fetch file ${id}`;
            return null;
        }
    }
    async uploadFiles(files, folderId) {
        const fileArray = Array.from(files);
        if (fileArray.length === 0)
            return false;
        this.isUploading = true;
        this.uploadProgress = fileArray.map(f => ({
            filename: f.name,
            progress: 0,
            status: "pending",
        }));
        try {
            const formData = new FormData();
            fileArray.forEach(file => formData.append("files", file));
            const params = new URLSearchParams();
            if (folderId)
                params.set("folderId", folderId);
            const response = await fetch(`${API_URL}/api/media/upload?${params}`, {
                method: "POST",
                credentials: "include",
                body: formData,
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            const result = await response.json();
            // Update progress
            this.uploadProgress = this.uploadProgress.map(p => ({
                ...p,
                progress: 100,
                status: "success",
            }));
            // Refresh file list
            await this.fetchFiles(folderId);
            return result.success;
        }
        catch (err) {
            this.error = err instanceof Error ? err.message : "Upload failed";
            this.uploadProgress = this.uploadProgress.map(p => ({
                ...p,
                status: "error",
                error: this.error || "Upload failed",
            }));
            return false;
        }
        finally {
            this.isUploading = false;
            // Clear progress after a delay
            setTimeout(() => {
                this.uploadProgress = [];
            }, 3000);
        }
    }
    async updateFile(id, updates) {
        try {
            const response = await fetch(`${API_URL}/api/media/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(updates),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const updated = await response.json();
            this.files = this.files.map(f => f.id === id ? updated : f);
            if (this.selectedFile?.id === id) {
                this.selectedFile = updated;
            }
            return updated;
        }
        catch (err) {
            this.error = err instanceof Error ? err.message : "Failed to update file";
            return null;
        }
    }
    async deleteFile(id) {
        if (!confirm("Are you sure you want to delete this file?"))
            return false;
        try {
            const response = await fetch(`${API_URL}/api/media/${id}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            this.files = this.files.filter(f => f.id !== id);
            if (this.selectedFile?.id === id) {
                this.selectedFile = null;
            }
            return true;
        }
        catch (err) {
            this.error = err instanceof Error ? err.message : "Failed to delete file";
            return false;
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Métodos CRUD - Folders
    // ═══════════════════════════════════════════════════════════════════════════
    async fetchFolders() {
        try {
            const response = await fetch(`${API_URL}/api/media/folders`, {
                credentials: "include"
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            this.folders = data.docs || [];
        }
        catch (err) {
            this.error = err instanceof Error ? err.message : "Failed to fetch folders";
        }
    }
    async createFolder(name, parentId) {
        try {
            const parent = parentId ? this.folders.find(f => f.id === parentId) : null;
            const response = await fetch(`${API_URL}/api/media/folders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name,
                    parentId,
                    parentPath: parent?.path,
                }),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const newFolder = await response.json();
            this.folders = [...this.folders, newFolder];
            return newFolder;
        }
        catch (err) {
            this.error = err instanceof Error ? err.message : "Failed to create folder";
            return null;
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Métodos de UI State
    // ═══════════════════════════════════════════════════════════════════════════
    selectFile(file) {
        this.selectedFile = file;
    }
    selectFolder(folder) {
        this.selectedFolder = folder;
        this.fetchFiles(folder?.id);
    }
    setSearchQuery(query) {
        this.searchQuery = query;
    }
    setFilterType(type) {
        this.filterType = type;
    }
    setViewMode(mode) {
        this.viewMode = mode;
    }
    clearError() {
        this.error = null;
    }
    reset() {
        this.files = [];
        this.folders = [];
        this.selectedFile = null;
        this.selectedFolder = null;
        this.error = null;
        this.searchQuery = "";
        this.filterType = "";
        this.isLoading = false;
        this.isUploading = false;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // Utilidades
    // ═══════════════════════════════════════════════════════════════════════════
    getFileUrl(file, size) {
        if (size && file.thumbnails?.[size]) {
            return file.thumbnails[size].url;
        }
        return file.url || file.publicUrl || "";
    }
    getFileIcon(mimeType) {
        if (mimeType.startsWith("image/"))
            return "🖼️";
        if (mimeType.startsWith("video/"))
            return "🎬";
        if (mimeType.includes("pdf"))
            return "📄";
        if (mimeType.includes("doc"))
            return "📝";
        return "📎";
    }
    formatFileSize(bytes) {
        if (bytes === 0)
            return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Instancia Singleton
// ═══════════════════════════════════════════════════════════════════════════
export const mediaStore = new MediaStore();
//# sourceMappingURL=media.svelte.js.map