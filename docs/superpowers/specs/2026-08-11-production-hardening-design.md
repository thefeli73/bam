# Production Hardening Design

## Goal

Make the Next.js 16.3 and TypeScript 7 branch review-ready and address confirmed production risks without adding infrastructure that this single-container application does not need.

## Scope

This change will:

- rebase the branch onto current `origin/master`;
- preserve TypeScript `7.0.2` and adopt master’s `tsx 4.23.11`;
- add a dependency-free, process-local signup rate limiter;
- make signup errors recoverable and accessible;
- harden Listmonk configuration, URL handling, and request timeout behavior;
- harden the Docker build context;
- fix manifest icon paths and event-date instructions;
- add stable tests for server enforcement and external boundaries;
- verify the standalone and Docker artifacts manually.

This change will not:

- add Redis, KV, CAPTCHA, or another service;
- add a Docker build job to CI;
- add automated browser infrastructure;
- change the event blocking or age policy;
- push the branch;
- perform unrelated refactoring or mass formatting.

## Confirmed Deployment Assumptions

- The application runs as one long-lived Node.js container.
- The trusted reverse proxy sanitizes `X-Forwarded-For`.
- The first `X-Forwarded-For` value is the client address.
- Listmonk list `3` uses double opt-in.
- Process-local limits can reset when the container restarts.

## Work Order and Commit Boundaries

1. Rebase onto current `origin/master` before application edits.
2. Commit backend signup and Listmonk hardening together.
3. Commit form resilience and accessibility changes together.
4. Commit Docker, manifest, and operational documentation fixes together.
5. Do not create a separate mass-format commit. Format only touched files in their owning commit.
6. Do not push.

## Rebase and Dependency Resolution

The rebase must retain:

- `next: 16.3.0`;
- `typescript: 7.0.2`;
- `tsx: 4.23.11` from current master;
- `pnpm: 11.20.0`;
- the existing formatter and standalone scripts.

Resolve `package.json` conflicts intentionally. Regenerate `pnpm-lock.yaml` with pnpm. Do not edit the lockfile by hand.

## Signup Result Contract

The Server Action must return a discriminated result instead of an untyped string:

```ts
type SignupResult =
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | { status: "blocked"; message: string }
  | { status: "rate-limited"; message: string; retryAfterSeconds: number };
```

The client must use `status`, not message text, to choose behavior:

- `success`: replace the form with a success status;
- `blocked`: replace the form with the closure notice;
- `error`: keep the form visible and allow retry;
- `rate-limited`: keep the form visible, announce the message, and allow retry after the returned interval.

Transport exceptions must become a generic retryable client error. They must not leave the form permanently disabled.

## Rate Limiter

Use a server-only, process-local fixed-window limiter with no dependency.

Apply two limits to submissions that already passed schema, event-closure, and age checks, immediately before the Listmonk request:

- client address: 20 attempts per 10 minutes;
- normalized email: 3 attempts per hour.

The limiter must:

- use the sanitized first `X-Forwarded-For` value;
- use normalized email as the email key;
- return the longest applicable retry interval when blocked;
- keep no email, name, or DOB in logs;
- lazily remove expired entries;
- avoid unbounded expired-entry retention;
- expose pure clock-controlled behavior for deterministic tests;
- remain server-only and never serialize limiter state to the client.

If the client-address header is absent, use a stable `unknown` key. This intentionally applies one shared fallback limit rather than trusting a client-supplied alternative header.

## Input Validation

The server schema remains authoritative.

- Trim name before length validation.
- Reject whitespace-only names.
- Trim email before email validation.
- Limit email to 254 characters.
- Preserve DOB as a validated `YYYY-MM-DD` string.
- Preserve the inclusive age range of 20 through 100 Stockholm calendar years.

The client schema must mirror user-facing constraints but must not replace server validation.

## Listmonk Boundary

Production requests must require `LISTMONK_URL`, `LISTMONK_USER`, and `LISTMONK_PASS`. Development may retain explicit localhost defaults.

Listmonk URL handling must:

- accept valid `http:` or `https:` base URLs;
- normalize the trailing slash;
- join the `subscribers` path without producing `apisubscribers` or dropping `/api`;
- reject malformed or unsupported URLs before fetch.

The request must:

