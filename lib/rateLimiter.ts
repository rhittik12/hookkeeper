import { redisConnection } from "./redis";

const TOKEN_BUCKET_SCRIPT = `

    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refillRate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])

    local bucket = redis.call("HMGET", key, "tokens", "lastRefill")
    local tokens = tonumber(bucket[1])
    local lastRefill = tonumber(bucket[2])

    if tokens == nil then
    tokens = capacity
    lastRefill = now
    end

    local elapsed = now - lastRefill
    local refillAmount = elapsed * refillRate
    tokens = math.min(capacity, tokens + refillAmount)

    local allowed = 0
    if tokens >= 1 then
    tokens = tokens - 1
    allowed = 1
    end

    redis.call("HMSET", key, "tokens", tokens, "lastRefill", now)
    redis.call("EXPIRE", key, 60)

    return allowed
`;

export async function canAttemptDelivery(destinationId: string): Promise<boolean> {
    const key = `rate-limit:${destinationId}`;
    const capacity = 40;
    const refillRate = 5; 
    const now = Date.now() / 1000;

    const result = await redisConnection.eval(
        TOKEN_BUCKET_SCRIPT,
        1,
        key,
        capacity,
        refillRate,
        now
    );

    return result === 1;
}