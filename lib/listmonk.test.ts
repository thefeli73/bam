import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const moduleHooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "server-only" ? "node:module" : specifier, context);
  },
});
process.on("exit", () => moduleHooks.deregister());

const listmonkModule = import("./listmonk");
const data = {
  email: "test@example.com",
  name: "Test Person",
  status: "enabled" as const,
  lists: [3],
  attribs: { dob: "2000-02-29" },
};

type RecordedRequest = {
  url: URL;
  method: string;
  body: unknown;
  authorization: string | null;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function subscriber(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    email: data.email,
    status: "enabled",
    lists: [{ id: 3, subscription_status: "confirmed" }],
    ...overrides,
  };
}

function recordFetch(responses: Array<Response | Error>): {
  fetch: typeof globalThis.fetch;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: new URL(input instanceof Request ? input.url : input.toString()),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      authorization: headers.get("authorization"),
    });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetch, requests };
}

function productionEnv(overrides: Omit<Partial<NodeJS.ProcessEnv>, "NODE_ENV"> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    LISTMONK_URL: "https://list.example/api",
    LISTMONK_USER: "user",
    LISTMONK_PASS: "pass",
    ...overrides,
  };
}

void test("requires complete production configuration at request time", async () => {
  const { getListmonkEndpoint } = await listmonkModule;

  assert.throws(() => getListmonkEndpoint(productionEnv({ LISTMONK_URL: "" })), /LISTMONK_URL/);
  assert.throws(() => getListmonkEndpoint(productionEnv({ LISTMONK_USER: "" })), /LISTMONK_USER/);
  assert.throws(() => getListmonkEndpoint(productionEnv({ LISTMONK_PASS: "" })), /LISTMONK_PASS/);
});

void test("preserves the base path with or without a trailing slash", async () => {
  const { getListmonkEndpoint } = await listmonkModule;

  assert.equal(getListmonkEndpoint(productionEnv()).url.href, "https://list.example/api/subscribers");
  assert.equal(
    getListmonkEndpoint(productionEnv({ LISTMONK_URL: "https://list.example/api/" })).url.href,
    "https://list.example/api/subscribers",
  );
  assert.equal(getListmonkEndpoint({ NODE_ENV: "development" }).url.href, "http://localhost:9000/api/subscribers");
});

void test("rejects malformed and unsupported URLs before fetch", async () => {
  const { default: listmonk, getListmonkEndpoint } = await listmonkModule;
  assert.throws(() => getListmonkEndpoint(productionEnv({ LISTMONK_URL: "not a URL" })), /LISTMONK_URL/);
  assert.throws(() => getListmonkEndpoint(productionEnv({ LISTMONK_URL: "ftp://list.example/api" })), /LISTMONK_URL/);

  let fetchCalls = 0;
  const result = await listmonk(data, {
    env: productionEnv({ LISTMONK_URL: "ftp://list.example/api" }),
    fetch: async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    },
  });
  assert.deepEqual(result, { ok: false });
  assert.equal(fetchCalls, 0);
});

void test("posts the exact payload and reports upstream success", async () => {
  const { default: listmonk } = await listmonkModule;
  let requestUrl: string | undefined;
  let requestBody: unknown;

  const result = await listmonk(data, {
    env: productionEnv(),
    fetch: async (input, init) => {
      requestUrl = input instanceof Request ? input.url : input.toString();
      if (typeof init?.body !== "string") throw new TypeError("Expected a JSON request body");
      requestBody = JSON.parse(init.body);
      return new Response(null, { status: 200 });
    },
  });

  assert.deepEqual(result, { ok: true, ticketEligible: true });
  assert.equal(requestUrl, "https://list.example/api/subscribers");
  assert.deepEqual(requestBody, data);
});

void test("returns confirmed duplicates as success without mutating the subscriber", async () => {
  const { default: listmonk } = await listmonkModule;
  const request = recordFetch([
    new Response(null, { status: 409 }),
    jsonResponse({ data: { results: [subscriber()] } }),
  ]);

  assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
    ok: true,
    ticketEligible: true,
  });
  assert.equal(request.requests.length, 2);
  assert.equal(request.requests[1].method, "GET");
  assert.equal(request.requests[1].url.pathname, "/api/subscribers");
  assert.equal(request.requests[1].url.searchParams.get("search"), "^test@example\\.com$");
  assert.equal(request.requests[1].url.searchParams.get("per_page"), "all");
});

