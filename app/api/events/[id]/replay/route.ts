import { db } from "@/db/index";
import { events, destinations } from "@/db/schema";
import { deliveryQueue } from "@/lib/queue";
import { eq } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        try {
            const [event] = await db
                .select()
                .from(events)
                .where(eq(events.id, id))
                .limit(1);

            const eventData = event;

            if (!eventData) {
                return Response.json({ error: "Event not found" }, { status: 404 });
            }

            if (event.status !== "failed") {
                return Response.json({ error: `Cannot replay an event with status "${event.status}"` }, { status: 400 });
            }

            const destination = await db
                .select()
                .from(destinations)
                .where(eq(destinations.id, eventData.destinationId))
                .limit(1);

            if (destination.length === 0) {
                return Response.json({ error: "Destination not found" }, { status: 404 });
            }

            const [updatedEvent] = await db
                .update(events)
                .set({ status: "pending", updatedAt: new Date() })
                .where(eq(events.id, id))
                .returning();

            try {
                await deliveryQueue.add(
                    "deliveryQueue",
                    {
                        eventId: eventData.id,
                        destinationUrl: destination[0].url
                    },
                    {
                        jobId: `${eventData.id}-replay-${Date.now()}`,
                        attempts: 5,
                        backoff: { type: "exponential", delay: 3000 }
                    }
                );
            } catch (error) {
                return Response.json({ error: "Internal server error" }, { status: 500 });
            }

            return Response.json(updatedEvent, { status: 200 });

        } catch (error) {
            return Response.json({ error: "Internal server error" }, { status: 500 });
        }

    } catch (error) {
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}