import "dotenv/config";
import cron from "node-cron";
import { db } from "../db/index";
import { events, destinations } from "../db/schema";
import { eq, lt, and } from "drizzle-orm";
import { deliveryQueue } from "../lib/queue";

async function sweep() {
    const cutoffTime = new Date(Date.now() - 2 * 60 * 1000);

    const stuckEvents = await db
        .select()
        .from(events)
        .where(
            and(
                eq(events.status, "pending"),
                lt(events.createdAt, cutoffTime)
            )
        );

    console.log(`Found ${stuckEvents.length} stuck events`);

    for (const event of stuckEvents) {
        try {
            const destination = await db
                .select()
                .from(destinations)
                .where(eq(destinations.id, event.destinationId))
                .limit(1);

            if (destination.length === 0) {
                console.error(`Destination not found for event ${event.id}`);
                continue;
            }

            await deliveryQueue.add(
                "deliveryQueue",
                {
                    eventId: event.id,
                    destinationUrl: destination[0].url
                },
                {
                    jobId: `${event.id}-sweep-${Date.now()}`,
                    attempts: 5,
                    backoff: { type: "exponential", delay: 3000 }
                }
            );
            console.log(`Successfully added event ${event.id} to delivery queue`);

        } catch (error) {
            console.error(`Failed to process event ${event.id}:`, error);
        }
    }
}

cron.schedule("* * * * *", async () => {
    await sweep();
});