void test("reconfirms an unconfirmed membership with opt-in only", async () => {
  const { default: listmonk } = await listmonkModule;
  const request = recordFetch([
    new Response(null, { status: 409 }),
    jsonResponse({
      data: { results: [subscriber({ lists: [{ id: 3, subscription_status: "unconfirmed" }] })] },
    }),
    new Response(null, { status: 200 }),
  ]);

  assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
    ok: true,
    ticketEligible: true,
  });
  assert.deepEqual(
    request.requests.slice(2).map(({ url, method, body }) => ({ path: url.pathname, method, body })),
    [{ path: "/api/subscribers/42/optin", method: "POST", body: {} }],
  );
  assert.deepEqual(
    request.requests.map(({ authorization }) => authorization),
    Array(request.requests.length).fill("Basic dXNlcjpwYXNz"),
  );
});

void test("reconfirms an unsubscribed membership", async () => {
  const { default: listmonk } = await listmonkModule;
  const request = recordFetch([
    new Response(null, { status: 409 }),
    jsonResponse({
      data: { results: [subscriber({ lists: [{ id: 3, subscription_status: "unsubscribed" }] })] },
    }),
    new Response(null, { status: 200 }),
    new Response(null, { status: 200 }),
  ]);

  assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
    ok: true,
    ticketEligible: true,
  });
  assert.deepEqual(
    request.requests.slice(2).map(({ body }) => body),
    [{ ids: [42], action: "add", target_list_ids: [3], status: "unconfirmed" }, {}],
  );
});

void test("adds an absent membership before requesting opt-in", async () => {
  const { default: listmonk } = await listmonkModule;
  const request = recordFetch([
    new Response(null, { status: 409 }),
    jsonResponse({ data: { results: [subscriber({ lists: [] })] } }),
    new Response(null, { status: 200 }),
    new Response(null, { status: 200 }),
  ]);

  assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
    ok: true,
    ticketEligible: true,
  });
  assert.deepEqual(
    request.requests.slice(2).map(({ url, body }) => ({ path: url.pathname, body })),
    [
      {
        path: "/api/subscribers/lists",
        body: { ids: [42], action: "add", target_list_ids: [3], status: "unconfirmed" },
      },
      { path: "/api/subscribers/42/optin", body: {} },
    ],
  );
});

void test("selects one case-insensitive exact email among other search hits", async () => {
  const { default: listmonk } = await listmonkModule;
  const request = recordFetch([
    new Response(null, { status: 409 }),
    jsonResponse({
      data: {
        results: [subscriber({ id: 1, email: "other-test@example.com" }), subscriber({ email: "TEST@EXAMPLE.COM" })],
      },
    }),
  ]);

  assert.deepEqual(
    await listmonk({ ...data, email: " Test@Example.com " }, { env: productionEnv(), fetch: request.fetch }),
    { ok: true, ticketEligible: true },
  );
  assert.equal(request.requests[1].url.searchParams.get("search"), "^test@example\\.com$");
});

void test("escapes regex metacharacters in the exact email search", async () => {
  const { default: listmonk } = await listmonkModule;
  const email = "person+tag.test@example.com";
  const request = recordFetch([
    new Response(null, { status: 409 }),
    jsonResponse({ data: { results: [subscriber({ email: email.toUpperCase() })] } }),
  ]);

  assert.deepEqual(await listmonk({ ...data, email }, { env: productionEnv(), fetch: request.fetch }), {
    ok: true,
    ticketEligible: true,
  });
  assert.equal(request.requests[1].url.searchParams.get("search"), "^person\\+tag\\.test@example\\.com$");
});

void test("reports disabled and blocklisted duplicates as success", async () => {
  const { default: listmonk } = await listmonkModule;
  for (const status of ["disabled", "blocklisted"]) {
    const request = recordFetch([
      new Response(null, { status: 409 }),
      jsonResponse({ data: { results: [subscriber({ status })] } }),
    ]);
    assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
      ok: true,
      ticketEligible: false,
    });
    assert.equal(request.requests.length, 2);
  }
});

void test("reports malformed, ambiguous, and unknown duplicate state as success", async () => {
  const { default: listmonk } = await listmonkModule;
  const lookups = [
    {},
    { data: { results: [] } },
    { data: { results: [subscriber(), subscriber({ id: 43 })] } },
    { data: { results: [subscriber({ status: "unknown" })] } },
    { data: { results: [subscriber({ lists: [{ id: 3, subscription_status: "unknown" }] })] } },
    { data: { results: [subscriber(), { id: 43, status: "enabled", lists: [] }] } },
    { data: { results: [subscriber({ lists: [null] })] } },
    { data: { results: [subscriber({ lists: [{ id: -1, subscription_status: "confirmed" }] })] } },
    { data: { results: [subscriber({ lists: [{ id: 3 }] })] } },
    { data: { results: [subscriber({ id: 0 })] } },
    {
      data: {
        results: [
          subscriber({
            lists: [
              { id: 3, subscription_status: "confirmed" },
              { id: 3, subscription_status: "unconfirmed" },
            ],
          }),
        ],
      },
    },
  ];

  for (const lookup of lookups) {
    const request = recordFetch([new Response(null, { status: 409 }), jsonResponse(lookup)]);
    assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
      ok: true,
      ticketEligible: false,
    });
    assert.equal(request.requests.length, 2);
  }
});

