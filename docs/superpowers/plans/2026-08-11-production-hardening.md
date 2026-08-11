# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebase the Next.js 16.3 and TypeScript 7 branch and remove confirmed signup, accessibility, and production-delivery risks.

**Architecture:** Keep the existing Server Action, React Hook Form, and standalone Docker architecture. Add a pure signup orchestration boundary and a process-local fixed-window limiter so policy is deterministic and testable, while `lib/actions.ts` remains the thin Next.js request adapter. Keep visual changes inside the existing form and shared UI components.

**Tech Stack:** Next.js 16.3.0 App Router, React 19.2.8, TypeScript 7.0.2, Node.js 24, pnpm 11.20.0, Zod 4, React Hook Form 7, Radix UI, DayPicker 10, Node test runner, Docker.

## Global Constraints

- Preserve `next: 16.3.0`, `typescript: 7.0.2`, React/React DOM `19.2.8`, Node `24.x`, and pnpm `11.20.0`.
- Adopt `tsx: 4.23.11` from current `origin/master`.
- Add no package dependency, Redis, KV, CAPTCHA, Docker CI, or browser-test framework.
- Assume one long-lived container and a trusted reverse proxy that sanitizes `X-Forwarded-For`.
- Limit eligible signups to 20 attempts per client address per 10 minutes and 3 attempts per normalized email per hour.
- Keep Stockholm event and inclusive 20-to-100 age policy unchanged.
- Preserve DOB as validated `YYYY-MM-DD` through Listmonk.
- Format only touched files. Do not create another mass-format commit.
- Use separate backend, UI, and delivery commits.
- Do not push.

## File Structure

- Create `lib/signup-rate-limit.ts`: fixed-window state, X-Forwarded-For parsing, production singleton, and factory for deterministic tests.
- Create `lib/signup-rate-limit.test.ts`: rate threshold, reset, retry, and key-isolation behavior.
- Create `lib/signup.ts`: typed signup result and policy orchestration independent of Next request state.
- Create `lib/signup.test.ts`: stable domain-boundary tests that prove blocked, underage, and rate-limited requests suppress Listmonk.
- Create `lib/listmonk.test.ts`: external URL/config/timeout/failure boundary tests.
- Modify `lib/actions.ts`: thin Next.js adapter for `headers()`, production limiter, and Listmonk.
- Modify `lib/actions.test.ts`: public Server Action validation-result tests that do not depend on current time.
- Modify `lib/listmonk.ts`: safe config parsing, endpoint joining, timeout, and typed result.
- Modify `lib/signup-time-check.ts`: trim and constrain name/email in shared schemas.
- Modify `app/sign-up-form.tsx`: retryable result flow, pending state, POST fallback, and DOB popover accessibility.
- Modify `components/ui/calendar.tsx`: forward DayPicker dropdown accessibility props.
- Modify `components/ui/form.tsx`: live validation errors and accessible error color.
- Modify `app/globals.css`: separate WCAG-AA destructive text token from destructive button background.
- Modify `.dockerignore`, `app/manifest.json`, and `EVENT_DATES_GUIDE.md`: production-delivery corrections.

---

### Task 1: Rebase and Resolve Dependency State

**Files:**

- Modify through conflict resolution: `package.json`
- Regenerate: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: committed clean tree at `1cfc175` or its rebased replacement.
- Produces: branch based on latest `origin/master` with TypeScript `7.0.2` and tsx `4.23.11`.

- [ ] **Step 1: Confirm clean state and fetch current master**

Run:

```bash
git status --short
git fetch origin
git rev-parse origin/master
git log --oneline --decorate -8
```

Expected: empty status and current `origin/master` visible.

- [ ] **Step 2: Rebase onto current master**

Run:

```bash
git rebase origin/master
```

Expected: either success or a `package.json`/`pnpm-lock.yaml` dependency conflict.

- [ ] **Step 3: Resolve dependency conflict without hand-editing generated lock data**

Keep this effective manifest state:

```json
{
  "devDependencies": {
    "tsx": "4.23.11",
    "typescript": "7.0.2"
  }
}
```

For a lock conflict, resolve `package.json`, take either lockfile side only as a temporary base, then regenerate:

