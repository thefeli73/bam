import assert from "node:assert/strict";
import test from "node:test";

import { signupFormSubmit } from "./actions";

const invalidResult = { status: "error", message: "Invalid form submission." };

void test("rejects malformed signup submissions", async () => {
  assert.deepEqual(await signupFormSubmit({}), invalidResult);
});

void test("rejects invalid date strings at the server boundary", async () => {
  assert.deepEqual(
    await signupFormSubmit({ name: "Test Person", email: "test@example.com", dob: "2000-02-30" }),
    invalidResult,
  );
});

void test("rejects Date objects at the server boundary", async () => {
  assert.deepEqual(
    await signupFormSubmit({ name: "Test Person", email: "test@example.com", dob: new Date("2000-02-29T00:00:00Z") }),
    invalidResult,
  );
});