void test("reports an unknown status on a non-target membership as success", async () => {
  const { default: listmonk } = await listmonkModule;
  const request = recordFetch([
    new Response(null, { status: 409 }),
    jsonResponse({
      data: {
        results: [
          subscriber({
            lists: [
              { id: 3, subscription_status: "confirmed" },
              { id: 4, subscription_status: "unknown" },
            ],
          }),
        ],
      },
    }),
  ]);

  assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
    ok: true,
    ticketEligible: false,
  });
  assert.equal(request.requests.length, 2);
});

void test("returns a generic failure for non-409 and network responses", async () => {
  const { default: listmonk } = await listmonkModule;

  assert.deepEqual(
    await listmonk(data, { env: productionEnv(), fetch: async () => new Response(null, { status: 500 }) }),
    { ok: false },
  );
  assert.deepEqual(
    await listmonk(data, {
      env: productionEnv(),
      fetch: async () => {
        throw new Error("network details");
      },
    }),
    { ok: false },
  );
});

void test("reports duplicate signup success when any recovery request fails", async () => {
  const { default: listmonk } = await listmonkModule;
  const cases = [
    {
      responses: [
        new Response(null, { status: 409 }),
        jsonResponse({
          data: { results: [subscriber({ lists: [{ id: 3, subscription_status: "unsubscribed" }] })] },
        }),
        new Response(null, { status: 500 }),
      ],
      requests: 3,
      bodies: [{ ids: [42], action: "add", target_list_ids: [3], status: "unconfirmed" }],
      ticketEligible: false,
    },
    {
      responses: [
        new Response(null, { status: 409 }),
        jsonResponse({
          data: { results: [subscriber({ lists: [{ id: 3, subscription_status: "unconfirmed" }] })] },
        }),
        new Response(null, { status: 500 }),
      ],
      requests: 3,
      bodies: [{}],
      ticketEligible: true,
    },
    {
      responses: [
        new Response(null, { status: 409 }),
        jsonResponse({ data: { results: [subscriber({ lists: [] })] } }),
        new Response(null, { status: 200 }),
        new Response(null, { status: 500 }),
      ],
      requests: 4,
      bodies: [{ ids: [42], action: "add", target_list_ids: [3], status: "unconfirmed" }, {}],
      ticketEligible: true,
    },
  ];

  for (const failure of cases) {
    const request = recordFetch(failure.responses);
    assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
      ok: true,
      ticketEligible: failure.ticketEligible,
    });
    assert.equal(request.requests.length, failure.requests);
    assert.deepEqual(
      request.requests.slice(2).map(({ body }) => body),
      failure.bodies,
    );
  }
});

void test("aborts requests after the configured timeout", async () => {
  const { default: listmonk } = await listmonkModule;
  let signal: AbortSignal | undefined;

  const result = await listmonk(data, {
    env: productionEnv(),
    timeoutMs: 5,
    fetch: async (_input, init) => {
      signal = init?.signal ?? undefined;
      await new Promise((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(signal?.reason), { once: true }),
      );
      return new Response(null, { status: 200 });
    },
  });

  assert.deepEqual(result, { ok: false });
  assert.equal(signal?.aborted, true);
});

void test("lookup failures hide duplicate state and suppress ticket eligibility", async () => {
  const { default: listmonk } = await listmonkModule;
  for (const response of [new Response(null, { status: 500 }), new Error("network"), new Response("invalid JSON")]) {
    const request = recordFetch([new Response(null, { status: 409 }), response]);
    assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
      ok: true,
      ticketEligible: false,
    });
    assert.equal(request.requests.length, 2);
  }
});

void test("thrown opt-in failure does not suppress known eligible memberships", async () => {
  const { default: listmonk } = await listmonkModule;
  for (const lists of [[], [{ id: 3, subscription_status: "unconfirmed" }]]) {
    const request = recordFetch([
      new Response(null, { status: 409 }),
      jsonResponse({ data: { results: [subscriber({ lists })] } }),
      ...(lists.length === 0 ? [new Response(null, { status: 200 })] : []),
      new Error("opt-in network failure"),
    ]);
    assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
      ok: true,
      ticketEligible: true,
    });
    assert.equal(request.requests.at(-1)?.url.pathname, "/api/subscribers/42/optin");
  }
});

