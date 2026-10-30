import "dotenv/config";
import cron from "node-cron";
import { db } from "../db/index";
import { events, destinations } from "../db/schema";
import { eq, lt, and } from "drizzle-orm";
import { deliveryQueue } from "../lib/queue";

async function sweep() {
}