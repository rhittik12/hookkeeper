import "dotenv/config";
import { deliveryQueue } from "../lib/queue";

async function main() {
  const job = await deliveryQueue.add(
    "deliver-event",
    { eventId: "test-123", destinationUrl: "https://webhook.site/test" },
    { jobId: "test-job-" + Date.now() }
  );
  console.log("Added job:", job.id);
  process.exit(0);
}

main();