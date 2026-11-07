import { db } from "@/db/index";
import { events } from "@/db/schema";
import { count } from "drizzle-orm";

export async function GET() {
    try {
        const statusTotals = await db
            .select({ status: events.status, total: count() })
            .from(events)
            .groupBy(events.status);

        const totals = {
            all: 0,
            pending: 0,
            retrying: 0,
            delivered: 0,
            failed: 0,
        };

        for (const row of statusTotals) {
            totals[row.status] = row.total;
            totals.all += row.total;
        }

        return Response.json(totals, { status: 200 });
    } catch (error) {
        console.error("Error fetching event counts:", error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
