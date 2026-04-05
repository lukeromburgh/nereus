export interface HydrofoilAsset {
  id: number;
  project: number;
  name: string;
  file: string;
  folder: number | null;
  uploaded_at: string;
}

export interface Folder {
  id: number;
  project: number;
  name: string;
  parent: number | null;
  children: Folder[];
  assets: HydrofoilAsset[];
  asset_count: number;
  created_at: string;
  updated_at: string;
}

export interface FolderTree {
  folders: Folder[];
  assets: HydrofoilAsset[];
}
