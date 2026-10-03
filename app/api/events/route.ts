import { db } from "@/db/index";
import { events, destinations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createEventSchema = z.object({
    destinationId: z.string().uuid({ message: "destinationId must be a valid UUID" }),
    type: z.string().min(1, { message: "type is required" }),
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

        const { destinationId, type } = parsed.data;

        const destination = await db
            .select()
            .from(destinations)
            .where(eq(destinations.id, destinationId))
            .limit(1);

        if (destination.length === 0) {
            return Response.json({ error: "Destination not found" }, { status: 404 });
        }

        const [event] = await db
            .insert(events)
            .values({
                destinationId,
                type,
            })
            .returning();

        return Response.json(event, { status: 201 });

    } catch (error) {
        console.error("Error creating event:", error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}