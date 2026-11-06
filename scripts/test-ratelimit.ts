import "dotenv/config";

const DESTINATION_ID = process.env.DESTINATION_ID;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000/api/events";

async function fireEvents() {
  const requests = Array.from({ length: 10 }, (_, i) =>
    fetch(BASE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        destinationId: DESTINATION_ID,
        type: "ratelimit.test",
        idempotencyKey: `ratelimit-test-${Date.now()}-${i}`,
      }),
    }).then(async (res) => {
      const data = await res.json();
      console.log(`Event ${i}: ${res.status}`, data.id ?? data.error);
    })
  );

  await Promise.all(requests);
}

fireEvents();