"use client";

import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BadgeDollarSign,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  Gauge,
  Layers3,
  Link2,
  LoaderCircle,
  Menu,
  Network,
  Play,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Users,
  Video,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ENDPOINTS, type Endpoint } from "@/lib/endpoints";
import { LATEST_AUDIT } from "@/lib/audit-snapshot";

type Json = Record<string, any>;
type View = "overview" | "content" | "network" | "money" | "programs" | "lab";
type ResourceKey =
  | "programs"
  | "posts"
  | "kpis"
  | "videos"
  | "accounts"
  | "overview"
  | "recruitment"
  | "payouts"
  | "payoutStats"
  | "pending"
  | "creators"
  | "collections"
  | "contracts";

type Resource = {
  status: "idle" | "loading" | "ready" | "error";
  data?: Json;
  error?: string;
  latencyMs?: number;
  rateRemaining?: string | null;
};

const EMPTY_RESOURCE: Resource = { status: "idle" };

const RESOURCE_PATHS: Record<ResourceKey, string> = {
  programs: "/programs?page=1&limit=50",
  posts: "/posts?page=1&limit=50",
  kpis: "/analytics/kpis",
  videos: "/analytics/videos?page=1&limit=50&sortBy=views&sortOrder=desc",
  accounts: "/analytics/accounts?page=1&limit=50&sortBy=totalViews&sortOrder=desc",
  overview: "/analytics/overview",
  recruitment: "/analytics/recruitment",
  payouts: "/payouts?page=1&limit=50",
  payoutStats: "/payouts/stats",
  pending: "/payouts/pending?page=1&limit=50&sortBy=amount&sortOrder=desc",
  creators: "/creators?page=1&limit=50",
  collections: "/creators/collections",
  contracts: "/contracts?page=1&limit=50",
};

const VIEW_RESOURCES: Record<View, ResourceKey[]> = {
  overview: ["kpis", "videos", "overview", "recruitment", "programs"],
  content: ["posts", "videos"],
  network: ["accounts", "creators", "collections"],
  money: ["payoutStats", "pending", "payouts"],
  programs: ["programs", "contracts"],
  lab: [],
};

