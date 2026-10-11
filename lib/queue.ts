import {Queue} from "bullmq";
import { redisConnection } from "./redis";

export const deliveryQueue = new Queue("deliveryQueue", { connection: redisConnection });