```bash
pnpm install --lockfile-only
git add package.json pnpm-lock.yaml
git rebase --continue
```

Expected: rebase completes. Do not use an interactive rebase or edit generated lock entries manually.

- [ ] **Step 4: Prove resolved dependency state**

Run:

```bash
CI=true pnpm install --frozen-lockfile
pnpm exec tsx --version
pnpm exec tsc --version
git merge-base --is-ancestor origin/master HEAD
git status --short
```

Expected: tsx `4.23.11`, TypeScript `7.0.2`, ancestor check exit `0`, clean tree.

---

### Task 2: Harden Signup Backend and Listmonk Boundary

**Files:**

- Create: `lib/signup-rate-limit.ts`
- Create: `lib/signup-rate-limit.test.ts`
- Create: `lib/signup.ts`
- Create: `lib/signup.test.ts`
- Create: `lib/listmonk.test.ts`
- Modify: `lib/actions.ts`
- Modify: `lib/actions.test.ts`
- Modify: `lib/listmonk.ts`
- Modify: `lib/signup-time-check.ts:6-19`

**Interfaces:**

- Consumes: `isSignupBlocked(Date)`, `isSignupDateOfBirthAllowed(string, Date)`, and the server/client schemas from `lib/signup-time-check.ts`.
- Produces: `SignupResult`, `submitSignup(data, dependencies)`, `createSignupRateLimiter()`, `checkSignupRateLimit`, `getForwardedClientIp()`, and `listmonk(data, options)`.

- [ ] **Step 1: Write failing fixed-window limiter tests**

Create `lib/signup-rate-limit.test.ts` with tests equivalent to:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { createSignupRateLimiter, getForwardedClientIp } from "./signup-rate-limit";

void test("parses the trusted first X-Forwarded-For address", () => {
  assert.equal(getForwardedClientIp("203.0.113.8, 10.0.0.4"), "203.0.113.8");
  assert.equal(getForwardedClientIp(" 203.0.113.8 "), "203.0.113.8");
  assert.equal(getForwardedClientIp(null), "unknown");
});

void test("allows 20 IP attempts and blocks the next for the remaining window", () => {
  const check = createSignupRateLimiter();
  for (let index = 0; index < 20; index += 1) {
    assert.deepEqual(check({ clientIp: "203.0.113.8", email: `person-${index}@example.com`, now: 0 }), {
      allowed: true,
    });
  }
  assert.deepEqual(check({ clientIp: "203.0.113.8", email: "next@example.com", now: 0 }), {
    allowed: false,
    retryAfterSeconds: 600,
  });
});

void test("allows 3 email attempts and blocks the next across IP addresses", () => {
  const check = createSignupRateLimiter();
  for (let index = 0; index < 3; index += 1) {
    assert.deepEqual(check({ clientIp: `203.0.113.${index}`, email: "person@example.com", now: 0 }), {
      allowed: true,
    });
  }
  assert.deepEqual(check({ clientIp: "203.0.113.9", email: "person@example.com", now: 0 }), {
    allowed: false,
    retryAfterSeconds: 3600,
  });
});

void test("resets windows at their exact expiry and isolates keys", () => {
  const check = createSignupRateLimiter();
  for (let index = 0; index < 3; index += 1) {
    assert.equal(check({ clientIp: `198.51.100.${index}`, email: "first@example.com", now: 0 }).allowed, true);
  }
  assert.equal(check({ clientIp: "198.51.100.9", email: "second@example.com", now: 1 }).allowed, true);
  assert.deepEqual(check({ clientIp: "198.51.100.10", email: "first@example.com", now: 3_600_000 }), {
    allowed: true,
  });
});