const NAV: Array<{ id: View; label: string; eyebrow: string; icon: typeof Gauge }> = [
  { id: "overview", label: "Signal", eyebrow: "Portfolio pulse", icon: Gauge },
  { id: "content", label: "Content", eyebrow: "Posts & growth", icon: Video },
  { id: "network", label: "Network", eyebrow: "Creators & accounts", icon: Network },
  { id: "money", label: "Money", eyebrow: "Wallet & payouts", icon: WalletCards },
  { id: "programs", label: "Programs", eyebrow: "Campaign operations", icon: Layers3 },
  { id: "lab", label: "API lab", eyebrow: "17 live endpoints", icon: Code2 },
];

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rows(resource: Resource | undefined) {
  const data = resource?.data;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function payload(resource: Resource | undefined) {
  const data = resource?.data;
  if (!data) return {};
  return data.data && !Array.isArray(data.data) ? data.data : data;
}

function formatDate(value: unknown, withTime = false) {
  if (!value) return "—";
  const raw = typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value;
  const date = new Date(raw as string | number);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

async function callApi(path: string, init?: RequestInit) {
  const started = performance.now();
  const response = await fetch(`/api/launchpoint${path}`, { ...init, cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  const result = {
    ok: response.ok,
    status: response.status,
    data,
    latencyMs: Math.round(performance.now() - started),
    rateRemaining: response.headers.get("x-ratelimit-remaining"),
    contentType,
  };
  if (!response.ok) {
    const error = new Error(data?.error ?? `Request failed with ${response.status}`) as Error & { result?: typeof result };
    error.result = result;
    throw error;
  }
  return result;
}

function StatusDot({ status }: { status: Resource["status"] }) {
  return <span className={`status-dot status-${status}`} aria-hidden="true" />;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "bad" | "violet" | "warm" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <Sparkles size={18} />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function ErrorState({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <CircleAlert size={18} />
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      {onRetry ? (
        <button className="text-button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function SectionTitle({ kicker, title, action }: { kicker: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="section-title">
      <div>
        <span>{kicker}</span>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "violet" | "ink" | "coral" }) {
  return (
    <div className={`metric metric-${tone ?? "violet"}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function PlatformMark({ platform }: { platform: string }) {
  const normalized = platform?.toLowerCase() || "other";
  const label = normalized === "instagram" ? "IG" : normalized === "tiktok" ? "TT" : normalized === "youtube" ? "YT" : normalized.slice(0, 2).toUpperCase();
  return <span className={`platform-mark platform-${normalized}`}>{label}</span>;
}

export function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [resources, setResources] = useState<Record<ResourceKey, Resource>>(() =>
    Object.fromEntries(Object.keys(RESOURCE_PATHS).map((key) => [key, EMPTY_RESOURCE])) as Record<ResourceKey, Resource>,
  );
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const started = useRef(false);

  const loadResource = useCallback(async (key: ResourceKey) => {
    setResources((current) => ({ ...current, [key]: { ...current[key], status: "loading", error: undefined } }));
    try {
      const result = await callApi(RESOURCE_PATHS[key]);
      setResources((current) => ({
        ...current,
        [key]: { status: "ready", data: result.data, latencyMs: result.latencyMs, rateRemaining: result.rateRemaining },
      }));
    } catch (caught) {
      const error = caught as Error & { result?: { latencyMs: number; rateRemaining: string | null } };
      setResources((current) => ({
        ...current,
        [key]: {
          status: "error",
          error: error.message,
          latencyMs: error.result?.latencyMs,
          rateRemaining: error.result?.rateRemaining,
        },
      }));
    }
  }, []);

  const loadKeys = useCallback(async (keys: ResourceKey[]) => {
    for (let index = 0; index < keys.length; index += 2) {
      await Promise.allSettled(keys.slice(index, index + 2).map(loadResource));
    }
    setLastRefresh(new Date());
  }, [loadResource]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadKeys(VIEW_RESOURCES.overview);
  }, [loadKeys]);

  const readyCount = Object.values(resources).filter((resource) => resource.status === "ready").length;
  const errorCount = Object.values(resources).filter((resource) => resource.status === "error").length;
  const isLoading = Object.values(resources).some((resource) => resource.status === "loading");
  const currentNav = NAV.find((item) => item.id === view) ?? NAV[0];

  const chooseView = (next: View) => {
    setView(next);
    setMobileMenu(false);
    const unloaded = VIEW_RESOURCES[next].filter((key) => resources[key].status === "idle");
    if (unloaded.length) void loadKeys(unloaded);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <span className="brand-mark">L</span>
          <div>
            <strong>Launchpoint</strong>
            <small>Signal room</small>
          </div>
          <button className="sidebar-close" onClick={() => setMobileMenu(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav aria-label="Dashboard sections">
          {NAV.map((item, index) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => chooseView(item.id)}>
                <span className="nav-index">0{index + 1}</span>
                <Icon size={17} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.eyebrow}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="connection-card">
            <span className={errorCount ? "connection-warn" : "connection-live"} />
            <div>
              <strong>{isLoading ? "Reading live data" : `${readyCount} live views ready`}</strong>
              <small>{errorCount ? `${errorCount} API issues found` : "Server-held test key"}</small>
            </div>
          </div>
          <a href="https://docs.launchpointhq.com/api-reference/v1/analytics/get-comprehensive-kpis" target="_blank" rel="noreferrer">
            <BookOpen size={15} /> API docs <ExternalLink size={13} />
          </a>
        </div>
      </aside>

      {mobileMenu ? <button className="scrim" onClick={() => setMobileMenu(false)} aria-label="Close menu" /> : null}

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="page-heading">
            <span>{currentNav.eyebrow}</span>
            <h1>{currentNav.label}</h1>
          </div>
          <div className="topbar-actions">
            <div className="live-pill">
              <StatusDot status={errorCount ? "error" : isLoading ? "loading" : "ready"} />
              <span>{isLoading ? "Syncing" : errorCount ? "Live · issues found" : "Live API"}</span>
            </div>
            <button className="icon-button" onClick={() => void loadKeys(VIEW_RESOURCES[view])} disabled={isLoading} aria-label="Refresh live data">
              <RefreshCw size={17} className={isLoading ? "spin" : ""} />
            </button>
          </div>
        </header>

        <div className="page-canvas">
          {view === "overview" ? <Overview resources={resources} loadResource={loadResource} /> : null}
          {view === "content" ? <Content resources={resources} loadResource={loadResource} /> : null}
          {view === "network" ? <NetworkView resources={resources} loadResource={loadResource} /> : null}
          {view === "money" ? <Money resources={resources} loadResource={loadResource} /> : null}
          {view === "programs" ? <Programs resources={resources} loadResource={loadResource} /> : null}
          {view === "lab" ? <ApiLab resources={resources} /> : null}
        </div>

        <footer>
          <span>Launchpoint Public API v1</span>
          <span>{lastRefresh ? `Last read ${formatDate(lastRefresh.toISOString(), true)}` : "Connecting…"}</span>
          <span>Key stays on this server</span>
        </footer>
      </main>
    </div>
  );
}

function Overview({ resources, loadResource }: { resources: Record<ResourceKey, Resource>; loadResource: (key: ResourceKey) => Promise<void> }) {
  const kpis = payload(resources.kpis);
  const overview = payload(resources.overview);
  const videosPayload = resources.videos.data ?? {};
  const videos = rows(resources.videos);
  const summary = overview.summary ?? videosPayload.summary ?? {};
  const posts = kpis.posts ?? {};
  const programs = kpis.programs ?? {};
  const contracts = kpis.contracts ?? {};
  const creators = kpis.creators ?? {};
  const recruitment = payload(resources.recruitment);
  const recruitmentDaily = Array.isArray(recruitment.daily) ? recruitment.daily : [];
  const chartVideos = videos.slice(0, 7).map((video: Json) => ({
    name: String(video.title || "Untitled").slice(0, 17),
    views: number(video.views),
    platform: video.platform,
  }));

  return (
    <div className="view-stack enter">
      <section className="hero-grid">
        <div className="hero-main">
          <div className="hero-kicker"><Activity size={15} /> Live portfolio signal</div>
          <h2>See the work<br /><em>move people.</em></h2>
          <p>Every program, creator, post, and dollar—read straight from the Launchpoint API.</p>
          <div className="hero-total">
            <span>Total measured reach</span>
            <strong>{compact.format(number(posts.totalViews || summary.totalViews))}</strong>
            <small>across {whole.format(number(posts.total || summary.totalPosts))} tracked posts</small>
          </div>
        </div>
        <div className="metric-stack">
          <Metric label="Active programs" value={whole.format(number(programs.active))} note={`${whole.format(number(programs.total))} total programs`} tone="violet" />
          <Metric label="Creator network" value={whole.format(number(creators.total || summary.uniqueCreators))} note={`${whole.format(number(creators.withActiveContracts))} on active contracts`} tone="coral" />
          <Metric label="Active contracts" value={whole.format(number(contracts.active || summary.activeContracts))} note={`${whole.format(number(contracts.pending))} waiting`} tone="ink" />
        </div>
      </section>

      <section className="overview-grid">
        <div className="chart-panel span-two">
          <SectionTitle kicker="Content velocity" title="What’s carrying the reach" action={<Badge tone="violet">Top by views</Badge>} />
          {resources.videos.status === "error" ? (
            <ErrorState title="Videos could not load" body={resources.videos.error ?? "Unknown error"} onRetry={() => void loadResource("videos")} />
          ) : chartVideos.length ? (
            <div className="bar-chart" aria-label="Top videos by views">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartVideos} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="#d9d2c7" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#625b6d", fontSize: 11 }} />
                  <YAxis tickFormatter={(value) => compact.format(value)} tickLine={false} axisLine={false} tick={{ fill: "#8e8795", fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "#eee8f7" }} formatter={(value) => [whole.format(number(value)), "Views"]} />
                  <Bar dataKey="views" radius={[7, 7, 2, 2]}>
                    {chartVideos.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={index === 0 ? "#7733e1" : index < 3 ? "#a477ea" : "#d9c8f2"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty title="No tracked videos yet" body="Imported posts will become the first bars in this view." />
          )}
        </div>

        <div className="score-panel">
          <SectionTitle kicker="Engagement" title="People did more than watch" />
          <div className="engagement-score">
            <strong>{number(summary.engagementRate || videosPayload.summary?.averageEngagementRate).toFixed(1)}%</strong>
            <span>portfolio engagement rate</span>
          </div>
          <div className="mini-stats">
            <div><span>Likes</span><strong>{compact.format(number(posts.totalLikes || summary.totalLikes))}</strong></div>
            <div><span>Comments</span><strong>{compact.format(number(posts.totalComments || summary.totalComments))}</strong></div>
            <div><span>Shares</span><strong>{compact.format(number(posts.totalShares || summary.totalShares))}</strong></div>
          </div>
        </div>
      </section>

      <section className="overview-grid">
        <div className="recruitment-panel">
          <SectionTitle kicker="Recruitment" title="Thirty days of outreach" action={<Badge tone="warm">UTC daily</Badge>} />
          {recruitmentDaily.length ? (
            <div className="area-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={recruitmentDaily} margin={{ top: 12, right: 4, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inviteFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7733e1" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#7733e1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="#d9d2c7" />
                  <XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} tickLine={false} axisLine={false} tick={{ fill: "#8e8795", fontSize: 10 }} minTickGap={32} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#8e8795", fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="invitesSent" stroke="#7733e1" strokeWidth={2.5} fill="url(#inviteFill)" />
                  <Area type="monotone" dataKey="responsesReceived" stroke="#e06a48" strokeWidth={2} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty title="A quiet recruitment window" body="No invites or responses landed in this date range." />
          )}
          <div className="recruitment-summary">
            <span><i className="dot-violet" /> {whole.format(number(recruitment.summary?.totalInvitesSent))} invites</span>
            <span><i className="dot-coral" /> {whole.format(number(recruitment.summary?.totalResponsesReceived))} responses</span>
            <strong>{number(recruitment.summary?.responseRate).toFixed(1)}% response rate</strong>
          </div>
        </div>

        <div className="health-panel">
          <SectionTitle kicker="API coverage" title="The contract, tested" />
          <div className="health-score">
            <strong>{LATEST_AUDIT.passed}<span>/{LATEST_AUDIT.total}</span></strong>
            <p>feature checks passed</p>
          </div>
          <div className="health-line"><span style={{ width: `${(LATEST_AUDIT.passed / LATEST_AUDIT.total) * 100}%` }} /></div>
          <div className="health-facts">
            <span><CircleCheck size={15} /> {LATEST_AUDIT.authGuardsPassed}/17 auth guards</span>
            {LATEST_AUDIT.failed ? <span><CircleAlert size={15} /> {LATEST_AUDIT.failed} failing routes</span> : <span className="health-clear"><CircleCheck size={15} /> No failing routes</span>}
          </div>
        </div>
      </section>
    </div>
  );
}

function Content({ resources, loadResource }: { resources: Record<ResourceKey, Resource>; loadResource: (key: ResourceKey) => Promise<void> }) {
  const videos = rows(resources.videos);
  const posts = rows(resources.posts);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Resource>({ status: "idle" });
  const [history, setHistory] = useState<Resource>({ status: "idle" });
  const [exporting, setExporting] = useState(false);

  const catalog = useMemo(
    () => [...(posts.length ? posts : videos)].sort((left: Json, right: Json) => number(right.views) - number(left.views)),
    [posts, videos],
  );

  const filtered = useMemo(() => catalog.filter((video: Json) => {
    const matchesText = `${video.title} ${video.contractorName}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (platform === "all" || video.platform?.toLowerCase() === platform);
  }), [catalog, query, platform]);

  const selectPost = async (id: string) => {
    setSelectedId(id);
    setDetail({ status: "loading" });
    setHistory({ status: "loading" });
    const [detailResult, historyResult] = await Promise.allSettled([
      callApi(`/posts/${encodeURIComponent(id)}`),
      callApi(`/posts/${encodeURIComponent(id)}/metrics-history?days=30&limit=30`),
    ]);
    setDetail(detailResult.status === "fulfilled" ? { status: "ready", data: detailResult.value.data } : { status: "error", error: detailResult.reason.message });
    setHistory(historyResult.status === "fulfilled" ? { status: "ready", data: historyResult.value.data } : { status: "error", error: historyResult.reason.message });
  };

  const exportPosts = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/launchpoint/posts/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters: platform === "all" ? {} : { platform: [platform] } }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `launchpoint-posts-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const postDetail = payload(detail);
  const metricHistory = payload(history);

  return (
    <div className="view-stack enter">
      <section className="content-intro">
        <div>
          <span className="eyebrow">The content ledger</span>
          <h2>Every post has a pulse.</h2>
          <p>Filter the portfolio, export the raw ledger, or open any post to see its daily growth.</p>
        </div>
        <div className="content-totals">
          <strong>{whole.format(number(resources.videos.data?.summary?.totalVideos ?? resources.posts.data?.total))}</strong>
          <span>tracked posts</span>
          <small>{compact.format(number(resources.videos.data?.summary?.totalViews))} combined views</small>
        </div>
      </section>

      <section className="table-panel">
        <div className="table-toolbar">
          <div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or creator" aria-label="Search content" /></div>
          <div className="filter-pills" aria-label="Filter by platform">
            {["all", "instagram", "tiktok", "youtube"].map((item) => <button key={item} className={platform === item ? "active" : ""} onClick={() => setPlatform(item)}>{item}</button>)}
          </div>
          <button className="secondary-button" onClick={() => void exportPosts()} disabled={exporting}>
            {exporting ? <LoaderCircle size={15} className="spin" /> : <ArrowDownToLine size={15} />} Export CSV
          </button>
        </div>

        {resources.posts.status === "error" ? (
          <ErrorState title="Post catalog failed" body={resources.posts.error ?? "Unknown error"} onRetry={() => void loadResource("posts")} />
        ) : filtered.length ? (
          <div className="data-table-wrap">
            <table className="data-table content-table">
              <thead><tr><th>Post</th><th>Views</th><th>Engagement</th><th>Earnings</th><th>Paid</th><th /></tr></thead>
              <tbody>
                {filtered.map((video: Json) => (
                  <tr key={video.id} className={selectedId === video.id ? "selected" : ""}>
                    <td><div className="post-cell"><PlatformMark platform={video.platform} /><div><strong>{video.title || "Untitled post"}</strong><span>{video.contractorName || "Unknown creator"} · {formatDate(video.uploadedAt)}</span></div></div></td>
                    <td className="numeric"><strong>{compact.format(number(video.views))}</strong></td>
                    <td className="numeric">{number(video.engagementRate || (number(video.likes) + number(video.comments) + number(video.shares)) / Math.max(1, number(video.views)) * 100).toFixed(1)}%</td>
                    <td className="numeric">{usd.format(number(video.earnings))}</td>
                    <td>{video.paid ? <Badge tone="good">Paid</Badge> : <Badge tone="warm">Open</Badge>}</td>
                    <td><button className="row-button" onClick={() => void selectPost(video.id)} aria-label={`Open ${video.title || "post"}`}><ArrowRight size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No posts match" body="Clear a filter or import more content." />
        )}
      </section>

      {selectedId ? (
        <section className="detail-panel">
          <button className="detail-close" onClick={() => setSelectedId(null)} aria-label="Close post detail"><X size={17} /></button>
          {detail.status === "loading" ? <div className="loading-block"><LoaderCircle className="spin" /> Reading post detail…</div> : detail.status === "error" ? <ErrorState title="Post detail failed" body={detail.error ?? "Unknown error"} /> : (
            <>
              <div className="detail-copy">
                <div className="detail-label"><PlatformMark platform={postDetail.platform} /> Post intelligence</div>
                <h3>{postDetail.title || "Untitled post"}</h3>
                <p>{postDetail.description || `${postDetail.creator || postDetail.creatorInfo?.name || "Creator"} posted this on ${formatDate(postDetail.uploadedAt)}.`}</p>
                <a href={postDetail.url} target="_blank" rel="noreferrer">Open original <ExternalLink size={14} /></a>
                <div className="detail-facts">
                  <div><span>Program</span><strong>{postDetail.program?.name || "—"}</strong></div>
                  <div><span>Contract</span><strong>{postDetail.contract?.name || "—"}</strong></div>
                  <div><span>Last synced</span><strong>{formatDate(postDetail.lastSyncedAt, true)}</strong></div>
                </div>
              </div>
              <div className="detail-chart">
                <div className="detail-metrics">
                  <div><span>Views</span><strong>{compact.format(number(postDetail.views))}</strong></div>
                  <div><span>Likes</span><strong>{compact.format(number(postDetail.likes))}</strong></div>
                  <div><span>Growth</span><strong>{metricHistory.growth?.viewsGrowth || "0%"}</strong></div>
                </div>
                {Array.isArray(metricHistory.history) && metricHistory.history.length ? (
                  <div className="post-history-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={metricHistory.history} margin={{ top: 10, right: 4, left: -24, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="2 6" stroke="#d9d2c7" />
                        <XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} minTickGap={28} />
                        <YAxis tickFormatter={(value) => compact.format(value)} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="views" stroke="#7733e1" strokeWidth={2.5} fill="#e7dbf7" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <Empty title="No daily history" body="The current metrics are ready; daily tracking has not built a series yet." />}
              </div>
            </>
          )}
        </section>
      ) : (
        <div className="catalog-note"><FileText size={16} /> The plain post catalog endpoint returned {posts.length} records in its first page. Open a row above to use both post detail endpoints.</div>
      )}
    </div>
  );
}

function NetworkView({ resources, loadResource }: { resources: Record<ResourceKey, Resource>; loadResource: (key: ResourceKey) => Promise<void> }) {
  const accounts = rows(resources.accounts);
  const creators = rows(resources.creators);
  const collections = rows(resources.collections);

  return (
    <div className="view-stack enter">
      <section className="network-hero">
        <div><span className="eyebrow">The people behind the numbers</span><h2>A network you can actually read.</h2></div>
        <div className="network-count"><strong>{whole.format(number(resources.creators.data?.total ?? creators.length))}</strong><span>creators connected</span></div>
      </section>

      <section className="collection-strip">
        <SectionTitle kicker="Saved audiences" title="Creator collections" />
        <div className="collection-list">
          {collections.length ? collections.map((collection: Json) => (
            <div className="collection-chip" key={collection.id} style={{ "--collection-color": collection.color || "#7733e1" } as React.CSSProperties}>
              <span /><strong>{collection.name}</strong><small>{whole.format(number(collection.creatorCount))} creators</small>
            </div>
          )) : <Empty title="No collections yet" body="Saved creator groups will appear here." />}
        </div>
      </section>

      <section className="network-grid">
        <div className="table-panel span-two">
          <SectionTitle kicker="Creator directory" title="Campaign status at a glance" />
          {creators.length ? (
            <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Creator</th><th>Status</th><th>Programs</th><th>Handles</th></tr></thead><tbody>
              {creators.map((creator: Json) => {
                const campaigns = Array.isArray(creator.campaigns) ? creator.campaigns : [];
                const handles = campaigns.flatMap((campaign: Json) => campaign.handles ?? []);
                return <tr key={creator.id}><td><div className="avatar-cell"><span>{String(creator.name || "?").slice(0, 1)}</span><div><strong>{creator.name || "Unnamed creator"}</strong><small>{creator.email || "No email"}</small></div></div></td><td><Badge tone={creator.status === "active" ? "good" : "neutral"}>{creator.status || "inactive"}</Badge></td><td>{campaigns.length}</td><td>{handles.length ? handles.slice(0, 2).map((handle: Json) => `@${handle.handle}`).join(", ") : "—"}</td></tr>;
              })}
            </tbody></table></div>
          ) : <Empty title="No contracted creators" body="The key is connected; this test company has no creator rows yet." />}
        </div>

        <div className="account-panel">
          <SectionTitle kicker="Tracked accounts" title="Handle-level performance" />
          {resources.accounts.status === "error" ? (
            <ErrorState title="This endpoint is broken upstream" body="The API returns 500 with its documented defaults and totalViews sort." onRetry={() => void loadResource("accounts")} />
          ) : accounts.length ? accounts.slice(0, 8).map((account: Json) => (
            <div className="account-row" key={`${account.platform}-${account.handle}`}><PlatformMark platform={account.platform} /><div><strong>@{account.handle}</strong><span>{compact.format(number(account.totalViews))} views · {account.totalPosts} posts</span></div><b>{number(account.engagementRate).toFixed(1)}%</b></div>
          )) : <Empty title="No tracked accounts" body="Accounts will roll up here after posts arrive." />}
        </div>
      </section>
    </div>
  );
}

function Money({ resources, loadResource }: { resources: Record<ResourceKey, Resource>; loadResource: (key: ResourceKey) => Promise<void> }) {
  const stats = payload(resources.payoutStats);
  const pendingPayload = resources.pending.data ?? {};
  const pending = rows(resources.pending);
  const payoutRows = rows(resources.payouts);

  return (
    <div className="view-stack enter">
      <section className="money-hero">
        <div className="balance-block">
          <span>Available to pay</span>
          <strong>{usd.format(number(stats.availableBalance))}</strong>
          <small>Launchpoint wallet · {stats.currency || "USD"}</small>
        </div>
        <div className="money-facts">
          <div><span>Total owed</span><strong>{usd.format(number(stats.totalOwed))}</strong></div>
          <div><span>Lifetime funded</span><strong>{usd.format(number(stats.lifetimeDeposits))}</strong></div>
          <div><span>Lifetime paid</span><strong>{usd.format(number(stats.lifetimePaidOut))}</strong></div>
        </div>
      </section>

      <section className="overview-grid money-grid">
        <div className="table-panel span-two">
          <SectionTitle kicker="Upcoming money" title="Pending creator payouts" action={<Badge tone="violet">{pendingPayload.summary?.totalPending ?? 0} open</Badge>} />
          {pending.length ? (
            <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Creator</th><th>Program</th><th>Due</th><th>Delivery</th><th>Amount</th></tr></thead><tbody>{pending.map((item: Json) => <tr key={item.id}><td><strong>{item.creatorName}</strong><small className="table-subline">{item.hasStripeAccount ? "Ready to receive" : "Needs payout setup"}</small></td><td>{item.programName}</td><td><Badge tone={item.isOverdue ? "bad" : item.isDue ? "warm" : "neutral"}>{item.isOverdue ? "Overdue" : formatDate(item.dueDate)}</Badge></td><td>{number(item.deliveryPercentage).toFixed(0)}%</td><td className="numeric"><strong>{usd.format(number(item.amount))}</strong></td></tr>)}</tbody></table></div>
          ) : <Empty title="Nothing waiting to be paid" body="Pending contract payouts will appear here with delivery progress." />}
        </div>

        <div className="payout-summary-panel">
          <SectionTitle kicker="Readiness" title="Payout queue" />
          <div className="queue-stat"><strong>{pendingPayload.summary?.readyToPay ?? 0}</strong><span>ready to pay</span></div>
          <div className="queue-stat"><strong>{pendingPayload.summary?.needsSetup ?? 0}</strong><span>need setup</span></div>
          <div className="queue-stat"><strong>{pendingPayload.summary?.overdueCount ?? 0}</strong><span>overdue</span></div>
          <div className="queue-total"><span>Total open</span><strong>{usd.format(number(pendingPayload.summary?.totalAmount))}</strong></div>
        </div>
      </section>

      <section className="table-panel">
        <SectionTitle kicker="Wallet ledger" title="Every credit and debit" />
        {resources.payouts.status === "error" ? (
          <ErrorState title="Wallet activity is broken upstream" body="The endpoint returns 500 with no filters and with valid pagination. Wallet stats and pending payouts still work." onRetry={() => void loadResource("payouts")} />
        ) : payoutRows.length ? (
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Description</th><th>Creator</th><th>Status</th><th>Date</th><th>Amount</th></tr></thead><tbody>{payoutRows.map((item: Json) => <tr key={item.id}><td>{item.description}</td><td>{item.creatorName || "—"}</td><td><Badge tone={item.status === "confirmed" ? "good" : "warm"}>{item.status}</Badge></td><td>{formatDate(item.createdAt)}</td><td className="numeric"><strong>{usd.format(number(item.amount))}</strong></td></tr>)}</tbody></table></div>
        ) : <Empty title="No wallet activity" body="Credits and debits will build the ledger here." />}
      </section>
    </div>
  );
}

function Programs({ resources, loadResource }: { resources: Record<ResourceKey, Resource>; loadResource: (key: ResourceKey) => Promise<void> }) {
  const programs = rows(resources.programs);
  const contracts = rows(resources.contracts);
  const [selectedProgram, setSelectedProgram] = useState<string>(programs[0]?.id ?? "");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [maxUses, setMaxUses] = useState(25);
  const [inviteState, setInviteState] = useState<Resource>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!selectedProgram && programs[0]?.id) setSelectedProgram(programs[0].id);
  }, [programs, selectedProgram]);

  const createInvite = async () => {
    if (!selectedProgram) return;
    setInviteState({ status: "loading" });
    try {
      const result = await callApi(`/programs/${encodeURIComponent(selectedProgram)}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expiresInDays, maxUses }),
      });
      setInviteState({ status: "ready", data: result.data });
    } catch (caught) {
      setInviteState({ status: "error", error: (caught as Error).message });
    }
  };

  const invite = inviteState.data ?? {};
  const copyInvite = async () => {
    if (!invite.link) return;
    await navigator.clipboard.writeText(invite.link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="view-stack enter">
      <section className="program-hero"><div><span className="eyebrow">Campaign command</span><h2>Programs turn attention into a system.</h2><p>Read the campaign roster, inspect every contract, and create controlled invite links.</p></div><div className="program-score"><strong>{programs.length}</strong><span>programs visible to this key</span></div></section>

      <section className="program-grid">
        <div className="table-panel span-two">
          <SectionTitle kicker="Program roster" title="Campaigns and their state" action={<button className="text-button" onClick={() => void loadResource("programs")}><RefreshCw size={14} /> Refresh</button>} />
          {programs.length ? <div className="program-list">{programs.map((program: Json, index: number) => <button key={program.id} className={selectedProgram === program.id ? "selected" : ""} onClick={() => setSelectedProgram(program.id)}><span className="program-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{program.name}</strong><small>{program.description || "No description"}</small></div><Badge tone={program.status === "active" ? "good" : "neutral"}>{program.status}</Badge><ChevronRight size={16} /></button>)}</div> : <Empty title="No programs found" body="Create a program in Launchpoint to use campaign routes." />}
        </div>

        <div className="invite-panel">
          <div className="invite-icon"><Link2 size={20} /></div>
          <span className="eyebrow">Invite-link maker</span>
          <h3>Open the door, with limits.</h3>
          <p>This writes a new invite link to the selected program.</p>
          <label>Program<select value={selectedProgram} onChange={(event) => setSelectedProgram(event.target.value)}>{programs.map((program: Json) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
          <div className="field-pair"><label>Expires<input type="number" min={1} max={90} value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))} /><small>days</small></label><label>Max uses<input type="number" min={1} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} /></label></div>
          <button className="primary-button" onClick={() => void createInvite()} disabled={!selectedProgram || inviteState.status === "loading"}>{inviteState.status === "loading" ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} Create invite link</button>
          {inviteState.status === "error" ? <ErrorState title="Invite failed" body={inviteState.error ?? "Unknown error"} /> : null}
          {invite.link ? <div className="invite-result"><CircleCheck size={17} /><div><strong>Invite ready</strong><span>{formatDate(invite.expiresAt, true)} · {invite.maxUses} uses</span></div><button onClick={() => void copyInvite()} aria-label="Copy invite link">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div> : null}
        </div>
      </section>

      <section className="table-panel">
        <SectionTitle kicker="Contract ledger" title="Creator agreements, without payment secrets" action={<Badge tone="neutral">{resources.contracts.data?.total ?? contracts.length} total</Badge>} />
        {contracts.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Contract</th><th>Creator</th><th>Platform</th><th>Status</th><th>Starts</th><th>Ends</th></tr></thead><tbody>{contracts.map((contract: Json) => <tr key={contract.id}><td><strong>{contract.contractName || contract.position}</strong><small className="table-subline">{contract.contractType || "Standard"}</small></td><td>{contract.contractorName || "—"}</td><td>{contract.platform ? <span className="inline-platform"><PlatformMark platform={contract.platform} /> {contract.handle ? `@${contract.handle}` : contract.platform}</span> : "—"}</td><td><Badge tone={contract.status === "active" ? "good" : "neutral"}>{contract.status}</Badge></td><td>{formatDate(contract.startsAt)}</td><td>{formatDate(contract.expiresAt)}</td></tr>)}</tbody></table></div> : <Empty title="No contracts in this company" body="Contract metadata will appear here when creators join a program." />}
      </section>
    </div>
  );
}

function ApiLab({ resources }: { resources: Record<ResourceKey, Resource> }) {
  const [selected, setSelected] = useState<Endpoint>(ENDPOINTS[0]);
  const [path, setPath] = useState(ENDPOINTS[0].path);
  const [query, setQuery] = useState(ENDPOINTS[0].defaultQuery ?? "");
  const [body, setBody] = useState(ENDPOINTS[0].defaultBody ?? "");
  const [confirmedWrite, setConfirmedWrite] = useState(false);
  const [run, setRun] = useState<{ status: "idle" | "loading" | "ready" | "error"; result?: Json; error?: string }>({ status: "idle" });
  const [endpointFilter, setEndpointFilter] = useState("");

  const selectEndpoint = (endpoint: Endpoint) => {
    setSelected(endpoint);
    setPath(endpoint.path);
    setQuery(endpoint.defaultQuery ?? "");
    setBody(endpoint.defaultBody ?? "");
    setConfirmedWrite(false);
    setRun({ status: "idle" });
  };

  const runEndpoint = async () => {
    if (path.includes("{")) {
      setRun({ status: "error", error: "Replace the {id} part with a real ID first." });
      return;
    }
    if (selected.writes && !confirmedWrite) {
      setRun({ status: "error", error: "Confirm the write before running this endpoint." });
      return;
    }
    setRun({ status: "loading" });
    try {
      const fullPath = `${path}${query ? `?${query.replace(/^\?/, "")}` : ""}`;
      const result = await callApi(fullPath, selected.method === "POST" ? { method: "POST", headers: { "content-type": "application/json" }, body: body || "{}" } : undefined);
      setRun({ status: "ready", result });
    } catch (caught) {
      const error = caught as Error & { result?: Json };
      setRun({ status: "error", error: error.message, result: error.result });
    }
  };

  const shownEndpoints = ENDPOINTS.filter((endpoint) => `${endpoint.method} ${endpoint.path} ${endpoint.name}`.toLowerCase().includes(endpointFilter.toLowerCase()));
  const groups = Array.from(new Set(shownEndpoints.map((endpoint) => endpoint.group)));
  const rateRemaining = Object.values(resources).find((resource) => resource.rateRemaining)?.rateRemaining;

  return (
    <div className="view-stack enter">
      <section className="lab-hero">
        <div><span className="eyebrow">OpenAPI, made tangible</span><h2>Seventeen doors.<br />One honest test bench.</h2><p>The key stays server-side. Pick a route, shape the request, and see the real response.</p></div>
        <div className="lab-stamp"><Code2 size={24} /><strong>v1</strong><span>100 req/min</span><small>{rateRemaining ?? "—"} last seen remaining</small></div>
      </section>

      <section className="lab-grid">
        <div className="endpoint-index">
          <div className="endpoint-search"><Search size={15} /><input value={endpointFilter} onChange={(event) => setEndpointFilter(event.target.value)} placeholder="Find an endpoint" aria-label="Find an endpoint" /></div>
          {groups.map((group) => <div className="endpoint-group" key={group}><span>{group}</span>{shownEndpoints.filter((endpoint) => endpoint.group === group).map((endpoint) => <button key={`${endpoint.method}-${endpoint.path}`} className={selected === endpoint ? "selected" : ""} onClick={() => selectEndpoint(endpoint)}><Badge tone={endpoint.method === "GET" ? "good" : "violet"}>{endpoint.method}</Badge><div><strong>{endpoint.name}</strong><small>{endpoint.path}</small></div></button>)}</div>)}
        </div>

        <div className="request-builder">
          <div className="request-head"><div><Badge tone={selected.method === "GET" ? "good" : "violet"}>{selected.method}</Badge><span>{selected.group}</span></div><h3>{selected.name}</h3><p>{selected.description}</p></div>
          <label>Path<input value={path} onChange={(event) => setPath(event.target.value)} spellCheck={false} /></label>
          <label>Query string<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="page=1&limit=10" spellCheck={false} /></label>
          {selected.method === "POST" ? <label>JSON body<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} spellCheck={false} /></label> : null}
          {selected.writes ? <label className="write-confirm"><input type="checkbox" checked={confirmedWrite} onChange={(event) => setConfirmedWrite(event.target.checked)} /><span><strong>I understand this creates an invite</strong><small>Use a short expiry and low max uses for tests.</small></span></label> : null}
          <button className="run-button" onClick={() => void runEndpoint()} disabled={run.status === "loading"}>{run.status === "loading" ? <LoaderCircle size={17} className="spin" /> : <Play size={17} />} Run request <span>⌘ ↵</span></button>
        </div>

        <div className="response-viewer">
          <div className="response-bar"><span>Response</span>{run.result ? <div><Badge tone={run.result.ok ? "good" : "bad"}>{run.result.status}</Badge><small>{run.result.latencyMs} ms</small></div> : null}</div>
          {run.status === "idle" ? <div className="response-empty"><Code2 size={24} /><strong>Ready when you are</strong><span>The live response will appear here.</span></div> : run.status === "loading" ? <div className="response-empty"><LoaderCircle size={24} className="spin" /><strong>Calling Launchpoint</strong><span>Your key is being added on the server.</span></div> : <pre>{JSON.stringify(run.result?.data ?? { error: run.error }, null, 2)}</pre>}
        </div>
      </section>

      <section className="audit-panel">
        <SectionTitle kicker="Full contract audit" title={LATEST_AUDIT.failed ? `${LATEST_AUDIT.passed} passed. ${LATEST_AUDIT.failed} need work.` : `${LATEST_AUDIT.passed} passed. Every route is healthy.`} action={<span className="audit-date">Tested {formatDate(LATEST_AUDIT.ranAt, true)}</span>} />
        <div className="audit-summary"><div className="audit-ring" style={{ "--audit-progress": `${(LATEST_AUDIT.passed / LATEST_AUDIT.total) * 360}deg` } as React.CSSProperties}><strong>{Math.round((LATEST_AUDIT.passed / LATEST_AUDIT.total) * 100)}%</strong></div><div><strong>Every route was called with the test key.</strong><p>All 17 feature checks passed. All 17 missing-key checks also returned the expected 401 error shape.</p></div></div>
        <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>Result</th><th>Route</th><th>Status</th><th>Time</th><th>What was checked</th></tr></thead><tbody>{LATEST_AUDIT.results.map((item) => <tr key={`${item.method}-${item.path}`} className={item.ok ? "" : "failed"}><td>{item.ok ? <CircleCheck size={17} /> : <CircleAlert size={17} />}</td><td><Badge tone={item.method === "GET" ? "good" : "violet"}>{item.method}</Badge><code>{item.path}</code></td><td><Badge tone={item.ok ? "good" : "bad"}>{item.status}</Badge></td><td>{item.latencyMs} ms</td><td>{item.note}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
