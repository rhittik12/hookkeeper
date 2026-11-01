"use client";

import { useEffect, useState } from "react";

type Event = {
    id: string;
    type: string;
    status: "pending" | "retrying" | "delivered" | "failed";
    attempts: number;
    createdAt: string;
    updatedAt: string;
};

const STATUS_STYLES: Record<Event["status"], { color: string; bg: string; label: string }> = {
    delivered: { color: "#3FB950", bg: "rgba(63,185,80,0.12)", label: "Delivered" },
    retrying: { color: "#D9A441", bg: "rgba(217,164,65,0.12)", label: "Retrying" },
    failed: { color: "#E5534B", bg: "rgba(229,83,75,0.12)", label: "Failed" },
    pending: { color: "#8B919C", bg: "rgba(139,145,156,0.12)", label: "Pending" },
};

export default function DashboardPage() {
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [replayingId, setReplayingId] = useState<string | null>(null);

    async function fetchEvents() {
        const res = await fetch("/api/events");
        const data = await res.json();
        setEvents(data);
        setLoading(false);
    }

    useEffect(() => {
        let isFetching = false;

        async function fetchEvents() {
            if (isFetching || document.hidden) return;
            isFetching = true;
            try {
                const res = await fetch("/api/events");
                const data = await res.json();
                setEvents(data);
                setLoading(false);
            } finally {
                isFetching = false;
            }
        }

        fetchEvents();
        const interval = setInterval(fetchEvents, 15000);

        function handleVisibilityChange() {
            if (!document.hidden) fetchEvents();
        }
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);

    async function handleReplay(id: string) {
        setReplayingId(id);
        await fetch(`/api/events/${id}/replay`, { method: "POST" });
        await fetchEvents();
        setReplayingId(null);
    }

    const counts = {
        delivered: events.filter((e) => e.status === "delivered").length,
        retrying: events.filter((e) => e.status === "retrying").length,
        failed: events.filter((e) => e.status === "failed").length,
        pending: events.filter((e) => e.status === "pending").length,
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "#14171C",
                color: "#E4E7EB",
                fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
                padding: "40px 48px",
            }}
        >
            <div style={{ maxWidth: 1040, margin: "0 auto" }}>
                <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
                    Events
                </h1>
                <p style={{ color: "#8B919C", fontSize: 13, marginTop: 4, marginBottom: 28 }}>
                    Delivery activity across all destinations
                </p>

                <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
                    {(["delivered", "retrying", "failed", "pending"] as const).map((key) => (
                        <div
                            key={key}
                            style={{
                                flex: 1,
                                background: "#1C2027",
                                border: "1px solid #2A2F38",
                                borderRadius: 6,
                                padding: "14px 16px",
                            }}
                        >
                            <div style={{ fontSize: 12, color: "#8B919C", marginBottom: 6 }}>
                                {STATUS_STYLES[key].label}
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 600, color: STATUS_STYLES[key].color }}>
                                {counts[key]}
                            </div>
                        </div>
                    ))}
                </div>

                <div
                    style={{
                        border: "1px solid #2A2F38",
                        borderRadius: 6,
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "140px 140px 110px 70px 110px 90px",
                            padding: "10px 16px",
                            fontSize: 12,
                            color: "#8B919C",
                            borderBottom: "1px solid #2A2F38",
                            background: "#181B21",
                        }}
                    >
                        <span>ID</span>
                        <span>Type</span>
                        <span>Status</span>
                        <span>Attempts</span>
                        <span>Updated</span>
                        <span></span>
                    </div>

                    {loading ? (
                        <div style={{ padding: 32, textAlign: "center", color: "#8B919C", fontSize: 13 }}>
                            Loading events…
                        </div>
                    ) : events.length === 0 ? (
                        <div style={{ padding: 32, textAlign: "center", color: "#8B919C", fontSize: 13 }}>
                            No events yet
                        </div>
                    ) : (
                        events.map((event) => {
                            const style = STATUS_STYLES[event.status];
                            return (
                                <div
                                    key={event.id}
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "140px 140px 110px 70px 110px 90px",
                                        padding: "11px 16px",
                                        fontSize: 13,
                                        borderBottom: "1px solid #21252C",
                                        alignItems: "center",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                                            fontSize: 12,
                                            color: "#8B919C",
                                        }}
                                    >
                                        {event.id.slice(0, 8)}
                                    </span>
                                    <span>{event.type}</span>
                                    <span>
                                        <span
                                            style={{
                                                display: "inline-block",
                                                padding: "2px 8px",
                                                borderRadius: 4,
                                                fontSize: 12,
                                                fontWeight: 500,
                                                color: style.color,
                                                background: style.bg,
                                            }}
                                        >
                                            {style.label}
                                        </span>
                                    </span>
                                    <span style={{ color: "#8B919C", fontSize: 12 }}>{event.attempts}/5</span>
                                    <span
                                        style={{
                                            fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
                                            fontSize: 12,
                                            color: "#8B919C",
                                        }}
                                    >
                                        {new Date(event.updatedAt).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                    <span>
                                        {event.status === "failed" && (
                                            <button
                                                onClick={() => handleReplay(event.id)}
                                                disabled={replayingId === event.id}
                                                style={{
                                                    background: "transparent",
                                                    border: "1px solid #2A2F38",
                                                    color: replayingId === event.id ? "#8B919C" : "#E4E7EB",
                                                    borderRadius: 4,
                                                    padding: "4px 10px",
                                                    fontSize: 12,
                                                    cursor: replayingId === event.id ? "default" : "pointer",
                                                    transition: "background 0.15s, border-color 0.15s",
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (replayingId !== event.id) {
                                                        e.currentTarget.style.background = "#242931";
                                                        e.currentTarget.style.borderColor = "#3A4049";
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = "transparent";
                                                    e.currentTarget.style.borderColor = "#2A2F38";
                                                }}
                                            >
                                                {replayingId === event.id ? "Replaying…" : "Replay"}
                                            </button>
                                        )}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}