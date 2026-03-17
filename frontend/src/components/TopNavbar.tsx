import React, { useRef, useState } from 'react';
import axios from 'axios';
import { useSimStore } from '../store/useSimStore';

interface TopNavbarProps {
  onRefresh: () => void;
}

export function TopNavbar({ onRefresh }: TopNavbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { projectId, setSelectedAsset } = useSimStore();

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle');

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadState('uploading');

    const form = new FormData();
    form.append('project', String(projectId));

    // Use filename as default asset name
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    form.append('name', baseName || 'Hydrofoil');
    form.append('file', file);

    try {
      const { data } = await axios.post('http://localhost:8000/api/assets/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (typeof data?.id === 'number') {
        setSelectedAsset(data);
      }

      setUploadState('idle');
      onRefresh();
    } catch (err) {
      console.error('Asset upload failed', err);
      setUploadState('error');
    } finally {
      // allow selecting same file again
      e.target.value = '';
    }
  };

  return (
    <div className="h-12 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-950/70">
      <div className="flex items-center gap-3">
        <div className="text-slate-100 font-bold tracking-wide">Nereus</div>
        <div className="text-xs text-slate-400">Dashboard</div>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".stl,.obj,.gltf,.glb"
          className="hidden"
          onChange={handleFileSelected}
        />

        <button
          onClick={handleUploadClick}
          disabled={uploadState === 'uploading'}
          className={`px-3 py-1.5 rounded text-sm font-bold border transition-colors ${
            uploadState === 'uploading'
              ? 'border-slate-700 bg-slate-800 text-slate-400 cursor-not-allowed'
              : 'border-slate-600 bg-slate-800/60 hover:bg-slate-800 text-slate-100'
          }`}
        >
          {uploadState === 'uploading' ? 'Uploading…' : 'Upload Asset'}
        </button>

        <button
          onClick={onRefresh}
          className="px-3 py-1.5 rounded text-sm font-bold border border-slate-600 bg-slate-800/60 hover:bg-slate-800 text-slate-100 transition-colors"
        >
          Refresh
        </button>

        {uploadState === 'error' && (
          <div className="text-xs text-orange-400 ml-2">Upload failed</div>
        )}
      </div>
    </div>
  );
}
