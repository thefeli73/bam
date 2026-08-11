export type SignupRateLimitInput = { clientIp: string; email: string; now?: number };
export type SignupRateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };
export type SignupRateLimitCheck = (input: SignupRateLimitInput) => SignupRateLimitResult;

const IP_LIMIT = 20;
const IP_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_LIMIT = 3;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL = 100;

type Window = { count: number; expiresAt: number };

export function getForwardedClientIp(value: string | null): string {
  return value?.split(",", 1)[0]?.trim() || "unknown";
}

export function createSignupRateLimiter(): SignupRateLimitCheck {
  const windows = new Map<string, Window>();
  let checks = 0;

  return ({ clientIp, email, now = Date.now() }) => {
    checks += 1;
    if (checks % CLEANUP_INTERVAL === 0) {
      for (const [key, window] of windows) {
        if (window.expiresAt <= now) windows.delete(key);
      }
    }

    const limits = [
      { key: `ip:${clientIp}`, limit: IP_LIMIT, duration: IP_WINDOW_MS },
      { key: `email:${email}`, limit: EMAIL_LIMIT, duration: EMAIL_WINDOW_MS },
    ];
    const active = limits.map((limit) => {
      const window = windows.get(limit.key);
      if (window && window.expiresAt > now) return window;
      windows.delete(limit.key);
      return undefined;
    });
    const retryAfterSeconds = Math.max(
      0,
      ...active.map((window, index) =>
        window && window.count >= limits[index].limit ? Math.ceil((window.expiresAt - now) / 1000) : 0,
      ),
    );

    if (retryAfterSeconds > 0) return { allowed: false, retryAfterSeconds };

    limits.forEach((limit, index) => {
      const window = active[index];
      if (window) window.count += 1;
      else windows.set(limit.key, { count: 1, expiresAt: now + limit.duration });
    });
    return { allowed: true };
  };
}

export const checkSignupRateLimit = createSignupRateLimiter();