void test("returns the longest active retry interval", () => {
  const check = createSignupRateLimiter();
  for (let index = 0; index < 20; index += 1) {
    check({ clientIp: "192.0.2.1", email: `ip-${index}@example.com`, now: 0 });
  }
  for (let index = 0; index < 3; index += 1) {
    check({ clientIp: `192.0.2.${index + 2}`, email: "target@example.com", now: 300_000 });
  }
  assert.deepEqual(check({ clientIp: "192.0.2.1", email: "target@example.com", now: 360_000 }), {
    allowed: false,
    retryAfterSeconds: 3540,
  });
});
```

- [ ] **Step 2: Run limiter tests and verify RED**

Run:

```bash
pnpm exec tsx --test lib/signup-rate-limit.test.ts
```

Expected: FAIL because `lib/signup-rate-limit.ts` does not exist.

- [ ] **Step 3: Implement the minimum process-local limiter**

Create `lib/signup-rate-limit.ts` with these public types and constants:

```ts
export type SignupRateLimitInput = { clientIp: string; email: string; now?: number };
export type SignupRateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };
export type SignupRateLimitCheck = (input: SignupRateLimitInput) => SignupRateLimitResult;

const IP_LIMIT = 20;
const IP_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_LIMIT = 3;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
```

Implement `getForwardedClientIp(value)` by splitting on comma, trimming the first value, and falling back to `unknown`. Implement `createSignupRateLimiter()` with one private `Map<string, { count: number; expiresAt: number }>`; consume `ip:${clientIp}` and `email:${email}` windows; block only after the configured count; use `Math.ceil(retryMs / 1000)`; sweep expired map entries every 100 checks. Export one production singleton:

```ts
export const checkSignupRateLimit = createSignupRateLimiter();
```

- [ ] **Step 4: Verify limiter GREEN**

Run:

```bash
pnpm exec tsx --test lib/signup-rate-limit.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Write failing signup orchestration tests**

Create `lib/signup.test.ts`. Build dependencies with a fixed `now`, a fixed client address, a fresh limiter, and a `subscribe` spy. Cover these exact observable outcomes:

```ts
assert.deepEqual(await submitSignup({}, dependencies), {
  status: "error",
  message: "Invalid form submission.",
});

assert.deepEqual(await submitSignup(validSignup, blockedDependencies), {
  status: "blocked",
  message: "Sign-ups are closed for today's event.",
});
assert.equal(subscribeCalls, 0);

assert.deepEqual(await submitSignup({ ...validSignup, dob: "2010-01-01" }, underageDependencies), {
  status: "error",
  message: "Invalid date of birth.",
});
assert.equal(subscribeCalls, 0);

assert.deepEqual(await submitSignup(validSignup, rateLimitedDependencies), {
  status: "rate-limited",
  message: "Too many signup attempts. Try again in 10 minutes.",
  retryAfterSeconds: 600,
});
assert.equal(subscribeCalls, 0);

assert.deepEqual(await submitSignup(validSignup, successfulDependencies), {
  status: "success",
  message: "Thanks for signing up! Please check your email for a confirmation.",
});
assert.equal(deliveredPayload.attribs.dob, validSignup.dob);
```

Also assert upstream `{ ok: false }` returns `{ status: "error", message: "An error occurred while trying to sign up. Please try again." }` and keeps DOB unchanged when `{ ok: true }`.

- [ ] **Step 6: Run orchestration tests and verify RED**

Run:

```bash
pnpm exec tsx --test lib/signup.test.ts
```

Expected: FAIL because `lib/signup.ts` does not exist.

- [ ] **Step 7: Implement typed signup orchestration**

Create `lib/signup.ts` with this public contract:

```ts
import type { ListmonkData, ListmonkResult } from "./listmonk";
import type { SignupRateLimitCheck } from "./signup-rate-limit";

export type SignupResult =
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | { status: "blocked"; message: string }
  | { status: "rate-limited"; message: string; retryAfterSeconds: number };

export type SignupDependencies = {
  now: Date;
  getClientIp: () => Promise<string>;
  checkRateLimit: SignupRateLimitCheck;
  subscribe: (data: ListmonkData) => Promise<ListmonkResult>;
};

export async function submitSignup(data: unknown, dependencies: SignupDependencies): Promise<SignupResult>;
```

Implementation order is mandatory: schema parse, event closure, DOB policy, client-IP read, rate-limit check, Listmonk call. Build `ListmonkData` with list `3` and exact DOB. Convert retry seconds to rounded-up minutes for the public message. Do not call `getClientIp`, limiter, or Listmonk before earlier policy checks pass.

- [ ] **Step 8: Tighten shared schema and verify domain GREEN**

