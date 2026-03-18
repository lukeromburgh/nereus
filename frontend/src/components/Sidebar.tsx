import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Box, PlayCircle, Circle, Loader2 } from "lucide-react";
import { useSimStore } from "../store/useSimStore";

type HydrofoilAsset = {
  id: number;
  project: number;
  name: string;
  file: string;
  uploaded_at: string;
};

type SimulationRun = {
  id: number;
  project: number;
  asset: number | null;
  status: string;
  created_at: string;
};

function statusDotColor(status: string) {
  if (status === "RUNNING" || status === "MESHING" || status === "PENDING")
    return "text-accent-glow";
  if (status === "COMPLETED") return "text-accent-emerald";
  if (status === "FAILED") return "text-accent-rose";
  return "text-slate-600";
}

function statusDotAnim(status: string) {
  if (status === "RUNNING" || status === "MESHING" || status === "PENDING")
    return "animate-pulse";
  return "";
}

interface SidebarProps {
  refreshNonce: number;
}

export function Sidebar({ refreshNonce }: SidebarProps) {
  const {
    projectId,
    selectedAssetId,
    setSelectedAsset,
    setSelectedAssetId,
    selectSim,
    updateSim,
  } = useSimStore();

  const [assets, setAssets] = useState<HydrofoilAsset[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [assetsResp, runsResp] = await Promise.all([
          axios.get<HydrofoilAsset[]>("http://localhost:8000/api/assets/"),
          axios.get<SimulationRun[]>("http://localhost:8000/api/runs/"),
        ]);

        if (cancelled) return;

        const assetsForProject = assetsResp.data.filter(
          (a) => a.project === projectId,
        );
        const runsForProject = runsResp.data
          .filter((r) => r.project === projectId)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

        setAssets(assetsForProject);
        setRuns(runsForProject);

        if (!selectedAssetId && assetsForProject.length > 0) {
          setSelectedAsset(assetsForProject[0]);
        }
      } catch (err) {
        console.error("Failed loading sidebar data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshNonce, selectedAssetId, setSelectedAssetId]);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) || null,
    [assets, selectedAssetId],
  );

  const handleSelectRun = async (runId: number) => {
    selectSim(runId);
    try {
      const { data } = await axios.get(
        `http://localhost:8000/api/runs/${runId}/`,
      );
      updateSim(data);
    } catch (err) {
      console.error("Failed to load run", err);
    }
  };

  return (
    <div className="p-3 flex flex-col gap-5 scrollbar-dark">
      {/* Assets */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Box className="h-3.5 w-3.5 text-accent-cyan" />
          <span className="hud-label">Assets</span>
        </div>

        {selectedAsset && (
          <div className="mb-3 px-2 py-1.5 rounded-md bg-accent/5 border border-accent/15">
            <div className="text-2xs text-slate-500">Active</div>
            <div className="text-xs font-medium text-slate-200 truncate">
              {selectedAsset.name}
            </div>
          </div>
        )}

        {loading && assets.length === 0 ? (
          <div className="flex items-center gap-2 text-2xs text-slate-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : assets.length === 0 ? (
          <div className="text-2xs text-slate-600 px-1">
            No assets yet. Upload one above.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {assets.map((asset) => {
              const isSelected = asset.id === selectedAssetId;
              return (
                <button
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  className={`text-left w-full px-2.5 py-2 rounded-md text-xs transition-all duration-200 ${
                    isSelected
                      ? "bg-accent/10 border border-accent/25 text-slate-100"
                      : "border border-transparent hover:bg-white/[0.03] hover:border-hud-border text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className="font-medium truncate">{asset.name}</div>
                  <div className="text-2xs text-slate-600 truncate mt-0.5">
                    {asset.file}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-hud-border" />

      {/* Simulation Runs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <PlayCircle className="h-3.5 w-3.5 text-accent-cyan" />
          <span className="hud-label">Runs</span>
          {runs.length > 0 && (
            <span className="text-2xs text-slate-600 font-mono ml-auto">
              {runs.length}
            </span>
          )}
        </div>

        {loading && runs.length === 0 ? (
          <div className="flex items-center gap-2 text-2xs text-slate-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : runs.length === 0 ? (
          <div className="text-2xs text-slate-600 px-1">
            No simulations yet.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {runs.slice(0, 30).map((run) => (
              <button
                key={run.id}
                onClick={() => handleSelectRun(run.id)}
                className="text-left w-full px-2.5 py-2 rounded-md border border-transparent hover:bg-white/[0.03] hover:border-hud-border transition-all duration-200 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Circle
                      className={`h-2 w-2 fill-current ${statusDotColor(run.status)} ${statusDotAnim(run.status)}`}
                    />
                    <span className="text-xs font-medium text-slate-300 group-hover:text-slate-100">
                      #{run.id}
                    </span>
                  </div>
                  <span
                    className={`text-2xs font-medium ${statusDotColor(run.status)}`}
                  >
                    {run.status}
                  </span>
                </div>
                <div className="text-2xs text-slate-600 mt-0.5 truncate pl-4">
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
