import {Queue} from "bullmq";
import { redisConnection } from "./redis";

export const deliveryQueue = new Queue("delivery-event", { connection: redisConnection });