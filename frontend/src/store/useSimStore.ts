import { create } from 'zustand';

interface SimulationState {
  activeSimId: number | null;
  status: string;
  logs: string;
  resultMeshPath: string | null;
  
  // Simulation Inputs
  velocity: number;
  aoa: number;
  setVelocity: (val: number) => void;
  setAoA: (val: number) => void;

  startNewSim: (id: number) => void;
  updateSim: (data: any) => void;
}

export const useSimStore = create<SimulationState>((set) => ({
  activeSimId: null,
  status: 'IDLE',
  logs: '',
  resultMeshPath: null,
  
  velocity: 10,
  aoa: 5,
  setVelocity: (val) => set({ velocity: val }),
  setAoA: (val) => set({ aoa: val }),

  startNewSim: (id) => set({ 
    activeSimId: id, 
    status: 'PENDING', 
    logs: 'Request sent to server...', 
    resultMeshPath: null 
  }),
  updateSim: (data) => set({ 
    status: data.status, 
    logs: data.current_logs || '', 
    resultMeshPath: data.result_mesh_path || null 
  }),
}));
