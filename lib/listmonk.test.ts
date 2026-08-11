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

  assert.deepEqual(result, { ok: true });
  assert.equal(requestUrl, "https://list.example/api/subscribers");
  assert.deepEqual(requestBody, data);
});

void test("returns a generic failure for non-success and network responses", async () => {
  const { default: listmonk } = await listmonkModule;

  assert.deepEqual(
    await listmonk(data, { env: productionEnv(), fetch: async () => new Response(null, { status: 409 }) }),
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
