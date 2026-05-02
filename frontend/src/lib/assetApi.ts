import apiClient from "./apiClient";
import type { Folder, FolderTree, HydrofoilAsset } from "../types/assets";

export const assetApi = {
  // ---------- Folders ----------
  getFolderTree: (projectId: number) =>
    apiClient.get<FolderTree>(`/api/folders/tree/`, {
      params: { project: projectId },
    }),

  createFolder: (data: {
    project: number;
    name: string;
    parent?: number | null;
  }) => apiClient.post<Folder>(`/api/folders/`, data),

  renameFolder: (id: number, name: string) =>
    apiClient.patch<Folder>(`/api/folders/${id}/`, { name }),

  moveFolder: (id: number, parent: number | null) =>
    apiClient.patch<Folder>(`/api/folders/${id}/move/`, { parent }),

  deleteFolder: (id: number, force = false) =>
    apiClient.delete(`/api/folders/${id}/${force ? "?force=true" : ""}`),

  // ---------- Assets ----------
  uploadAsset: (data: FormData, onProgress?: (pct: number) => void) =>
    apiClient.post<HydrofoilAsset>(`/api/assets/`, data, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (e.total && onProgress)
          onProgress(Math.round((e.loaded / e.total) * 100));
      },
    }),

  renameAsset: (id: number, name: string) =>
    apiClient.patch<HydrofoilAsset>(`/api/assets/${id}/rename/`, { name }),

  moveAsset: (id: number, folder: number | null) =>
    apiClient.patch<HydrofoilAsset>(`/api/assets/${id}/move/`, { folder }),

  deleteAsset: (id: number, force = false) =>
    apiClient.delete(`/api/assets/${id}/${force ? "?force=true" : ""}`),
};