void test("thrown membership add failure suppresses eligibility without sending opt-in", async () => {
  const { default: listmonk } = await listmonkModule;
  const request = recordFetch([
    new Response(null, { status: 409 }),
    jsonResponse({ data: { results: [subscriber({ lists: [] })] } }),
    new Error("membership network failure"),
  ]);
  assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
    ok: true,
    ticketEligible: false,
  });
  assert.equal(request.requests.length, 3);
});

void test("every accepted repeat remains ticket eligible", async () => {
  const { default: listmonk } = await listmonkModule;
  const request = recordFetch([
    new Response(null, { status: 409 }),
    jsonResponse({ data: { results: [subscriber()] } }),
    new Response(null, { status: 409 }),
    jsonResponse({ data: { results: [subscriber()] } }),
  ]);
  for (let repeat = 0; repeat < 2; repeat += 1) {
    assert.deepEqual(await listmonk(data, { env: productionEnv(), fetch: request.fetch }), {
      ok: true,
      ticketEligible: true,
    });
  }
});

void test("queues ticket email for an existing subscriber using the configured template and base path", async () => {
  const { sendTicketEmail } = await listmonkModule;
  const request = recordFetch([jsonResponse({ data: true })]);
  assert.deepEqual(
    await sendTicketEmail(data.email, "https://bam.example/ticket", {
      env: productionEnv({ LISTMONK_URL: "https://list.example/nested/api/", LISTMONK_TICKET_TEMPLATE_ID: "12" }),
      fetch: request.fetch,
    }),
    { ok: true },
  );
  assert.equal(request.requests.length, 1);
  assert.equal(request.requests[0].url.href, "https://list.example/nested/api/tx");
  assert.equal(request.requests[0].method, "POST");
  assert.equal(request.requests[0].authorization, "Basic dXNlcjpwYXNz");
  assert.deepEqual(request.requests[0].body, {
    template_id: 12,
    content_type: "html",
    subscriber_emails: ["test@example.com"],
    data: { ticket_url: "https://bam.example/ticket" },
  });
});

void test("invalid ticket configuration prevents network requests", async () => {
  const { sendTicketEmail } = await listmonkModule;
  const invalidEnvs = [
    ...[undefined, "", "0", "-1", "1.5", "NaN", "Infinity", "9007199254740992", "abc"].map((id) =>
      productionEnv({ LISTMONK_TICKET_TEMPLATE_ID: id }),
    ),
    ...[
      { LISTMONK_URL: "" },
      { LISTMONK_URL: "ftp://list.example/api" },
      { LISTMONK_USER: "" },
      { LISTMONK_PASS: "" },
    ].map((overrides) => productionEnv({ LISTMONK_TICKET_TEMPLATE_ID: "12", ...overrides })),
  ];
  for (const env of invalidEnvs) {
    const request = recordFetch([]);
    assert.deepEqual(await sendTicketEmail(data.email, "https://bam.example/ticket", { env, fetch: request.fetch }), {
      ok: false,
    });
    assert.equal(request.requests.length, 0);
  }
});

void test("ticket email fails unless the API acknowledges queue acceptance", async () => {
  const { sendTicketEmail } = await listmonkModule;
  for (const response of [
    jsonResponse({ data: true }, 500),
    new Error("network"),
    new Response("invalid JSON"),
    new Response(null, { status: 204 }),
    ...[{}, null, { data: false }, { data: "true" }, { data: {} }].map((body) => jsonResponse(body)),
  ]) {
    const request = recordFetch([response]);
    assert.deepEqual(
      await sendTicketEmail(data.email, "https://bam.example/ticket", {
        env: productionEnv({ LISTMONK_TICKET_TEMPLATE_ID: "12" }),
        fetch: request.fetch,
      }),
      { ok: false },
    );
  }
});

void test("ticket email waits for the bounded request and reports timeout failure", async () => {
  const { sendTicketEmail } = await listmonkModule;
  let signal: AbortSignal | undefined;
  const result = await sendTicketEmail(data.email, "https://bam.example/ticket", {
    env: productionEnv({ LISTMONK_TICKET_TEMPLATE_ID: "12" }),
    timeoutMs: 5,
    fetch: async (_input, init) => {
      signal = init?.signal ?? undefined;
      await new Promise((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(signal?.reason), { once: true }),
      );
      return jsonResponse({ data: true });
    },
  });
  assert.deepEqual(result, { ok: false });
  assert.equal(signal?.aborted, true);
});
