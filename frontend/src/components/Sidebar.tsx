import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Box, PlayCircle, Circle, Loader2, ChevronRight, Folder as FolderIcon, FolderOpen, FileBox } from "lucide-react";
import { useSimStore } from "../store/useSimStore";
import { assetApi } from "../lib/assetApi";
import type { Folder, HydrofoilAsset } from "../types/assets";

type SimulationRun = {
  id: number;
  project: number;
  asset: number | null;
  status: string;
  created_at: string;
};

function statusDotColor(status: string) {
  if (status === "RUNNING" || status === "MESHING" || status === "PENDING")
    return "text-status-info";
  if (status === "COMPLETED") return "text-status-success";
  if (status === "FAILED") return "text-status-destructive";
  return "text-foreground-subtle";
}

function statusDotAnim(status: string) {
  if (status === "RUNNING" || status === "MESHING" || status === "PENDING")
    return "animate-pulse";
  return "";
}

function AssetItem({
  asset,
  isSelected,
  depth,
  onSelect,
}: {
  asset: HydrofoilAsset;
  isSelected: boolean;
  depth: number;
  onSelect: (asset: HydrofoilAsset) => void;
}) {
  return (
    <button
      onClick={() => onSelect(asset)}
      className={`text-left w-full flex items-center gap-1.5 py-1.5 rounded-md text-xs transition-all duration-200 ${
        isSelected
          ? "bg-accent/10 border border-accent/25 text-foreground"
          : "border border-transparent hover:bg-background-muted hover:border-border text-foreground-muted hover:text-foreground"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: 8 }}
    >
      <FileBox className="h-3 w-3 text-foreground-subtle flex-shrink-0" />
      <span className="truncate font-medium">{asset.name}</span>
    </button>
  );
}

function FolderNode({
  folder,
  depth,
  selectedAssetId,
  onSelectAsset,
  expandedIds,
  onToggle,
}: {
  folder: Folder;
  depth: number;
  selectedAssetId: number | null;
  onSelectAsset: (asset: HydrofoilAsset) => void;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
}) {
  const isOpen = expandedIds.has(folder.id);
  const hasChildren =
    (folder.children && folder.children.length > 0) ||
    (folder.assets && folder.assets.length > 0);

  return (
    <div>
      <button
        onClick={() => onToggle(folder.id)}
        className="text-left w-full flex items-center gap-1.5 py-1.5 rounded-md text-xs text-foreground-muted hover:text-foreground hover:bg-background-muted transition-all duration-200"
        style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: 8 }}
      >
        <ChevronRight
          className={`h-3 w-3 text-foreground-subtle transition-transform flex-shrink-0 ${isOpen ? "rotate-90" : ""}`}
        />
        {isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 text-status-warning flex-shrink-0" />
        ) : (
          <FolderIcon className="h-3.5 w-3.5 text-status-warning flex-shrink-0" />
        )}
        <span className="truncate font-medium">{folder.name}</span>
        {folder.asset_count > 0 && (
          <span className="text-2xs text-foreground-disabled ml-auto font-mono">
            {folder.asset_count}
          </span>
        )}
      </button>

      {isOpen && hasChildren && (
        <div>
          {folder.children?.map((child) => (
            <FolderNode
              key={`f-${child.id}`}
              folder={child}
              depth={depth + 1}
              selectedAssetId={selectedAssetId}
              onSelectAsset={onSelectAsset}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
          {folder.assets?.map((asset) => (
            <AssetItem
              key={`a-${asset.id}`}
              asset={asset}
              isSelected={asset.id === selectedAssetId}
              depth={depth + 1}
              onSelect={onSelectAsset}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ refreshNonce }: { refreshNonce: number }) {
  const { projectId, selectedAssetId, setSelectedAsset, setSelectedAssetId, selectSim, updateSim } = useSimStore();
  const [rootFolders, setRootFolders] = useState<Folder[]>([]);
  const [rootAssets, setRootAssets] = useState<HydrofoilAsset[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleFolder = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allAssets = useMemo(() => {
    const result: HydrofoilAsset[] = [...rootAssets];
    function collect(folders: Folder[]) {
      for (const f of folders) {
        if (f.assets) result.push(...f.assets);
        if (f.children) collect(f.children);
      }
    }
    collect(rootFolders);
    return result;
  }, [rootFolders, rootAssets]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [treeResp, runsResp] = await Promise.all([
          assetApi.getFolderTree(projectId),
          axios.get<SimulationRun[]>("http://localhost:8000/api/runs/"),
        ]);
        if (cancelled) return;
        setRootFolders(treeResp.data.folders);
        setRootAssets(treeResp.data.assets);
        const runsForProject = runsResp.data
          .filter((r) => r.project === projectId)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setRuns(runsForProject);
        if (!selectedAssetId) {
          const firstAsset = treeResp.data.assets[0] || findFirstAsset(treeResp.data.folders);
          if (firstAsset) setSelectedAsset(firstAsset);
        }
      } catch (err) {
        console.error("Failed loading sidebar data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId, refreshNonce, selectedAssetId, setSelectedAssetId]);

  const selectedAsset = useMemo(
    () => allAssets.find((a) => a.id === selectedAssetId) || null,
    [allAssets, selectedAssetId],
  );

  const handleSelectAsset = (asset: HydrofoilAsset) => setSelectedAsset(asset);

  const handleSelectRun = async (runId: number) => {
    selectSim(runId);
    try {
      const { data } = await axios.get(`http://localhost:8000/api/runs/${runId}/`);
      updateSim(data);
    } catch (err) {
      console.error("Failed to load run", err);
    }
  };

  const hasAnyAssets = rootFolders.length > 0 || rootAssets.length > 0;

  return (
    <div className="p-3 flex flex-col gap-5 scrollbar-dark">
      {/* Assets section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Box className="h-3.5 w-3.5 text-foreground-subtle" />
          <span className="hud-label">Assets</span>
        </div>

        {selectedAsset && (
          <div className="mb-3 px-2 py-1.5 rounded-md bg-accent/5 border border-accent/15">
            <div className="text-2xs text-foreground-subtle">Active</div>
            <div className="text-xs font-medium text-foreground truncate">{selectedAsset.name}</div>
          </div>
        )}

        {loading && !hasAnyAssets ? (
          <div className="flex items-center gap-2 text-2xs text-foreground-subtle">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : !hasAnyAssets ? (
          <div className="text-2xs text-foreground-subtle px-1">No assets yet. Upload one above.</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {rootFolders.map((folder) => (
              <FolderNode
                key={`f-${folder.id}`}
                folder={folder}
                depth={0}
                selectedAssetId={selectedAssetId}
                onSelectAsset={handleSelectAsset}
                expandedIds={expandedIds}
                onToggle={toggleFolder}
              />
            ))}
            {rootAssets.map((asset) => (
              <AssetItem
                key={`a-${asset.id}`}
                asset={asset}
                isSelected={asset.id === selectedAssetId}
                depth={0}
                onSelect={handleSelectAsset}
              />
            ))}
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Simulation Runs section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <PlayCircle className="h-3.5 w-3.5 text-foreground-subtle" />
          <span className="hud-label">Runs</span>
          {runs.length > 0 && (
            <span className="text-2xs text-foreground-disabled font-mono ml-auto">{runs.length}</span>
          )}
        </div>

        {loading && runs.length === 0 ? (
          <div className="flex items-center gap-2 text-2xs text-foreground-subtle">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : runs.length === 0 ? (
          <div className="text-2xs text-foreground-subtle px-1">No simulations yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {runs.slice(0, 30).map((run) => (
              <button
                key={run.id}
                onClick={() => handleSelectRun(run.id)}
                className="text-left w-full px-2.5 py-2 rounded-md border border-transparent hover:bg-background-muted hover:border-border transition-all duration-200 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Circle className={`h-2 w-2 fill-current ${statusDotColor(run.status)} ${statusDotAnim(run.status)}`} />
                    <span className="text-xs font-medium text-foreground-muted group-hover:text-foreground">
                      #{run.id}
                    </span>
                  </div>
                  <span className={`text-2xs font-medium ${statusDotColor(run.status)}`}>
                    {run.status}
                  </span>
                </div>
                <div className="text-2xs text-foreground-subtle mt-0.5 truncate pl-4">
                  {new Date(run.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function findFirstAsset(folders: Folder[]): HydrofoilAsset | null {
  for (const f of folders) {
    if (f.assets && f.assets.length > 0) return f.assets[0];
    if (f.children) {
      const found = findFirstAsset(f.children);
      if (found) return found;
    }
  }
  return null;
}