- use a 10-second timeout through the Node.js platform API;
- keep Basic credentials server-side;
- preserve accepted DOB unchanged;
- distinguish upstream success from upstream or configuration failure;
- return a generic public error without exposing credentials, URL details, or subscriber existence.

The implementation may record sanitized server diagnostics. It must never log credentials or submitted personal data.

## Form Behavior

Keep React Hook Form and the existing date-picker components. Do not redesign the page.

The form must:

- use real submission state instead of a permanent `submitted` flag;
- show `Submitting…` while pending;
- prevent duplicate submission while pending;
- remain visible after retryable server or transport errors;
- focus or announce the result region after completion;
- use `role="alert"` for errors and `role="status"` for success;
- use `method="post"` so a pre-hydration submit does not put personal data in the URL;
- preserve entered values after an error;
- close the date popover after selection and restore focus to the trigger.

Progressive signup without JavaScript is not required. A pre-hydration POST may fail safely, but it must not expose form values in a query string.

## Accessibility and Responsive Behavior

The implementation must:

- forward DayPicker month/year `aria-label` and disabled state to custom select controls;
- give the date popover dialog an accessible name;
- attach React Hook Form’s field ref to the DOB trigger;
- expose validation messages through a live alert region;
- mark all required fields in visible and programmatic form;
- use `type="email"` and `autocomplete="email"` for email;
- use `autocomplete="name"` for name;
- include the selected DOB in the trigger’s accessible name;
- use muted text for the placeholder, not the selected value;
- disclose the inclusive 20-to-100 age range;
- use a semantic heading for the blocked notice;
- constrain the date popover to available viewport width and height;
- provide error text contrast of at least 4.5:1 in the forced dark theme without changing the destructive-button background contract.

Visual hierarchy, spacing, and interaction feel must remain consistent with the existing page.

## Delivery and Documentation

Add these Docker context exclusions:

```text
.env*
next-env.d.ts
*.tsbuildinfo
```

Do not add an exception for an environment template because the repository has none.

Update manifest icons to the existing public paths under `/image/favicon/`.

Update `EVENT_DATES_GUIDE.md` to:

- use valid JSON without comments;
- explain that a configuration change requires rebuild and redeploy;
- retain the Stockholm civil-time explanation.

Do not add Docker CI. Retain the current `wget` package because external healthcheck usage is not represented in this repository and removal is not proven safe.

## Tests

Tests must protect public or domain behavior, not source text.

Add deterministic coverage for:

- each rate-limit threshold, reset, retry interval, and key isolation;
- blocked submissions never calling Listmonk;
- underage submissions never calling Listmonk;
- rate-limited submissions never calling Listmonk;
- accepted DOB reaching Listmonk unchanged;
- Listmonk base URLs with and without trailing slash;
- malformed production Listmonk configuration;
- non-2xx, timeout, and network failures returning retryable errors;
- typed success, error, blocked, and rate-limited action results.

Freeze or inject time at the narrowest stable boundary. Do not make a client-controlled clock part of the Server Action API.

Browser behavior will be verified manually in at least Stockholm and America/New_York browser time zones. Do not add a browser-test dependency.

## Verification

Run, in order:

1. frozen install;
2. format check;
3. Next type generation, type-aware lint, and TypeScript 7 type-check;
4. tests under UTC and America/New_York;
5. production Next build;
6. React Doctor changed-scope scan;
7. standalone server route and asset checks;
8. Docker image build, start, route, public asset, and generated static asset checks;
9. browser keyboard, pointer, error, retry, pending, date-selection, and accessibility checks;
10. final diff, commit-scope, and clean-tree checks.

## Acceptance Criteria

- Branch is rebased onto current `origin/master` with no unresolved conflicts.
- TypeScript remains `7.0.2`; tsx is `4.23.11`.
- No secrets or generator-owned local state enter Docker context.
- Valid excessive signup attempts receive a retryable rate-limited result without contacting Listmonk.
- Users can retry after server or transport failure.
- Success, blocked, error, and rate-limit states are programmatically distinguishable and announced.
- Date picker controls have accessible names and keyboard focus behavior.
- Error text meets WCAG AA contrast.
- Listmonk configuration and URL handling fail safely.
- Manifest icons resolve.
- Event guide examples are valid and operationally complete.
- All selected verification gates pass.
- Commits remain scoped and no push occurs.