Replace `signupFormBase` in `lib/signup-time-check.ts` with these trim-first Zod chains:

```ts
const signupFormBase = {
  name: z.string().trim().min(2, { error: "Name is required" }).max(50, { error: "Name is too long" }),
  email: z
    .string()
    .trim()
    .max(254, { error: "Email is too long" })
    .pipe(z.email({ error: "Email is invalid" }))
    .transform((email) => email.toLowerCase()),
};
```

Run:

```bash
pnpm exec tsx --test lib/signup.test.ts lib/signup-time-check.test.ts
```

Expected: all domain and date-policy tests pass with trimmed names and normalized email output.

- [ ] **Step 9: Write failing Listmonk boundary tests**

Create `lib/listmonk.test.ts`. Register the existing `server-only` test hook before dynamically importing `./listmonk`. Cover:

```ts
assert.throws(() => getListmonkEndpoint({ NODE_ENV: "production" }), /LISTMONK_URL/);
assert.equal(
  getListmonkEndpoint({
    NODE_ENV: "production",
    LISTMONK_URL: "https://list.example/api",
    LISTMONK_USER: "u",
    LISTMONK_PASS: "p",
  }).url.href,
  "https://list.example/api/subscribers",
);
assert.equal(
  getListmonkEndpoint({
    NODE_ENV: "production",
    LISTMONK_URL: "https://list.example/api/",
    LISTMONK_USER: "u",
    LISTMONK_PASS: "p",
  }).url.href,
  "https://list.example/api/subscribers",
);
```

Also assert `ftp:` and malformed URLs fail before fetch; HTTP 409, network rejection, and timeout return `{ ok: false }`; HTTP 200 returns `{ ok: true }`; the fetch body preserves DOB; and the request includes an aborted signal after a short test timeout.

- [ ] **Step 10: Run Listmonk tests and verify RED**

Run:

```bash
pnpm exec tsx --test lib/listmonk.test.ts
```

Expected: FAIL because current Listmonk module returns strings, joins URLs by concatenation, and has no timeout/config API.

- [ ] **Step 11: Implement safe Listmonk boundary**

Update `lib/listmonk.ts` to export:

```ts
export interface ListmonkData {
  email: string;
  name: string;
  status: "enabled" | "blocklisted";
  lists: number[];
  attribs: Record<string, string>;
}

export type ListmonkResult = { ok: true } | { ok: false };

export type ListmonkOptions = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export function getListmonkEndpoint(env?: NodeJS.ProcessEnv): {
  url: URL;
  authorization: string;
};

export default async function listmonk(data: ListmonkData, options?: ListmonkOptions): Promise<ListmonkResult>;
```

`getListmonkEndpoint` must require URL/user/password when `NODE_ENV === "production"`, retain localhost development defaults otherwise, accept only HTTP(S), append `/` to the base pathname when absent, and resolve `subscribers` with `new URL`. `listmonk` must use `AbortSignal.timeout(options.timeoutMs ?? 10_000)`, return `{ ok: response.ok }`, and catch config, timeout, network, and fetch failures as `{ ok: false }`. Public results must contain no URL, credential, or subscriber-existence detail.

- [ ] **Step 12: Wire the thin Next.js Server Action**

Replace `lib/actions.ts` with a thin adapter equivalent to:

```ts
"use server";

import { headers } from "next/headers";

import { submitSignup, type SignupResult } from "./signup";
import { checkSignupRateLimit, getForwardedClientIp } from "./signup-rate-limit";

export async function signupFormSubmit(data: unknown): Promise<SignupResult> {
  return submitSignup(data, {
    now: new Date(),
    getClientIp: async () => getForwardedClientIp((await headers()).get("x-forwarded-for")),
    checkRateLimit: checkSignupRateLimit,
    subscribe: async (payload) => {
      const { default: listmonk } = await import("./listmonk");
      return listmonk(payload);
    },
  });
}
```

Update `lib/actions.test.ts` to assert typed malformed-input results. Remove the current real-time happy-path test because deterministic payload delivery now belongs to `lib/signup.test.ts` and `lib/listmonk.test.ts`.

- [ ] **Step 13: Verify complete backend GREEN**

Run:

