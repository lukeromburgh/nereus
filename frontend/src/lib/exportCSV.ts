/**
 * Export simulation data as downloadable CSV files.
 */

export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function metricsToCSV(
  data: Record<string, unknown>[],
  keys: string[],
): string {
  const header = ["frame_index", "time_value", ...keys].join(",");
  const rows = data.map((row) =>
    ["frame_index", "time_value", ...keys]
      .map((k) => {
        const v = row[k];
        if (v === null || v === undefined) return "";
        return String(v);
      })
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export function convergenceToCSV(
  data: {
    iteration?: number | null;
    time?: number | null;
    residual?: number;
  }[],
): string {
  const header = "iteration,time,residual";
  const rows = data.map(
    (r) => `${r.iteration ?? ""},${r.time ?? ""},${r.residual ?? ""}`,
  );
  return [header, ...rows].join("\n");
}
