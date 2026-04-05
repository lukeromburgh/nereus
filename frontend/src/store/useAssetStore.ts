import { create } from "zustand";
import type { Folder, HydrofoilAsset } from "../types/assets";
import { assetApi } from "../lib/assetApi";

interface AssetState {
  rootFolders: Folder[];
  rootAssets: HydrofoilAsset[];
  loading: boolean;
  error: string | null;

  expandedFolderIds: Set<number>;
  currentFolderId: number | null;

  loadTree: (projectId: number) => Promise<void>;
  toggleFolder: (folderId: number) => void;
  expandFolder: (folderId: number) => void;
  setCurrentFolder: (folderId: number | null) => void;

  createFolder: (
    projectId: number,
    name: string,
    parentId: number | null,
  ) => Promise<void>;
  renameItem: (
    type: "folder" | "asset",
    id: number,
    newName: string,
  ) => Promise<void>;
  moveItems: (
    items: { type: "folder" | "asset"; id: number }[],
    targetFolderId: number | null,
  ) => Promise<void>;
  deleteItems: (
    items: { type: "folder" | "asset"; id: number }[],
    force?: boolean,
  ) => Promise<{ warnings: string[] }>;
}

// Track the current project so reload helpers can call loadTree
let _lastProjectId: number | null = null;

export const useAssetStore = create<AssetState>((set, get) => ({
  rootFolders: [],
  rootAssets: [],
  loading: false,
  error: null,

  expandedFolderIds: new Set(),
  currentFolderId: null,

  loadTree: async (projectId: number) => {
    _lastProjectId = projectId;
    set({ loading: true, error: null });
    try {
      const { data } = await assetApi.getFolderTree(projectId);
      set({ rootFolders: data.folders, rootAssets: data.assets, loading: false });
    } catch {
      set({ error: "Failed to load asset tree", loading: false });
    }
  },

  toggleFolder: (folderId: number) =>
    set((s) => {
      const next = new Set(s.expandedFolderIds);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return { expandedFolderIds: next };
    }),

  expandFolder: (folderId: number) =>
    set((s) => {
      const next = new Set(s.expandedFolderIds);
      next.add(folderId);
      return { expandedFolderIds: next };
    }),

  setCurrentFolder: (folderId: number | null) =>
    set({ currentFolderId: folderId }),

  createFolder: async (projectId, name, parentId) => {
    await assetApi.createFolder({ project: projectId, name, parent: parentId });
    await get().loadTree(projectId);
  },

  renameItem: async (type, id, newName) => {
    if (type === "folder") await assetApi.renameFolder(id, newName);
    else await assetApi.renameAsset(id, newName);
    if (_lastProjectId) await get().loadTree(_lastProjectId);
  },

  moveItems: async (items, targetFolderId) => {
    await Promise.all(
      items.map((item) =>
        item.type === "folder"
          ? assetApi.moveFolder(item.id, targetFolderId)
          : assetApi.moveAsset(item.id, targetFolderId),
      ),
    );
    if (_lastProjectId) await get().loadTree(_lastProjectId);
  },

  deleteItems: async (items, force = false) => {
    const warnings: string[] = [];
    for (const item of items) {
      try {
        if (item.type === "folder") await assetApi.deleteFolder(item.id, force);
        else await assetApi.deleteAsset(item.id, force);
      } catch (err: unknown) {
        const resp = (err as { response?: { status?: number; data?: { warning?: string } } })
          .response;
        if (resp?.status === 409 && resp.data?.warning) {
          warnings.push(resp.data.warning);
        } else {
          throw err;
        }
      }
    }
    if (_lastProjectId) await get().loadTree(_lastProjectId);
    return { warnings };
  },
}));