```bash
pnpm exec oxfmt --write lib/actions.ts lib/actions.test.ts lib/listmonk.ts lib/listmonk.test.ts lib/signup.ts lib/signup.test.ts lib/signup-rate-limit.ts lib/signup-rate-limit.test.ts lib/signup-time-check.ts
pnpm exec tsx --test lib/signup-rate-limit.test.ts lib/signup.test.ts lib/listmonk.test.ts lib/actions.test.ts lib/signup-time-check.test.ts
pnpm run lint
```

Expected: all focused tests pass and lint/type-check exits `0`.

- [ ] **Step 14: Commit backend scope**

Inspect and commit only backend files:

```bash
git diff --check
git diff --stat
git add lib/actions.ts lib/actions.test.ts lib/listmonk.ts lib/listmonk.test.ts lib/signup.ts lib/signup.test.ts lib/signup-rate-limit.ts lib/signup-rate-limit.test.ts lib/signup-time-check.ts
git diff --cached --check
git commit -m "fix: harden signup API"
```

Expected: one backend commit, no UI, Docker, manifest, guide, or mass-format changes.

---

### Task 3: Make Signup Form Retryable and Accessible

**Files:**

- Modify: `app/sign-up-form.tsx`
- Modify: `components/ui/calendar.tsx`
- Modify: `components/ui/form.tsx`
- Modify: `app/globals.css`

**Interfaces:**

- Consumes: `signupFormSubmit(data): Promise<SignupResult>` and `SignupResult` from Task 2.
- Produces: retryable error flow, true pending state, accessible result announcements, and corrected DOB picker behavior.

- [ ] **Step 1: Record failing browser behaviors before edits**

Run the app with unreachable development Listmonk, submit valid data, and record these failures with agent-browser: form disappears after error; submit remains disabled after a rejected action; error has no alert/status semantics; DOB popover remains open after selection. This is the RED evidence for behavior that has no existing component-test harness.

- [ ] **Step 2: Replace permanent submission state with typed result state**

In `app/sign-up-form.tsx`:

```ts
import { useEffect, useRef, useState } from "react";
import { signupFormSubmit } from "@/lib/actions";
import type { SignupResult } from "@/lib/signup";

const [response, setResponse] = useState<SignupResult | null>(null);
const [dobOpen, setDobOpen] = useState(false);
const resultRef = useRef<HTMLDivElement>(null);
const dobTriggerRef = useRef<HTMLButtonElement>(null);
const pending = form.formState.isSubmitting;

async function onSubmit(values: z.infer<typeof signupFormClientSchema>) {
  setResponse(null);
  try {
    setResponse(await signupFormSubmit({ ...values, dob: format(values.dob, "yyyy-MM-dd") }));
  } catch {
    setResponse({ status: "error", message: "An error occurred while trying to sign up. Please try again." });
  }
}

useEffect(() => {
  if (response) resultRef.current?.focus();
}, [response]);
```

Delete `submitted`. Only success and blocked results replace the form. Render error and rate-limit results above the still-populated form with `role="alert"`, `tabIndex={-1}`, and `ref={resultRef}`. Render success with `role="status"`, `aria-live="polite"`, `tabIndex={-1}`, and the same ref.

- [ ] **Step 3: Make the form private before hydration and expose pending state**

Set `method="post"` on the existing form and replace its submit button with:

```tsx
<Button type="submit" disabled={pending || initialStatus.blocked}>
  {pending ? "Submitting…" : "Submit"}
</Button>
```

The opening tag must be exactly:

```tsx
<form method="post" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
```

Keep progressive no-JavaScript success out of scope. The fallback must POST, not put PII in the URL.

- [ ] **Step 4: Add required, autocomplete, and age semantics**

Use visible labels `Email (required)`, `Name (required)`, and `Date of birth (required)`. Set:

```tsx
<Input type="email" autoComplete="email" required maxLength={254} placeholder="name@example.com" {...field} />
<Input autoComplete="name" required maxLength={50} placeholder="Firstname Lastname" {...field} />
```

Change DOB description to `You must be between 20 and 100 years old to sign up.`

- [ ] **Step 5: Control DOB popover, restore focus, and fix responsive styling**

Use a controlled `Popover` and attach both refs:

