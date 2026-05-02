import { useEffect, useMemo, useState } from "react";
import { Box, PlayCircle, Circle, Loader2, ChevronRight, Folder as FolderIcon, FolderOpen, FileBox } from "lucide-react";
import { useSimStore } from "../store/useSimStore";
import apiClient from "../lib/apiClient";
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
  if (status === "RUNNING" || status === "MESHING")
    return "text-[#00d4ff]";
  if (status === "PENDING") return "text-[#f5a623]";
  if (status === "COMPLETED") return "text-[#34d399]";
  if (status === "FAILED") return "text-[#ef4444]";
  return "text-[rgba(255,255,255,0.35)]";
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
      className={`text-left w-full flex items-center gap-1.5 py-1 text-[11px] transition-all duration-150 ${
        isSelected
          ? "bg-[rgba(0,212,255,0.06)] border-l-2 border-nereus-accent text-white"
          : "border-l-2 border-transparent hover:bg-[rgba(255,255,255,0.03)] text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.8)]"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: 8 }}
    >
      <FileBox className="h-[14px] w-[14px] text-[rgba(255,255,255,0.25)] flex-shrink-0" />
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
        className="text-left w-full flex items-center gap-1.5 py-1 text-[11px] text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.8)] hover:bg-[rgba(255,255,255,0.03)] transition-all duration-150"
        style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: 8 }}
      >
        <ChevronRight
          className={`h-[10px] w-[10px] text-[rgba(255,255,255,0.25)] transition-transform flex-shrink-0 ${isOpen ? "rotate-90" : ""}`}
        />
        {isOpen ? (
          <FolderOpen className="h-[14px] w-[14px] text-[#fbbf24] flex-shrink-0" />
        ) : (
          <FolderIcon className="h-[14px] w-[14px] text-[#fbbf24] flex-shrink-0" />
        )}
        <span className="truncate font-medium">{folder.name}</span>
        {folder.asset_count > 0 && (
          <span className="text-[10px] text-[rgba(255,255,255,0.2)] ml-auto font-mono">
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
          apiClient.get<SimulationRun[]>("/api/runs/"),
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
      const { data } = await apiClient.get(`/api/runs/${runId}/`);
      updateSim(data);
    } catch (err) {
      console.error("Failed to load run", err);
    }
  };

  const hasAnyAssets = rootFolders.length > 0 || rootAssets.length > 0;

  return (
    <div className="p-2.5 flex flex-col gap-4 scrollbar-dark">
      {/* Assets section */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Box className="h-[14px] w-[14px] text-[rgba(255,255,255,0.35)]" />
          <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">Assets</span>
        </div>

        {selectedAsset && (
          <div className="mb-2 px-2 py-1.5 bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.12)]" style={{ borderRadius: '2px' }}>
            <div className="text-[10px] text-[rgba(255,255,255,0.35)]">Active</div>
            <div className="text-[11px] font-medium text-white truncate">{selectedAsset.name}</div>
          </div>
        )}

        {loading && !hasAnyAssets ? (
          <div className="flex items-center gap-1.5 text-[10px] text-[rgba(255,255,255,0.35)]">
            <Loader2 className="h-[14px] w-[14px] animate-spin" />
            Loading…
          </div>
        ) : !hasAnyAssets ? (
          <div className="text-[10px] text-[rgba(255,255,255,0.35)] px-1">No assets yet. Upload one above.</div>
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

      <div className="h-px bg-[rgba(255,255,255,0.06)]" />

      {/* Simulation Runs section */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <PlayCircle className="h-[14px] w-[14px] text-[rgba(255,255,255,0.35)]" />
          <span className="text-[10px] tracking-[0.1em] uppercase text-[rgba(255,255,255,0.35)]">Runs</span>
          {runs.length > 0 && (
            <span className="text-[10px] text-[rgba(255,255,255,0.2)] font-mono ml-auto">{runs.length}</span>
          )}
        </div>

        {loading && runs.length === 0 ? (
          <div className="flex items-center gap-1.5 text-[10px] text-[rgba(255,255,255,0.35)]">
            <Loader2 className="h-[14px] w-[14px] animate-spin" />
            Loading…
          </div>
        ) : runs.length === 0 ? (
          <div className="text-[10px] text-[rgba(255,255,255,0.35)] px-1">No simulations yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {runs.slice(0, 30).map((run) => (
              <button
                key={run.id}
                onClick={() => handleSelectRun(run.id)}
                className="text-left w-full px-2 py-1.5 border-l-2 border-transparent hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.1)] transition-all duration-150 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Circle className={`h-1.5 w-1.5 fill-current ${statusDotColor(run.status)} ${statusDotAnim(run.status)}`} />
                    <span className="text-[11px] font-medium text-[rgba(255,255,255,0.5)] group-hover:text-white font-mono">
                      #{run.id}
                    </span>
                  </div>
                  <span className={`text-[10px] font-medium font-mono ${statusDotColor(run.status)}`}>
                    {run.status}
                  </span>
                </div>
                <div className="text-[10px] text-[rgba(255,255,255,0.25)] mt-0.5 truncate pl-4 font-mono">
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
