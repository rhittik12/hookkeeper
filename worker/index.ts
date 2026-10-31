import "dotenv/config";
import { Worker } from "bullmq";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { events, deliveryAttempts, destinations } from "../db/schema";
import { redisConnection } from "../lib/redis";

const worker = new Worker(
    "deliveryQueue",
    async (job) => {
        const { eventId, destinationUrl } = job.data;

        const [event] = await db
            .select()
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1);

        if (!event) {
            throw new Error(`Event with ID ${eventId} not found`);
        }

        const attemptNumber = event.attempts + 1;
        const maxAttempts = job.opts.attempts ?? 1;
        const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;

        let success = false;
        let errorMessage: string | null = null;

        try {
            const body = JSON.stringify({
                id: event.id,
                type: event.type,
                createdAt: event.createdAt.toISOString(),
            });

            const destination = await db
                .select()
                .from(destinations)
                .where(eq(destinations.id, event.destinationId))
                .limit(1);

            if (destination.length === 0) {
                throw new Error(`Destination with ID ${event.destinationId} not found`);
            }

            const signature = createHmac("sha256", destination[0].secret)
                .update(body)
                .digest("hex");

            const res = await fetch(destinationUrl,
                {
                    method: "POST",
                    headers:
                    {
                        "content-type": "application/json",
                        "X-Webhook-Signature": signature
                    },
                    body: body,
                    signal: AbortSignal.timeout(5000)
                })

            success = res.ok;

            if (!res.ok) errorMessage = `Destination responded with ${res.status}`;
        } catch (error) {
            errorMessage = (error as Error).message;
        }

        await db
            .insert(deliveryAttempts)
            .values({
                eventId: event.id,
                attemptNumber,
                success,
                errorMessage: errorMessage?.slice(0, 500) ?? null,
            });

        await db
            .update(events)
            .set({
                status: success ? "delivered" : isLastAttempt ? "failed" : "retrying",
                attempts: attemptNumber,
                updatedAt: new Date(),
            })
            .where(eq(events.id, event.id));

        if (!success) throw new Error(errorMessage ?? "Delivery failed ");
    },
    { connection: redisConnection }
);

worker.on("completed", (job) => console.log(`Delivered job ${job.id}`));
worker.on("failed", (job, err) => console.log(`Failed job ${job?.id}: ${err.message}`));
worker.on("error", (err) => console.log("Worker error:", err.message));
worker.on("ready", () => console.log("Worker is ready and listening"));
