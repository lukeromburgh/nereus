import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useSimStore } from '../store/useSimStore';

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

function statusDotClass(status: string) {
  if (status === 'RUNNING' || status === 'MESHING' || status === 'PENDING') {
    return 'bg-blue-400 animate-pulse';
  }
  if (status === 'COMPLETED') {
    return 'bg-green-400';
  }
  if (status === 'FAILED') {
    return 'bg-orange-400';
  }
  return 'bg-slate-500';
}

interface SidebarProps {
  refreshNonce: number;
}

export function Sidebar({ refreshNonce }: SidebarProps) {
  const { projectId, selectedAssetId, setSelectedAsset, setSelectedAssetId, selectSim, updateSim } = useSimStore();

  const [assets, setAssets] = useState<HydrofoilAsset[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [assetsResp, runsResp] = await Promise.all([
          axios.get<HydrofoilAsset[]>('http://localhost:8000/api/assets/'),
          axios.get<SimulationRun[]>('http://localhost:8000/api/runs/'),
        ]);

        if (cancelled) return;

        const assetsForProject = assetsResp.data.filter((a) => a.project === projectId);
        const runsForProject = runsResp.data
          .filter((r) => r.project === projectId)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

        setAssets(assetsForProject);
        setRuns(runsForProject);

        if (!selectedAssetId && assetsForProject.length > 0) {
          setSelectedAsset(assetsForProject[0]);
        }
      } catch (err) {
        console.error('Failed loading sidebar data', err);
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
    [assets, selectedAssetId]
  );

  const handleSelectRun = async (runId: number) => {
    selectSim(runId);
    try {
      const { data } = await axios.get(`http://localhost:8000/api/runs/${runId}/`);
      updateSim(data);
    } catch (err) {
      console.error('Failed to load run', err);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2 text-slate-200">Assets</h2>
        <div className="text-xs text-slate-400 mb-3">
          Selected: <span className="text-slate-200">{selectedAsset?.name || 'None'}</span>
        </div>

        {loading && assets.length === 0 ? (
          <div className="text-sm text-slate-400">Loading assets…</div>
        ) : assets.length === 0 ? (
          <div className="text-sm text-slate-400">No assets yet. Use “Upload Asset” above.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {assets.map((asset) => {
              const isSelected = asset.id === selectedAssetId;
              return (
                <button
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  className={`text-left text-sm px-2 py-2 rounded border transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-900/20 text-slate-100'
                      : 'border-slate-700 bg-slate-900/20 hover:bg-slate-900/40 text-slate-200'
                  }`}
                >
                  <div className="font-bold truncate">{asset.name}</div>
                  <div className="text-xs text-slate-400 truncate">{asset.file}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-bold mb-2 text-slate-200">Simulation Runs</h2>

        {loading && runs.length === 0 ? (
          <div className="text-sm text-slate-400">Loading runs…</div>
        ) : runs.length === 0 ? (
          <div className="text-sm text-slate-400">No runs yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {runs.slice(0, 30).map((run) => (
              <button
                key={run.id}
                onClick={() => handleSelectRun(run.id)}
                className="text-left text-sm px-2 py-2 rounded border border-slate-700 bg-slate-900/20 hover:bg-slate-900/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(run.status)}`} />
                    <div className="font-bold text-slate-200">Run #{run.id}</div>
                  </div>
                  <div className="text-xs text-slate-400">{run.status}</div>
                </div>
                <div className="text-xs text-slate-500 truncate">
                  Asset: {run.asset ?? 'None'} • {new Date(run.created_at).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