```tsx
<Popover open={dobOpen} onOpenChange={setDobOpen}>
  <PopoverTrigger asChild>
    <FormControl>
      <Button
        ref={(element) => {
          field.ref(element);
          dobTriggerRef.current = element;
        }}
        type="button"
        variant="outline"
        aria-required="true"
        aria-label={field.value ? `Date of birth: ${format(field.value, "PPP")}. Change date` : "Date of birth: Pick a date"}
        className={cn("w-full pl-3 text-left font-normal sm:w-[240px]", !field.value && "text-muted-foreground")}
      >
        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
      </Button>
    </FormControl>
  </PopoverTrigger>
  <PopoverContent
    aria-label="Choose date of birth"
    className="max-h-[calc(100vh-2rem)] w-auto max-w-[calc(100vw-2rem)] overflow-auto p-0"
    align="start"
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      dobTriggerRef.current?.focus();
    }}
  >
```

In Calendar `onSelect`, call `field.onChange(date)` and `setDobOpen(false)` only when a date exists.

- [ ] **Step 6: Forward DayPicker dropdown accessibility properties**

In `components/ui/calendar.tsx`, replace `CustomSelectDropdown` with:

```tsx
function CustomSelectDropdown({ options, value, onChange, disabled, "aria-label": ariaLabel }: DropdownProps) {
  const handleChange = (nextValue: string) => {
    if (onChange) {
      onChange({ target: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>);
    }
  };

  return (
    <Select value={value?.toString()} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className="mx-2 mt-2 inline-flex w-2/5">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {options?.map((option) => (
          <SelectItem key={option.value} value={option.value.toString()} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 7: Add live field errors and a separate accessible text token**

In `components/ui/form.tsx`, render `FormMessage` with `role="alert"` and `aria-live="polite"`. Change label/message error text from `text-destructive` to `text-destructive-text`.

In `app/globals.css`, add:

```css
@theme {
  --color-destructive-text: hsl(var(--destructive-text));
}

:root {
  --destructive-text: 0 72% 45%;
}

