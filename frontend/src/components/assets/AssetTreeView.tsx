import { useRef, useState, useCallback, useMemo, createContext, useContext } from "react";
import { Tree } from "react-arborist";
import type { NodeRendererProps } from "react-arborist";
import {
  Folder as FolderIcon,
  FolderOpen,
  FileBox,
  ChevronRight,
} from "lucide-react";
import type { Folder, HydrofoilAsset } from "../../types/assets";

const DRAG_MIME = "application/x-nereus-item";

// ---------- Data shape react-arborist expects ----------
export interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  entityType: "folder" | "asset";
  entityId: number;
  fileUrl?: string;
}

// Convert our API Folder/Asset tree to react-arborist nodes
function foldersToNodes(folders: Folder[], assets: HydrofoilAsset[]): TreeNode[] {
  const folderNodes: TreeNode[] = folders.map((f) => ({
    id: `folder-${f.id}`,
    name: f.name,
    entityType: "folder" as const,
    entityId: f.id,
    children: foldersToNodes(f.children || [], f.assets || []),
  }));

  const assetNodes: TreeNode[] = assets.map((a) => ({
    id: `asset-${a.id}`,
    name: a.name,
    entityType: "asset" as const,
    entityId: a.id,
    fileUrl: a.file,
  }));

  return [...folderNodes, ...assetNodes];
}

// Contexts to pass handlers to the node renderer
const CtxMenuContext = createContext<
  ((e: React.MouseEvent, node: TreeNode) => void) | null
>(null);

/** Called when an item from the grid is dropped onto a tree folder node. */
const ExternalDropContext = createContext<
  ((targetFolderId: number, data: DataTransfer) => void) | null
>(null);

/** Track which folder node is highlighted for external drop */
const DropHighlightContext = createContext<{
  highlightedId: number | null;
  setHighlightedId: (id: number | null) => void;
}>({ highlightedId: null, setHighlightedId: () => {} });

// ---------- Node renderer ----------
function Node({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const data = node.data;
  const isFolder = data.entityType === "folder";
  const onCtxMenu = useContext(CtxMenuContext);
  const onExternalDrop = useContext(ExternalDropContext);
  const { highlightedId, setHighlightedId } = useContext(DropHighlightContext);
  const isDropHighlighted = isFolder && highlightedId === data.entityId;

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`flex items-center gap-1.5 px-2 py-0.5 cursor-pointer rounded group transition-all
        ${node.isSelected ? "bg-accent-cyan/10 text-accent-cyan" : "text-slate-300 hover:bg-white/5"}
        ${node.willReceiveDrop || isDropHighlighted ? "ring-1 ring-accent-cyan/50 bg-accent-cyan/10" : ""}
      `}
      onClick={() => node.isInternal && node.toggle()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCtxMenu?.(e, data);
      }}
      // HTML5 drop handlers for items dragged from the main grid
      onDragOver={
        isFolder
          ? (e) => {
              // Only handle external drags (from the grid). react-arborist handles its own internal DnD.
              if (e.dataTransfer.types.includes(DRAG_MIME)) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                setHighlightedId(data.entityId);
              }
            }
          : undefined
      }
      onDragLeave={
        isFolder
          ? (e) => {
              const related = e.relatedTarget as HTMLElement | null;
              if (!related || !e.currentTarget.contains(related)) {
                setHighlightedId(null);
              }
            }
          : undefined
      }
      onDrop={
        isFolder
          ? (e) => {
              if (e.dataTransfer.types.includes(DRAG_MIME)) {
                e.preventDefault();
                e.stopPropagation();
                setHighlightedId(null);
                onExternalDrop?.(data.entityId, e.dataTransfer);
              }
            }
          : undefined
      }
    >
      {isFolder ? (
        <ChevronRight
          className={`h-3 w-3 text-slate-500 transition-transform flex-shrink-0 ${
            node.isOpen ? "rotate-90" : ""
          }`}
        />
      ) : (
        <span className="w-3 flex-shrink-0" />
      )}

      {isFolder ? (
        node.isOpen || isDropHighlighted ? (
          <FolderOpen className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
        ) : (
          <FolderIcon className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
        )
      ) : (
        <FileBox className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
      )}

      {node.isEditing ? (
        <input
          type="text"
          defaultValue={data.name}
          autoFocus
          className="flex-1 bg-transparent border border-accent-cyan/30 rounded px-1 py-0 text-xs text-slate-200 outline-none"
          onFocus={(e) => {
            const val = e.target.value;
            const dotIdx = isFolder ? -1 : val.lastIndexOf(".");
            e.target.setSelectionRange(0, dotIdx > 0 ? dotIdx : val.length);
          }}
          onBlur={(e) => node.submit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") node.submit(e.currentTarget.value);
            if (e.key === "Escape") node.reset();
          }}
        />
      ) : (
        <span className="text-xs truncate">{data.name}</span>
      )}
    </div>
  );
}

