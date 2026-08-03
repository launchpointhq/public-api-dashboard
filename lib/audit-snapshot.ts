export type AuditResult = {
  method: "GET" | "POST";
  path: string;
  status: number;
  ok: boolean;
  latencyMs: number;
  note: string;
};

export const LATEST_AUDIT = {
  ranAt: "2026-08-03T20:12:20.512Z",
  total: 17,
  passed: 17,
  failed: 0,
  authGuardsPassed: 17,
  authGuardsTotal: 17,
  results: [
    { method: "GET", path: "/programs", status: 200, ok: true, latencyMs: 109, note: "Pagination and response shape passed" },
    { method: "GET", path: "/posts", status: 200, ok: true, latencyMs: 325, note: "Real post catalog returned" },
    { method: "GET", path: "/posts/{id}", status: 200, ok: true, latencyMs: 214, note: "Real post detail passed" },
    { method: "GET", path: "/posts/{id}/metrics-history", status: 200, ok: true, latencyMs: 265, note: "30-day real history passed" },
    { method: "POST", path: "/posts/export", status: 200, ok: true, latencyMs: 85, note: "Header-only CSV passed" },
    { method: "GET", path: "/analytics/kpis", status: 200, ok: true, latencyMs: 222, note: "KPI groups passed" },
    { method: "GET", path: "/analytics/videos", status: 200, ok: true, latencyMs: 128, note: "View sorting and summary passed" },
    { method: "GET", path: "/analytics/accounts", status: 200, ok: true, latencyMs: 250, note: "Total-view sorting and summary passed" },
    { method: "GET", path: "/analytics/overview", status: 200, ok: true, latencyMs: 220, note: "Summary and breakdown passed" },
    { method: "GET", path: "/analytics/recruitment", status: 200, ok: true, latencyMs: 102, note: "30-day UTC range passed" },
    { method: "POST", path: "/programs/{id}/invite", status: 400, ok: true, latencyMs: 76, note: "Invalid invite was rejected without changes" },
    { method: "GET", path: "/payouts", status: 200, ok: true, latencyMs: 652, note: "Wallet activity and summary passed" },
    { method: "GET", path: "/payouts/stats", status: 200, ok: true, latencyMs: 126, note: "All six wallet totals passed" },
    { method: "GET", path: "/payouts/pending", status: 200, ok: true, latencyMs: 128, note: "Amount sorting and summary passed" },
    { method: "GET", path: "/creators", status: 200, ok: true, latencyMs: 120, note: "Campaign-status response passed" },
    { method: "GET", path: "/creators/collections", status: 200, ok: true, latencyMs: 131, note: "Collection response passed" },
    { method: "GET", path: "/contracts", status: 200, ok: true, latencyMs: 113, note: "Pagination and hidden payment details passed" },
  ] satisfies AuditResult[],
};
