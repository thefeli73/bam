import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import { signupFormSubmit } from "./actions";
import { getSignupDateBounds } from "./signup-time-check";

void test("rejects malformed signup submissions", async () => {
  assert.equal(await signupFormSubmit({}), "Invalid form submission");
});

void test("rejects invalid date strings at the server boundary", async () => {
  assert.equal(
    await signupFormSubmit({ name: "Test Person", email: "test@example.com", dob: "2000-02-30" }),
    "Invalid form submission",
  );
});

void test("rejects Date objects at the server boundary", async () => {
  assert.equal(
    await signupFormSubmit({ name: "Test Person", email: "test@example.com", dob: new Date("2000-02-29T00:00:00Z") }),
    "Invalid form submission",
  );
});

void test("sends an accepted date-only date of birth to Listmonk unchanged", async (t) => {
  const dob = getSignupDateBounds(new Date()).youngestDate;
  let payload: { attribs: { dob: string } } | undefined;
  const moduleHooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      return nextResolve(specifier === "server-only" ? "node:module" : specifier, context);
    },
  });
  t.after(() => moduleHooks.deregister());
  t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    if (typeof init?.body !== "string") {
      throw new TypeError("Expected a JSON request body");
    }
    payload = JSON.parse(init.body) as { attribs: { dob: string } };
    return new Response(null, { status: 200 });
  });

  const result = await signupFormSubmit({ name: "Test Person", email: "test@example.com", dob });

  assert.equal(result, "Thanks for signing up! Please check your email for a confirmation.");
  assert.equal(payload?.attribs.dob, dob);
});
