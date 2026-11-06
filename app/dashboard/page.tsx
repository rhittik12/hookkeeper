"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type EventStatus = "pending" | "retrying" | "delivered" | "failed";
type EventRecord = {
  id: string;
  type: string;
  status: EventStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};
type StatusFilter = "all" | EventStatus;

const statusLabels: Record<EventStatus, string> = {
  delivered: "Delivered",
  retrying: "Retrying",
  failed: "Failed",
  pending: "Pending",
};

const filters: StatusFilter[] = ["all", "delivered", "retrying", "failed", "pending"];

function Icon({
  name,
  size = 16,
}: {
  name: "brand" | "grid" | "activity" | "chevron" | "refresh" | "search" | "inbox" | "check" | "retry" | "failed" | "clock" | "arrow";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "brand":
      return <svg {...common}><path d="M8.2 8.2 5.8 5.8a3.2 3.2 0 0 0-4.5 4.5l4.2 4.2a3.2 3.2 0 0 0 4.5 0l1.2-1.2" transform="translate(2 2)" /><path d="m15.8 15.8 2.4 2.4a3.2 3.2 0 0 0 4.5-4.5l-4.2-4.2a3.2 3.2 0 0 0-4.5 0l-1.2 1.2" transform="translate(-2 -2)" /><path d="m9 15 6-6" /></svg>;
    case "grid":
      return <svg {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>;
    case "activity":
      return <svg {...common}><path d="M3 12h4l2.4-7 4.2 14 2.4-7H21" /></svg>;
    case "chevron":
      return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
    case "refresh":
      return <svg {...common}><path d="M20 7v5h-5" /><path d="M4.7 9a7 7 0 0 1 11.8-2L20 12M4 17v-5h5" /><path d="M19.3 15a7 7 0 0 1-11.8 2L4 12" /></svg>;
    case "search":
      return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>;
    case "inbox":
      return <svg {...common}><path d="M4 4.5h16l1 11.5-3 3H6l-3-3L4 4.5Z" /><path d="M3.5 13h5l1.5 2h4l1.5-2h5" /></svg>;
    case "check":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.3 2.3 4.8-5" /></svg>;
    case "retry":
      return <svg {...common}><path d="M20 7v5h-5" /><path d="M5.2 9A7 7 0 0 1 17 6l3 6M4 17v-5h5" /><path d="M18.8 15A7 7 0 0 1 7 18l-3-6" /></svg>;
    case "failed":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6m0-6-6 6" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>;
    case "arrow":
      return <svg {...common}><path d="M7 17 17 7M7 7h10v10" /></svg>;
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function DashboardPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const response = await fetch("/api/events");
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Unexpected response from the events API");
      setEvents(data as EventRecord[]);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load events");
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
    const interval = window.setInterval(() => {
      if (!document.hidden) void fetchEvents(true);
    }, 15_000);

    function onVisibilityChange() {
      if (!document.hidden) void fetchEvents(true);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchEvents]);

  async function handleReplay(id: string) {
    setReplayingId(id);
    try {
      const response = await fetch(`/api/events/${id}/replay`, { method: "POST" });
      if (!response.ok) throw new Error(`Replay failed (${response.status})`);
      await fetchEvents(true);
    } catch (replayError) {
      setError(replayError instanceof Error ? replayError.message : "Could not replay this event");
    } finally {
      setReplayingId(null);
    }
  }

  const counts = useMemo(() => ({
    all: events.length,
    delivered: events.filter((event) => event.status === "delivered").length,
    retrying: events.filter((event) => event.status === "retrying").length,
    failed: events.filter((event) => event.status === "failed").length,
    pending: events.filter((event) => event.status === "pending").length,
  }), [events]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesStatus = filter === "all" || event.status === filter;
      const matchesQuery = !normalizedQuery ||
        event.id.toLowerCase().includes(normalizedQuery) ||
        event.type.toLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [events, filter, query]);

  const statCards = [
    { label: "Total events", value: counts.all, note: "Most recent 50 events", icon: "inbox" as const },
    { label: "Delivered", value: counts.delivered, note: "Successfully delivered", icon: "check" as const },
    { label: "Retrying", value: counts.retrying, note: "Waiting for another attempt", icon: "retry" as const },
    { label: "Failed", value: counts.failed, note: "Can be replayed below", icon: "failed" as const },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="/" aria-label="Hookkeeper home">
          <span className="brand-mark"><Icon name="brand" size={18} /></span>
          <span className="brand-name">hookkeeper</span>
        </a>

        <div className="workspace-switcher" aria-label="Current workspace">
          <div className="workspace-identity">
            <span className="workspace-avatar">H</span>
            <span className="workspace-copy"><strong>Hookkeeper</strong><span>Workspace</span></span>
          </div>
          <Icon name="chevron" size={14} />
        </div>

        <p className="sidebar-caption">Workspace</p>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          <a className="sidebar-link sidebar-link-active" href="/dashboard" aria-current="page">
            <Icon name="grid" size={15} /> Overview
          </a>
          <a className="sidebar-link" href="#event-stream">
            <Icon name="activity" size={15} /> Event stream
          </a>
        </nav>

        <div className="sidebar-bottom">
          <hr className="sidebar-rule" />
          <div className="sidebar-user">
            <span className="workspace-avatar">HK</span>
            <span className="sidebar-user-copy"><strong>Webhook operations</strong><span>Local workspace</span></span>
          </div>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={12} /><strong>Overview</strong></div>
          <div className="topbar-right">
            <span className="live-indicator"><i className="live-dot" /> Auto-refresh · 15 sec</span>
            <button className="icon-button" type="button" onClick={() => void fetchEvents()} disabled={refreshing} aria-label="Refresh events" title="Refresh events">
              <Icon name="refresh" size={15} />
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="eyebrow"><Icon name="activity" size={13} /> Delivery operations</div>
          <div className="page-title-row">
            <div>
              <h1 className="page-title">Event overview</h1>
              <p className="page-description">A clear view of every webhook moving through your system.</p>
            </div>
            <button className="button-primary" type="button" onClick={() => void fetchEvents()} disabled={refreshing}>
              <Icon name="refresh" size={14} /> {refreshing ? "Refreshing…" : "Refresh events"}
            </button>
          </div>

          <section className="stat-grid" aria-label="Event summary">
            {statCards.map((card) => (
              <article className="stat-card" key={card.label}>
                <div className="stat-card-top"><span>{card.label}</span><span className="stat-icon"><Icon name={card.icon} size={14} /></span></div>
                <div className="stat-value">{loading ? "—" : card.value.toLocaleString()}</div>
                <div className="stat-footnote">{card.note}</div>
              </article>
            ))}
          </section>

          <section className="event-panel" id="event-stream" aria-labelledby="event-stream-title">
            <div className="panel-heading">
              <div className="panel-title-wrap">
                <span className="panel-title-icon"><Icon name="activity" size={16} /></span>
                <div><h2 className="panel-title" id="event-stream-title">Event stream</h2><p className="panel-subtitle">Search, filter, and replay recent deliveries.</p></div>
              </div>
              <div className="panel-actions">
                <label className="search-box">
                  <Icon name="search" size={14} />
                  <input className="search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events…" aria-label="Search events by ID or type" />
                </label>
                <button className="button-secondary" type="button" onClick={() => void fetchEvents()} disabled={refreshing}>
                  <Icon name="refresh" size={13} /> Refresh
                </button>
              </div>
            </div>

            <div className="filter-row" aria-label="Filter events by status">
              {filters.map((item) => (
                <button className={`filter-chip${filter === item ? " filter-chip-active" : ""}`} type="button" key={item} onClick={() => setFilter(item)} aria-pressed={filter === item}>
                  {item === "all" ? "All events" : statusLabels[item]}
                  <span className="filter-count">{counts[item]}</span>
                </button>
              ))}
            </div>

            {error && <div className="error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => void fetchEvents()}>Try again</button></div>}

            {loading ? (
              <div className="table-state" role="status" aria-live="polite">
                <span className="table-state-icon"><Icon name="refresh" size={18} /></span>
                <h3>Loading your event stream</h3><p>Fetching the latest delivery activity.</p>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="table-state">
                <span className="table-state-icon"><Icon name={events.length === 0 ? "inbox" : "search"} size={18} /></span>
                <h3>{events.length === 0 ? "No events yet" : "No matching events"}</h3>
                <p>{events.length === 0 ? "Events will appear here as soon as your destinations receive traffic." : "Try another search or choose a different status filter."}</p>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="event-table">
                  <thead><tr><th scope="col">Event ID</th><th scope="col">Event type</th><th scope="col">Status</th><th scope="col">Attempts</th><th scope="col">Last updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {filteredEvents.map((event) => (
                      <tr key={event.id}>
                        <td><span className="event-id"><i className="event-id-mark" />{event.id.slice(0, 8)}</span></td>
                        <td className="event-type">{event.type}</td>
                        <td><span className={`status-badge${event.status === "failed" ? " status-badge-failed" : ""}`}><i className="status-dot" />{statusLabels[event.status]}</span></td>
                        <td className="attempt-count">{event.attempts}/5</td>
                        <td className="event-time">{formatTime(event.updatedAt)}</td>
                        <td>{event.status === "failed" && <button className="replay-button" type="button" onClick={() => void handleReplay(event.id)} disabled={replayingId === event.id}><Icon name="retry" size={12} />{replayingId === event.id ? "Replaying…" : "Replay"}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="panel-footer"><span>Showing <strong>{filteredEvents.length}</strong> of <strong>{events.length}</strong> recent events</span><span>Updates every 15 seconds</span></footer>
          </section>
        </div>
      </main>
    </div>
  );
}
