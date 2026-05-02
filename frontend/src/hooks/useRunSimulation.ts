import { useState } from "react";
import apiClient, { isAxiosError } from "../lib/apiClient";
import { toast } from "@/lib/toast";

export interface UseRunSimulationResult {
  run: (runData: any) => Promise<any>;
  isLoading: boolean;
}

export function useRunSimulation(): UseRunSimulationResult {
  const [isLoading, setIsLoading] = useState(false);

  async function run(runData: any): Promise<any> {
    setIsLoading(true);

    try {
      const response = await apiClient.post("/api/runs/", runData);
      const result = response?.data;

      const id = result?.id;
      const shortId = id != null ? String(id).slice(0, 6) : "unknown";

      toast.success(`✓ Simulation started (ID: ${shortId})`);

      return result;
    } catch (error) {
      let message = "Failed to start simulation";

      if (isAxiosError(error)) {
        const responseData = (error.response?.data as any) ?? {};
        message =
          (typeof responseData?.detail === "string" && responseData.detail) ||
          (typeof responseData?.message === "string" && responseData.message) ||
          error.message ||
          message;
      } else if (error instanceof Error) {
        message = error.message || message;
      }

      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  return { run, isLoading };
}
