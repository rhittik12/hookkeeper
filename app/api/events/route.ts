import { db } from "@/db/index";
import { events, destinations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { deliveryQueue } from "@/lib/queue";

const createEventSchema = z.object({
    destinationId: z.string().uuid({ message: "destinationId must be a valid UUID" }),
    type: z.string().min(1, { message: "type is required" }),
    idempotencyKey: z.string().min(1, { message: "idempotencyKey is required" }),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const parsed = createEventSchema.safeParse(body);

        if (!parsed.success) {
            return Response.json(
                { error: parsed.error.issues[0].message },
                { status: 400 }
            );
        }

        const { destinationId, type, idempotencyKey } = parsed.data;

        const destination = await db
            .select()
            .from(destinations)
            .where(eq(destinations.id, destinationId))
            .limit(1);

        if (destination.length === 0) {
            return Response.json({ error: "Destination not found" }, { status: 404 });
        }

        try {
            const [event] = await db
                .insert(events)
                .values({ destinationId, type, idempotencyKey })
                .returning();

            try {
                await deliveryQueue.add(
                    "deliveryQueue",
                    { eventId: event.id, destinationUrl: destination[0].url },
                    {
                        jobId: event.id,
                        attempts: 5,
                        backoff: { type: "exponential", delay: 3000 }
                    }
                );
            } catch (queueError) {
                console.error("Failed to queue event:", event.id, queueError);
            }

            return Response.json(event, { status: 201 });

        } catch (insertError: any) {
            if (insertError.cause?.code === "23505") {
                const [existingEvent] = await db
                    .select()
                    .from(events)
                    .where(eq(events.idempotencyKey, idempotencyKey))
                    .limit(1);

                return Response.json(existingEvent, { status: 200 });
            }
            throw insertError;
        }

    } catch (error) {
        console.error("Error creating event:", error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const statusParam = new URL(req.url).searchParams.get("status");
        const parsedStatus = statusParam === null
            ? undefined
            : z.enum(["all", "pending", "retrying", "delivered", "failed"]).safeParse(statusParam);

        if (parsedStatus && !parsedStatus.success) {
            return Response.json({ error: "Invalid status filter" }, { status: 400 });
        }

        const status = parsedStatus?.success && parsedStatus.data !== "all"
            ? parsedStatus.data
            : undefined;

        const allEvents = status
            ? await db
                .select()
                .from(events)
                .where(eq(events.status, status))
                .orderBy(desc(events.createdAt))
                .limit(50)
            : await db
                .select()
                .from(events)
                .orderBy(desc(events.createdAt))
                .limit(50);

        return Response.json(allEvents, { status: 200 });
    } catch (error) {
        console.error("Error fetching events:", error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
} 