// ---------- Main tree component ----------
interface Props {
  folders: Folder[];
  assets: HydrofoilAsset[];
  onRename: (type: "folder" | "asset", id: number, newName: string) => void;
  onMove: (
    items: { type: "folder" | "asset"; id: number }[],
    targetFolderId: number | null,
  ) => void;
  onSelect: (node: TreeNode | null) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode | null) => void;
  /** Called when an item dragged from the grid is dropped onto a tree folder. */
  onExternalDrop?: (targetFolderId: number, data: DataTransfer) => void;
  height: number;
  width: number;
}

export default function AssetTreeView({
  folders,
  assets,
  onRename,
  onMove,
  onSelect,
  onContextMenu,
  onExternalDrop,
  height,
  width,
}: Props) {
  const treeRef = useRef<any>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const data = useMemo(
    () => foldersToNodes(folders, assets),
    [folders, assets],
  );

  const handleRename = useCallback(
    ({ id, name }: { id: string; name: string }) => {
      const [type, idStr] = id.split("-");
      onRename(type as "folder" | "asset", Number(idStr), name);
    },
    [onRename],
  );

  const handleMove = useCallback(
    ({
      dragIds,
      parentId,
    }: {
      dragIds: string[];
      parentId: string | null;
      index: number;
    }) => {
      const items = dragIds.map((did) => {
        const [type, idStr] = did.split("-");
        return { type: type as "folder" | "asset", id: Number(idStr) };
      });
      let targetFolderId: number | null = null;
      if (parentId) {
        const [, idStr] = parentId.split("-");
        targetFolderId = Number(idStr);
      }
      onMove(items, targetFolderId);
    },
    [onMove],
  );

  const handleSelect = useCallback(
    (nodes: any[]) => {
      if (nodes.length > 0) {
        onSelect(nodes[0].data as TreeNode);
      } else {
        onSelect(null);
      }
    },
    [onSelect],
  );

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: TreeNode) => {
      onContextMenu(e, node);
    },
    [onContextMenu],
  );

  const handleExternalDrop = useCallback(
    (targetFolderId: number, dt: DataTransfer) => {
      onExternalDrop?.(targetFolderId, dt);
    },
    [onExternalDrop],
  );

  const dropHighlightValue = useMemo(
    () => ({ highlightedId, setHighlightedId }),
    [highlightedId],
  );

  return (
    <CtxMenuContext.Provider value={handleNodeContextMenu}>
      <ExternalDropContext.Provider value={handleExternalDrop}>
        <DropHighlightContext.Provider value={dropHighlightValue}>
          <div
            onContextMenu={(e) => {
              const target = e.target as HTMLElement;
              if (target === e.currentTarget || target.closest("[data-tree-empty]")) {
                e.preventDefault();
                onContextMenu(e, null);
              }
            }}
          >
            <Tree<TreeNode>
              ref={treeRef}
              data={data}
              width={width}
              height={height}
              indent={16}
              rowHeight={28}
              onRename={handleRename}
              onMove={handleMove}
              onSelect={handleSelect}
              openByDefault={false}
              disableDrag={false}
              disableDrop={(args) => {
                if (args.parentNode?.data?.entityType === "asset") return true;
                return false;
              }}
            >
              {Node}
            </Tree>
          </div>
        </DropHighlightContext.Provider>
      </ExternalDropContext.Provider>
    </CtxMenuContext.Provider>
  );
}
