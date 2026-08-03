export type Endpoint = {
  method: "GET" | "POST";
  path: string;
  group: "Programs" | "Posts" | "Analytics" | "Payouts" | "Creators" | "Contracts";
  name: string;
  description: string;
  defaultQuery?: string;
  defaultBody?: string;
  writes?: boolean;
};

export const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/programs", group: "Programs", name: "List programs", description: "Campaigns with status, search, and pagination.", defaultQuery: "page=1&limit=10" },
  { method: "GET", path: "/posts", group: "Posts", name: "List posts", description: "Tracked content with program, creator, platform, and date filters.", defaultQuery: "page=1&limit=10" },
  { method: "GET", path: "/posts/{id}", group: "Posts", name: "Get post", description: "A post, its creator, program, contract, payment, and current metrics." },
  { method: "GET", path: "/posts/{id}/metrics-history", group: "Posts", name: "Post metrics history", description: "Daily metric snapshots, deltas, and growth.", defaultQuery: "days=30&limit=30" },
  { method: "POST", path: "/posts/export", group: "Posts", name: "Export posts", description: "Download matching post data as CSV.", defaultBody: '{\n  "selectedIds": []\n}' },
  { method: "GET", path: "/analytics/kpis", group: "Analytics", name: "Comprehensive KPIs", description: "Program, contract, post, and creator status totals." },
  { method: "GET", path: "/analytics/videos", group: "Analytics", name: "Tracked videos", description: "Sortable content analytics and portfolio totals.", defaultQuery: "page=1&limit=10&sortBy=views&sortOrder=desc" },
  { method: "GET", path: "/analytics/accounts", group: "Analytics", name: "Tracked accounts", description: "Performance rolled up by creator handle.", defaultQuery: "page=1&limit=10&sortBy=totalViews&sortOrder=desc" },
  { method: "GET", path: "/analytics/overview", group: "Analytics", name: "Analytics overview", description: "Summary, top posts, top creators, and platform mix." },
  { method: "GET", path: "/analytics/recruitment", group: "Analytics", name: "Recruitment analytics", description: "Daily invite, response, and response-rate activity." },
  { method: "POST", path: "/programs/{id}/invite", group: "Programs", name: "Create invite link", description: "Create a shareable creator invite link.", defaultBody: '{\n  "expiresInDays": 7,\n  "maxUses": 25\n}', writes: true },
  { method: "GET", path: "/payouts", group: "Payouts", name: "Wallet activity", description: "Read-only credits, debits, adjustments, and refunds.", defaultQuery: "page=1&limit=10" },
  { method: "GET", path: "/payouts/stats", group: "Payouts", name: "Wallet stats", description: "Balance, amount owed, deposits, and lifetime paid." },
  { method: "GET", path: "/payouts/pending", group: "Payouts", name: "Pending payouts", description: "Due, overdue, and upcoming creator payouts.", defaultQuery: "page=1&limit=10&sortBy=amount&sortOrder=desc" },
  { method: "GET", path: "/creators", group: "Creators", name: "List creators", description: "Creators with campaign-level contract status.", defaultQuery: "page=1&limit=10" },
  { method: "GET", path: "/creators/collections", group: "Creators", name: "Creator collections", description: "Saved creator groups for this company." },
  { method: "GET", path: "/contracts", group: "Contracts", name: "List contracts", description: "Contract metadata without sensitive payment details.", defaultQuery: "page=1&limit=10" },
];

export const DOCS_BASE = "https://docs.launchpointhq.com/api-reference/v1";