.dark {
  --destructive-text: 0 86% 72%;
}
```

Verify the dark value against the actual `--background` with a contrast calculator. If it is below 4.5:1, increase lightness only enough to pass. Do not alter `--destructive` or `--destructive-foreground`, which own destructive-button backgrounds.

- [ ] **Step 8: Use semantic blocked and result notices**

Replace the blocked notice title paragraph with an `<h2>`. Preserve existing orange styling. For a server-returned blocked result, reuse the same semantic notice. Keep normal user-facing wording; do not add debug details.

- [ ] **Step 9: Format and verify UI behavior GREEN**

Run:

```bash
pnpm exec oxfmt --write app/sign-up-form.tsx components/ui/calendar.tsx components/ui/form.tsx app/globals.css
pnpm run format:check
pnpm run lint
pnpm run build
```

Then use agent-browser to verify: email/name autocomplete attributes; keyboard-open DOB; labeled month/year selects; selected date closes popover and returns focus; placeholder-only muted styling; pending label and disabled duplicate submit; transport/server error keeps values and form; error result receives focus and has alert semantics; success receives status semantics; 320-pixel viewport has no horizontal overflow.

Expected: checks pass and every RED observation from Step 1 is reversed.

- [ ] **Step 10: Commit UI scope**

```bash
git diff --check
git add app/sign-up-form.tsx components/ui/calendar.tsx components/ui/form.tsx app/globals.css
git diff --cached --check
git commit -m "fix: make signup form resilient"
```

Expected: one UI commit containing no backend, Docker, manifest, guide, or unrelated formatting changes.

---

### Task 4: Harden Docker Context, Manifest, and Event Guide

**Files:**

- Modify: `.dockerignore`
- Modify: `app/manifest.json`
- Modify: `EVENT_DATES_GUIDE.md`

**Interfaces:**

- Consumes: existing standalone build and public favicon files.
- Produces: smaller safe Docker context, resolvable manifest icons, and valid operational instructions.

- [ ] **Step 1: Reproduce delivery defects**

Confirm before edits:

```bash
test -f public/image/favicon/web-app-manifest-192x192.png
test -f public/image/favicon/web-app-manifest-512x512.png
test ! -f public/favicon/web-app-manifest-192x192.png
docker build --no-cache --progress=plain -t bam:pre-hardening .
```

Expected: actual icon files exist only under `public/image/favicon`; current context includes generated files unless excluded.

- [ ] **Step 2: Harden Docker context**

Append exactly:

```text
.env*
next-env.d.ts
*.tsbuildinfo
```

Do not add a nonexistent environment-template exception. Do not remove `wget` from `Dockerfile`.

- [ ] **Step 3: Fix manifest icon paths**

Replace both sources in `app/manifest.json`:

```json
"src": "/image/favicon/web-app-manifest-192x192.png"
```

and:

```json
"src": "/image/favicon/web-app-manifest-512x512.png"
```

- [ ] **Step 4: Make event guide examples valid and operational**

Replace the commented array example with valid JSON:

```json
{
  "eventDates": ["2024-12-25", "2024-12-31", "2025-01-15", "2025-02-14", "2025-03-20"]
}
```

Replace the final sentence with: `Save the file, rebuild the application, and redeploy it so the new configuration is included in the production artifact.` Preserve the Stockholm civil-time notes.

- [ ] **Step 5: Format and verify delivery files**

Run:

```bash
pnpm exec oxfmt --write app/manifest.json
pnpm run format:check
git diff --check
docker build --progress=plain -t bam:hardening .
```

Start the image on an unused port and request `/`, `/manifest.webmanifest`, both icon paths, and one `/_next/static/` asset. Expected: image builds and all requests return `200`.

- [ ] **Step 6: Commit delivery scope**

```bash
git add .dockerignore app/manifest.json EVENT_DATES_GUIDE.md
git diff --cached --check
git commit -m "fix: harden production delivery"
```

Expected: one delivery commit and no CI or Dockerfile changes.

---

### Task 5: Full Verification and History Audit

**Files:**

- Verify only; do not create generated-file commits.

**Interfaces:**

- Consumes: all prior tasks.
- Produces: fresh evidence for migration, signup policy, UI, standalone artifact, Docker image, and commit scope.

- [ ] **Step 1: Run frozen install and static checks**

```bash
CI=true pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm exec next typegen
pnpm exec tsc --noEmit
```

Expected: all exit `0`; lint emits zero warnings.

- [ ] **Step 2: Run tests under two host time zones**

```bash
TZ=UTC pnpm test
TZ=America/New_York pnpm test
```

Expected: identical pass counts and zero failures.

- [ ] **Step 3: Build and inspect Next output**

```bash
pnpm run build
```

Expected: Next.js `16.3.0`; Cache Components and Partial Prefetching active; `/` shown as Partial Prerender; standalone postbuild succeeds.

- [ ] **Step 4: Run React regression scan**

```bash
npx react-doctor@latest --verbose --scope changed
```

Expected: no introduced diagnostics. Record score separately because prior aggregate score was 81 despite no findings.

- [ ] **Step 5: Verify standalone and browser behavior**

Run standalone on unused ports and use agent-browser with browser time zones `Europe/Stockholm` and `America/New_York`. Verify direct route, required validation, keyboard DOB flow, pending state, error retry, success status, blocked status, rate-limit notice, focus movement, 320-pixel viewport, and console errors. Use a temporary local Listmonk HTTP stub outside the repository to produce deterministic non-2xx and success responses. Expected: no browser errors; only known Plausible localhost warnings are acceptable.

- [ ] **Step 6: Verify Docker artifact**

```bash
docker build --progress=plain -t bam:hardening .
docker run --rm -d --name bam-hardening -p 3102:3000 bam:hardening
```

Request route, manifest, icon, and static assets; inspect container logs; then stop the container. Expected: all required resources return `200`, no runtime error, and image uses generated standalone server.

- [ ] **Step 7: Audit final history and tree**

```bash
git diff --check origin/master...HEAD
git status --short
git log --oneline --decorate origin/master..HEAD
git diff --stat origin/master...HEAD
git merge-base --is-ancestor origin/master HEAD
```

Expected: clean tree; scoped docs/backend/UI/delivery commits; no later mass-format commit; ancestor check exit `0`; no push performed.
