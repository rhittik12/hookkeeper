import { pgTable, uuid, varchar, timestamp, pgEnum, integer, boolean } from "drizzle-orm/pg-core";

export const statusEnum = pgEnum("status", ["pending", "retrying", "delivered", "failed"]);

export const destinations = pgTable("destinations", {
    id: uuid("id").defaultRandom().primaryKey(),
    url: varchar("url", { length: 500 }).notNull(),
    secret: varchar("secret", { length: 250 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
})

export const events = pgTable("events", {
    id: uuid("id").defaultRandom().primaryKey(),
    destinationId: uuid("destination_id").notNull().references(() => destinations.id),
    type: varchar("type", { length: 100 }).notNull(),
    status: statusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
})

export const deliveryAttempts = pgTable("delivery_attempts", {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull().references(() => events.id),
    attemptNumber: integer("attempt_number").notNull(),
    success: boolean("success").notNull(),
    errorMessage: varchar("error_message", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull()
})