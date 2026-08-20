import { NextResponse } from "next/server";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type LimitRule = {
  requests: number;
  window: Duration;
};

const CHAT_LIMITS = {
  perMinute: { requests: 5, window: "1 m" },
  perDay: { requests: 20, window: "1 d" },
  globalPerDay: { requests: 50, window: "1 d" },
} satisfies Record<string, LimitRule>;

const UPLOAD_LIMITS = {
  perHour: { requests: 3, window: "1 h" },
  perDay: { requests: 10, window: "1 d" },
} satisfies Record<string, LimitRule>;

export type RateLimitDecision =
  | { ok: true }
  | { ok: false; retryAfter: number };

const ALLOW: RateLimitDecision = { ok: true };

type RateLimiters = {
  chat: {
    perMinute: Ratelimit;
    perDay: Ratelimit;
    globalPerDay: Ratelimit;
  };
  upload: {
    perHour: Ratelimit;
    perDay: Ratelimit;
  };
};

let cachedLimiters: RateLimiters | null | undefined;
let warnedDisabled = false;

function createLimiters(): RateLimiters | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });
  const createLimiter = (prefix: string, rule: LimitRule) =>
    new Ratelimit({
      redis,
      prefix,
      limiter: Ratelimit.slidingWindow(rule.requests, rule.window),
    });

  return {
    chat: {
      perMinute: createLimiter("rl:chat:burst", CHAT_LIMITS.perMinute),
      perDay: createLimiter("rl:chat:daily", CHAT_LIMITS.perDay),
      globalPerDay: createLimiter(
        "rl:chat:global",
        CHAT_LIMITS.globalPerDay,
      ),
    },
    upload: {
      perHour: createLimiter("rl:upload:hourly", UPLOAD_LIMITS.perHour),
      perDay: createLimiter("rl:upload:daily", UPLOAD_LIMITS.perDay),
    },
  };
}

function getLimiters(): RateLimiters | null {
  if (cachedLimiters === undefined) {
    cachedLimiters = createLimiters();
  }

  if (cachedLimiters === null && !warnedDisabled) {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting is DISABLED",
    );
    warnedDisabled = true;
  }

  return cachedLimiters;
}

async function runChecks(
  checks: { limiter: Ratelimit; key: string }[],
): Promise<RateLimitDecision> {
  try {
    for (const { limiter, key } of checks) {
      const { success, reset } = await limiter.limit(key);
      if (!success) return { ok: false, retryAfter: retryAfterSeconds(reset) };
    }
    return ALLOW;
  } catch (error) {
    // Keep the endpoint available if Upstash has a transient failure.
    console.error("[rate-limit] check failed, allowing request", error);
    return ALLOW;
  }
}

export async function checkChatRateLimit(ip: string): Promise<RateLimitDecision> {
  const limiters = getLimiters();
  if (!limiters) return ALLOW;

  return runChecks([
    { limiter: limiters.chat.perMinute, key: ip },
    { limiter: limiters.chat.perDay, key: ip },
    { limiter: limiters.chat.globalPerDay, key: "global" },
  ]);
}

export async function checkUploadRateLimit(
  ip: string,
): Promise<RateLimitDecision> {
  const limiters = getLimiters();
  if (!limiters) return ALLOW;

  return runChecks([
    { limiter: limiters.upload.perHour, key: ip },
    { limiter: limiters.upload.perDay, key: ip },
  ]);
}

export function rateLimitResponse(
  message: string,
  retryAfter: number,
): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

function retryAfterSeconds(reset: number): number {
  const seconds = Math.ceil((reset - Date.now()) / 1000);
  return seconds > 0 ? seconds : 1;
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "127.0.0.1";
}
