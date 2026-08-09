import assert from "node:assert/strict";
import test from "node:test";

import { signupFormSubmit } from "./actions";

void test("rejects malformed signup submissions", async () => {
  assert.equal(await signupFormSubmit({}), "Invalid form submission");
});
