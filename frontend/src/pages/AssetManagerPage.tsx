import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderPlus,
  Upload,
  Grid3X3,
  List,
  Folder as FolderIcon,
  FolderOpen,
  FileBox,
  MoreVertical,
} from "lucide-react";
import { useToolbar } from "../hooks/useToolbar";
import { useAssetStore } from "../store/useAssetStore";
import { useSimStore } from "../store/useSimStore";
import AssetTreeView, {
  type TreeNode,
} from "../components/assets/AssetTreeView";
import AssetBreadcrumb from "../components/assets/AssetBreadcrumb";
import AssetContextMenu, {
  getItemActions,
  getBackgroundActions,
  type ContextMenuAction,
} from "../components/assets/AssetContextMenu";
import DeleteConfirmDialog from "../components/assets/DeleteConfirmDialog";
import FolderPickerModal from "../components/assets/FolderPickerModal";
import type { Folder, HydrofoilAsset } from "../types/assets";
import { assetApi } from "../lib/assetApi";

const ACCEPTED_EXTENSIONS = [".stl", ".obj", ".gltf", ".glb"];
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const DRAG_MIME = "application/x-nereus-item";

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

/** Encode an item identity into the drag transfer. */
function encodeDragData(type: "folder" | "asset", id: number): string {
  return JSON.stringify({ type, id });
}

