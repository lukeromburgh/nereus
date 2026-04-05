import axios from "axios";
import type { Folder, FolderTree, HydrofoilAsset } from "../types/assets";

const BASE = "http://localhost:8000/api";

export const assetApi = {
  // ---------- Folders ----------
  getFolderTree: (projectId: number) =>
    axios.get<FolderTree>(`${BASE}/folders/tree/`, {
      params: { project: projectId },
    }),

  createFolder: (data: {
    project: number;
    name: string;
    parent?: number | null;
  }) => axios.post<Folder>(`${BASE}/folders/`, data),

  renameFolder: (id: number, name: string) =>
    axios.patch<Folder>(`${BASE}/folders/${id}/`, { name }),

  moveFolder: (id: number, parent: number | null) =>
    axios.patch<Folder>(`${BASE}/folders/${id}/move/`, { parent }),

  deleteFolder: (id: number, force = false) =>
    axios.delete(`${BASE}/folders/${id}/${force ? "?force=true" : ""}`),

  // ---------- Assets ----------
  uploadAsset: (data: FormData, onProgress?: (pct: number) => void) =>
    axios.post<HydrofoilAsset>(`${BASE}/assets/`, data, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (e.total && onProgress)
          onProgress(Math.round((e.loaded / e.total) * 100));
      },
    }),

  renameAsset: (id: number, name: string) =>
    axios.patch<HydrofoilAsset>(`${BASE}/assets/${id}/rename/`, { name }),

  moveAsset: (id: number, folder: number | null) =>
    axios.patch<HydrofoilAsset>(`${BASE}/assets/${id}/move/`, { folder }),

  deleteAsset: (id: number, force = false) =>
    axios.delete(`${BASE}/assets/${id}/${force ? "?force=true" : ""}`),
};
