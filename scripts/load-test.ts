import "dotenv/config";
import autocannon from "autocannon";

const destinationIdsValue = process.env.DESTINATION_IDS;

if (!destinationIdsValue) {
  throw new Error("Set DESTINATION_IDS in .env to a comma-separated list of destination UUIDs.");
}

const DESTINATION_IDS = destinationIdsValue
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (DESTINATION_IDS.length === 0) {
  throw new Error("DESTINATION_IDS must contain at least one destination UUID.");
}

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000/api/events";

autocannon(
  {
    url: BASE_URL,
    method: "POST",
    connections: 50,
    amount: 50_000,
    headers: { "content-type": "application/json" },
    requests: [
      {
        setupRequest: (req) => {
          const destinationId = DESTINATION_IDS[Math.floor(Math.random() * DESTINATION_IDS.length)];
          req.body = JSON.stringify({
            destinationId,
            type: "loadtest.event",
            idempotencyKey: `loadtest-${Date.now()}-${Math.random()}`,
          });
          return req;
        },
      },
    ],
  },
  (err, result) => {
    if (err) {
      console.error("Load test failed:", err);
      process.exitCode = 1;
      return;
    }

    console.log(autocannon.printResult(result));
  }
);