/** Decode item identity from drag transfer. Returns null for external file drops. */
export function decodeDragData(
  dt: DataTransfer,
): { type: "folder" | "asset"; id: number } | null {
  try {
    const raw = dt.getData(DRAG_MIME);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---------- AssetManagerPage ----------

export default function AssetManagerPage() {
  const { setToolbarContent } = useToolbar();
  const navigate = useNavigate();
  const projectId = useSimStore((s) => s.projectId);
  const setSelectedAsset = useSimStore((s) => s.setSelectedAsset);

  const {
    rootFolders,
    rootAssets,
    loading,
    loadTree,
    currentFolderId,
    setCurrentFolder,
    createFolder: storeCreateFolder,
    renameItem,
    moveItems,
    deleteItems,
  } = useAssetStore();

  // Layout
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 280, height: 600 });

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    actions: ContextMenuAction[];
  } | null>(null);

  // Modals
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "folder" | "asset";
    id: number;
    name: string;
    warning?: string;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [moveTarget, setMoveTarget] = useState<{
    type: "folder" | "asset";
    id: number;
    name: string;
  } | null>(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // File-from-desktop drag state (only for external file drops, not internal moves)
  const [fileDragOver, setFileDragOver] = useState(false);

  // Folder drop-highlight: which folder id is currently hovered
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null);

  // New folder inline
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [newFolderParent, setNewFolderParent] = useState<number | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Load tree on mount
  useEffect(() => {
    loadTree(projectId);
  }, [projectId, loadTree]);

  // Resize observer for tree panel
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ---------- Breadcrumb path ----------
  const buildBreadcrumb = useCallback((): { id: number | null; name: string }[] => {
    const path: { id: number | null; name: string }[] = [
      { id: null, name: "Root" },
    ];
    if (!currentFolderId) return path;

    const find = (
      folders: Folder[],
      targetId: number,
      trail: { id: number; name: string }[],
    ): { id: number; name: string }[] | null => {
      for (const f of folders) {
        const newTrail = [...trail, { id: f.id, name: f.name }];
        if (f.id === targetId) return newTrail;
        const found = find(f.children || [], targetId, newTrail);
        if (found) return found;
      }
      return null;
    };

    const trail = find(rootFolders, currentFolderId, []);
    if (trail) path.push(...trail);
    return path;
  }, [currentFolderId, rootFolders]);

  // ---------- Get current folder contents ----------
  const getCurrentContents = useCallback((): {
    folders: Folder[];
    assets: HydrofoilAsset[];
  } => {
    if (!currentFolderId) {
      return { folders: rootFolders, assets: rootAssets };
    }
    const find = (folders: Folder[], id: number): Folder | null => {
      for (const f of folders) {
        if (f.id === id) return f;
        const found = find(f.children || [], id);
        if (found) return found;
      }
      return null;
    };
    const folder = find(rootFolders, currentFolderId);
    return folder
      ? { folders: folder.children || [], assets: folder.assets || [] }
      : { folders: [], assets: [] };
  }, [currentFolderId, rootFolders, rootAssets]);

  const { folders: currentFolders, assets: currentAssets } =
    getCurrentContents();

  // ---------- File upload ----------
  const handleUpload = useCallback(
    async (files: FileList, targetFolderId?: number | null) => {
      const folderId = targetFolderId !== undefined ? targetFolderId : currentFolderId;
      for (const file of Array.from(files)) {
        const ext = getExtension(file.name);
        if (!ACCEPTED_EXTENSIONS.includes(ext)) continue;
        if (file.size > MAX_FILE_SIZE) continue;

        const fd = new FormData();
        fd.append("project", String(projectId));
        fd.append("name", file.name.replace(/\.[^.]+$/, ""));
        fd.append("file", file);
        if (folderId) fd.append("folder", String(folderId));

        setUploading(true);
        setUploadProgress(0);
        try {
          await assetApi.uploadAsset(fd, setUploadProgress);
        } finally {
          setUploading(false);
          setUploadProgress(0);
        }
      }
      loadTree(projectId);
    },
    [projectId, currentFolderId, loadTree],
  );

  // =====================================================================
  //  DRAG & DROP  — internal item moves + external file uploads
  // =====================================================================

  /** Start dragging an item from the grid/list */
  const handleItemDragStart = useCallback(
    (e: React.DragEvent, type: "folder" | "asset", id: number, name: string) => {
      e.dataTransfer.setData(DRAG_MIME, encodeDragData(type, id));
      e.dataTransfer.setData("text/plain", name);
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  /** Is this drag carrying an internal item (vs an external file)? */
  const isInternalDrag = (e: React.DragEvent): boolean =>
    e.dataTransfer.types.includes(DRAG_MIME);

  // ── Folder drop-target handlers (grid folders) ──────────────────────
  const handleFolderDragOver = useCallback(
    (e: React.DragEvent, folderId: number) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDropTargetFolderId(folderId);
    },
    [],
  );

  const handleFolderDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Only clear if we're actually leaving the folder element
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !e.currentTarget.contains(related)) {
        setDropTargetFolderId(null);
      }
    },
    [],
  );

  const handleFolderDrop = useCallback(
    async (e: React.DragEvent, targetFolderId: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTargetFolderId(null);

      // Internal item move
      const item = decodeDragData(e.dataTransfer);
      if (item) {
        // Don't drop a folder onto itself
        if (item.type === "folder" && item.id === targetFolderId) return;
        await moveItems([item], targetFolderId);
        return;
      }

      // External file drop onto a specific folder
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files, targetFolderId);
      }
    },
    [moveItems, handleUpload],
  );

  // ── Background drop (current folder / root for file uploads, or move to current) ──
  const handleBackgroundDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!isInternalDrag(e) && e.dataTransfer.types.includes("Files")) {
        setFileDragOver(true);
      }
      e.dataTransfer.dropEffect = isInternalDrag(e) ? "move" : "copy";
    },
    [],
  );

  const handleBackgroundDragLeave = useCallback(
    (e: React.DragEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !e.currentTarget.contains(related)) {
        setFileDragOver(false);
      }
    },
    [],
  );

  const handleBackgroundDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setFileDragOver(false);

      // Internal item move → move to current folder (i.e. out of its subfolder)
      const item = decodeDragData(e.dataTransfer);
      if (item) {
        await moveItems([item], currentFolderId);
        return;
      }

      // External file drop
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files);
      }
    },
    [moveItems, currentFolderId, handleUpload],
  );

  // ---------- Context menu handlers ----------
  const handleTreeContextMenu = useCallback(
    (e: React.MouseEvent, node: TreeNode | null) => {
      e.preventDefault();
      if (!node) {
        setCtxMenu({
          x: e.clientX,
          y: e.clientY,
          actions: getBackgroundActions({
            onNewFolder: () => {
              setNewFolderParent(currentFolderId);
              setNewFolderName("");
            },
          }),
        });
        return;
      }

      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        actions: getItemActions({
          type: node.entityType,
          onRename: () => {
            const newName = prompt("Rename:", node.name);
            if (newName && newName !== node.name) {
              renameItem(node.entityType, node.entityId, newName);
            }
          },
          onMove: () =>
            setMoveTarget({
              type: node.entityType,
              id: node.entityId,
              name: node.name,
            }),
          onDelete: () =>
            setDeleteTarget({
              type: node.entityType,
              id: node.entityId,
              name: node.name,
            }),
          onOpen:
            node.entityType === "asset"
              ? () => {
                  setSelectedAsset({
                    id: node.entityId,
                    name: node.name,
                    file: node.fileUrl || "",
                  });
                  navigate("/");
                }
              : undefined,
          onNewFolder:
            node.entityType === "folder"
              ? () => {
                  setNewFolderParent(node.entityId);
                  setNewFolderName("");
                }
              : undefined,
        }),
      });
    },
    [currentFolderId, renameItem, setSelectedAsset, navigate],
  );

  const handleGridContextMenu = useCallback(
    (
      e: React.MouseEvent,
      item: { type: "folder" | "asset"; id: number; name: string; fileUrl?: string },
    ) => {
      e.preventDefault();
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        actions: getItemActions({
          type: item.type,
          onRename: () => {
            const newName = prompt("Rename:", item.name);
            if (newName && newName !== item.name) {
              renameItem(item.type, item.id, newName);
            }
          },
          onMove: () =>
            setMoveTarget({ type: item.type, id: item.id, name: item.name }),
          onDelete: () =>
            setDeleteTarget({ type: item.type, id: item.id, name: item.name }),
          onOpen:
            item.type === "asset"
              ? () => {
                  setSelectedAsset({
                    id: item.id,
                    name: item.name,
                    file: item.fileUrl || "",
                  });
                  navigate("/");
                }
              : undefined,
          onNewFolder:
            item.type === "folder"
              ? () => {
                  setNewFolderParent(item.id);
                  setNewFolderName("");
                }
              : undefined,
        }),
      });
    },
    [renameItem, setSelectedAsset, navigate],
  );

  const handleBackgroundContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (e.target !== e.currentTarget) return;
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        actions: getBackgroundActions({
          onNewFolder: () => {
            setNewFolderParent(currentFolderId);
            setNewFolderName("");
          },
        }),
      });
    },
    [currentFolderId],
  );

  // ---------- Delete confirm ----------
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { warnings } = await deleteItems(
        [{ type: deleteTarget.type, id: deleteTarget.id }],
        true,
      );
      if (warnings.length > 0) {
        console.warn("Delete warnings:", warnings);
      }
      setDeleteTarget(null);
    } catch {
      // Keep dialog open on error
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, deleteItems]);

  // ---------- Move confirm ----------
  const handleMoveConfirm = useCallback(
    async (targetFolderId: number | null) => {
      if (!moveTarget) return;
      await moveItems(
        [{ type: moveTarget.type, id: moveTarget.id }],
        targetFolderId,
      );
      setMoveTarget(null);
    },
    [moveTarget, moveItems],
  );

  // ---------- New folder submit ----------
  const handleNewFolderSubmit = useCallback(async () => {
    if (newFolderName === null || !newFolderName.trim()) {
      setNewFolderName(null);
      return;
    }
    await storeCreateFolder(projectId, newFolderName.trim(), newFolderParent);
    setNewFolderName(null);
  }, [newFolderName, newFolderParent, projectId, storeCreateFolder]);

  useEffect(() => {
    if (newFolderName !== null && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [newFolderName]);

  // ---------- Toolbar injection ----------
  useEffect(() => {
    setToolbarContent(
      <div className="flex items-center gap-2">
        <AssetBreadcrumb
          path={buildBreadcrumb()}
          onNavigate={setCurrentFolder}
        />
        <div className="h-4 w-px bg-slate-700/50 mx-1" />

        <button
          onClick={() => {
            setNewFolderParent(currentFolderId);
            setNewFolderName("");
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-slate-100 border border-hud-border rounded transition-colors"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          New Folder
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-slate-100 border border-hud-border rounded transition-colors disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? `${uploadProgress}%` : "Upload"}
        </button>

        <div className="h-4 w-px bg-slate-700/50 mx-1" />

        <button
          onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
          className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
          title={viewMode === "grid" ? "List view" : "Grid view"}
        >
          {viewMode === "grid" ? (
            <List className="h-4 w-4" />
          ) : (
            <Grid3X3 className="h-4 w-4" />
          )}
        </button>
      </div>,
    );
    return () => setToolbarContent(null);
  }, [
    setToolbarContent,
    buildBreadcrumb,
    setCurrentFolder,
    currentFolderId,
    uploading,
    uploadProgress,
    viewMode,
  ]);

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      className="hidden"
      accept={ACCEPTED_EXTENSIONS.join(",")}
      multiple
      onChange={(e) => {
        if (e.target.files) handleUpload(e.target.files);
        e.target.value = "";
      }}
    />
  );

  // =====================================================================
  //  SHARED DRAG PROPS for grid/list items
  // =====================================================================
  const draggableProps = (
    type: "folder" | "asset",
    id: number,
    name: string,
  ) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => handleItemDragStart(e, type, id, name),
  });

  /** Drop-target props for a folder card/row in the main view */
  const folderDropProps = (folderId: number) => ({
    onDragOver: (e: React.DragEvent) => handleFolderDragOver(e, folderId),
    onDragLeave: handleFolderDragLeave,
    onDrop: (e: React.DragEvent) => handleFolderDrop(e, folderId),
  });

  const isFolderHighlighted = (folderId: number) =>
    dropTargetFolderId === folderId;

  return (
    <div className="flex h-full">
      {fileInput}

      {/* ── Left: Folder tree ────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="w-72 flex-shrink-0 border-r border-hud-border bg-surface-solid/50 flex flex-col"
      >
        <div className="px-3 py-2 border-b border-hud-border">
          <span className="text-2xs text-slate-500 uppercase tracking-wider font-medium">
            Explorer
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <AssetTreeView
            folders={rootFolders}
            assets={rootAssets}
            onRename={(type, id, name) => renameItem(type, id, name)}
            onMove={(items, target) => moveItems(items, target)}
            onSelect={(node) => {
              if (node?.entityType === "folder") {
                setCurrentFolder(node.entityId);
              }
            }}
            onContextMenu={handleTreeContextMenu}
            onExternalDrop={(targetFolderId, dt) => {
              const item = decodeDragData(dt);
              if (item) {
                if (item.type === "folder" && item.id === targetFolderId) return;
                moveItems([item], targetFolderId);
              }
            }}
            width={dimensions.width}
            height={dimensions.height - 36}
          />
        </div>
      </div>

      {/* ── Right: Grid/List view ────────────────────────────────── */}
      <div
        className={`flex-1 overflow-auto p-4 transition-colors ${
          fileDragOver ? "ring-2 ring-inset ring-accent-cyan/40 bg-accent-cyan/5" : ""
        }`}
        onDragOver={handleBackgroundDragOver}
        onDragLeave={handleBackgroundDragLeave}
        onDrop={handleBackgroundDrop}
        onContextMenu={handleBackgroundContextMenu}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-500">
            Loading...
          </div>
        ) : currentFolders.length === 0 &&
          currentAssets.length === 0 &&
          newFolderName === null ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <FileBox className="h-10 w-10 text-slate-600" />
            <p className="text-sm">This folder is empty</p>
            <p className="text-xs text-slate-600">
              Drag files here or use the Upload button
            </p>
          </div>
        ) : viewMode === "grid" ? (
          /* ── Grid view ──────────────────────────────────────── */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {/* New folder inline */}
            {newFolderName !== null && (
              <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5">
                <FolderIcon className="h-10 w-10 text-amber-400" />
                <input
                  ref={newFolderInputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onBlur={handleNewFolderSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNewFolderSubmit();
                    if (e.key === "Escape") setNewFolderName(null);
                  }}
                  placeholder="Folder name"
                  className="w-full bg-transparent border border-hud-border rounded px-1.5 py-0.5 text-xs text-slate-200 text-center outline-none focus:border-accent-cyan/50"
                />
              </div>
            )}

            {/* Folders — draggable + droppable */}
            {currentFolders.map((f) => (
              <div
                key={`folder-${f.id}`}
                className={`group flex flex-col items-center gap-1.5 p-3 rounded-lg border cursor-pointer transition-all relative
                  ${
                    isFolderHighlighted(f.id)
                      ? "border-accent-cyan bg-accent-cyan/10 scale-[1.02] shadow-lg shadow-accent-cyan/10"
                      : "border-transparent hover:border-hud-border hover:bg-white/[0.02]"
                  }
                `}
                onDoubleClick={() => setCurrentFolder(f.id)}
                onContextMenu={(e) =>
                  handleGridContextMenu(e, {
                    type: "folder",
                    id: f.id,
                    name: f.name,
                  })
                }
                {...draggableProps("folder", f.id, f.name)}
                {...folderDropProps(f.id)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGridContextMenu(
                      e as unknown as React.MouseEvent,
                      { type: "folder", id: f.id, name: f.name },
                    );
                  }}
                  className="absolute top-1 right-1 p-0.5 text-slate-600 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
                <FolderOpen className="h-10 w-10 text-amber-400 pointer-events-none" />
                <span className="text-xs text-slate-300 text-center truncate w-full pointer-events-none">
                  {f.name}
                </span>
                {f.asset_count > 0 && (
                  <span className="text-2xs text-slate-600 pointer-events-none">
                    {f.asset_count} item{f.asset_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            ))}

            {/* Assets — draggable */}
            {currentAssets.map((a) => (
              <div
                key={`asset-${a.id}`}
                className="group flex flex-col items-center gap-1.5 p-3 rounded-lg border border-transparent hover:border-hud-border hover:bg-white/[0.02] cursor-pointer transition-colors relative"
                onDoubleClick={() => {
                  setSelectedAsset({ id: a.id, name: a.name, file: a.file });
                  navigate("/");
                }}
                onContextMenu={(e) =>
                  handleGridContextMenu(e, {
                    type: "asset",
                    id: a.id,
                    name: a.name,
                    fileUrl: a.file,
                  })
                }
                {...draggableProps("asset", a.id, a.name)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGridContextMenu(
                      e as unknown as React.MouseEvent,
                      { type: "asset", id: a.id, name: a.name, fileUrl: a.file },
                    );
                  }}
                  className="absolute top-1 right-1 p-0.5 text-slate-600 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
                <FileBox className="h-10 w-10 text-slate-400 pointer-events-none" />
                <span className="text-xs text-slate-300 text-center truncate w-full pointer-events-none">
                  {a.name}
                </span>
                <span className="text-2xs text-slate-600 pointer-events-none">
                  {getExtension(a.file).replace(".", "").toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          /* ── List view ──────────────────────────────────────── */
          <div className="flex flex-col">
            {/* Header */}
            <div className="grid grid-cols-[1fr_100px_140px] gap-2 px-3 py-1.5 text-2xs text-slate-600 uppercase tracking-wider border-b border-hud-border">
              <span>Name</span>
              <span>Type</span>
              <span>Date</span>
            </div>

            {/* New folder inline */}
            {newFolderName !== null && (
              <div className="grid grid-cols-[1fr_100px_140px] gap-2 px-3 py-1.5 items-center border-b border-hud-border/50">
                <div className="flex items-center gap-2">
                  <FolderIcon className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  <input
                    ref={newFolderInputRef}
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onBlur={handleNewFolderSubmit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleNewFolderSubmit();
                      if (e.key === "Escape") setNewFolderName(null);
                    }}
                    placeholder="Folder name"
                    className="bg-transparent border border-accent-cyan/30 rounded px-1.5 py-0.5 text-xs text-slate-200 outline-none focus:border-accent-cyan/50 w-48"
                  />
                </div>
                <span className="text-xs text-slate-500">Folder</span>
                <span className="text-xs text-slate-500">--</span>
              </div>
            )}

            {/* Folders — draggable + droppable */}
            {currentFolders.map((f) => (
              <div
                key={`folder-${f.id}`}
                className={`group grid grid-cols-[1fr_100px_140px] gap-2 px-3 py-1.5 items-center cursor-pointer transition-all border-b
                  ${
                    isFolderHighlighted(f.id)
                      ? "border-accent-cyan bg-accent-cyan/10"
                      : "border-hud-border/30 hover:bg-white/[0.02]"
                  }
                `}
                onDoubleClick={() => setCurrentFolder(f.id)}
                onContextMenu={(e) =>
                  handleGridContextMenu(e, {
                    type: "folder",
                    id: f.id,
                    name: f.name,
                  })
                }
                {...draggableProps("folder", f.id, f.name)}
                {...folderDropProps(f.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderIcon className="h-4 w-4 text-amber-400 flex-shrink-0 pointer-events-none" />
                  <span className="text-xs text-slate-300 truncate pointer-events-none">
                    {f.name}
                  </span>
                  {f.asset_count > 0 && (
                    <span className="text-2xs text-slate-600 flex-shrink-0 pointer-events-none">
                      ({f.asset_count})
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500 pointer-events-none">Folder</span>
                <span className="text-xs text-slate-600 pointer-events-none">
                  {new Date(f.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}

            {/* Assets — draggable */}
            {currentAssets.map((a) => (
              <div
                key={`asset-${a.id}`}
                className="group grid grid-cols-[1fr_100px_140px] gap-2 px-3 py-1.5 items-center hover:bg-white/[0.02] cursor-pointer transition-colors border-b border-hud-border/30"
                onDoubleClick={() => {
                  setSelectedAsset({ id: a.id, name: a.name, file: a.file });
                  navigate("/");
                }}
                onContextMenu={(e) =>
                  handleGridContextMenu(e, {
                    type: "asset",
                    id: a.id,
                    name: a.name,
                    fileUrl: a.file,
                  })
                }
                {...draggableProps("asset", a.id, a.name)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileBox className="h-4 w-4 text-slate-400 flex-shrink-0 pointer-events-none" />
                  <span className="text-xs text-slate-300 truncate pointer-events-none">
                    {a.name}
                  </span>
                </div>
                <span className="text-xs text-slate-500 pointer-events-none">
                  {getExtension(a.file).replace(".", "").toUpperCase() || "File"}
                </span>
                <span className="text-xs text-slate-600 pointer-events-none">
                  {new Date(a.uploaded_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Context Menu ─────────────────────────────────────────── */}
      {ctxMenu && (
        <AssetContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          actions={ctxMenu.actions}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ── Delete Dialog ────────────────────────────────────────── */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title={`Delete ${deleteTarget?.type === "folder" ? "Folder" : "Asset"}`}
        message={
          deleteTarget?.warning ||
          `Are you sure you want to delete "${deleteTarget?.name}"?${
            deleteTarget?.type === "folder"
              ? "\n\nAssets inside will be moved to the project root. Subfolders will be deleted."
              : ""
          }`
        }
        loading={deleteLoading}
      />

      {/* ── Move Modal ───────────────────────────────────────────── */}
      <FolderPickerModal
        open={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        onSelect={(folderId) => handleMoveConfirm(folderId)}
        folders={rootFolders}
        excludeId={
          moveTarget?.type === "folder" ? moveTarget.id : undefined
        }
        title={`Move "${moveTarget?.name}" to...`}
      />
    </div>
  );
}
