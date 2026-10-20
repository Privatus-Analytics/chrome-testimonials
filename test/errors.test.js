import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, explain } from "../src/lib/errors.js";

const api = (status, code, message = "", details = null) => new ApiError({ status, code, message, details });

test("no connection is said as that, with a retry", () => {
  const told = explain(new ApiError({ network: true }));
  assert.equal(told.key, "error_offline");
  assert.equal(told.action, "retry");
});

test("a token the app does not accept sends the person to the settings", () => {
  const told = explain(api(401, "unauthorized", "That API token is invalid, revoked or expired."));
  assert.equal(told.key, "error_token_rejected");
  assert.equal(told.action, "options");
});

test("a token without write permission is told so, with the app's own reason", () => {
  const told = explain(api(403, "forbidden", "You need the content.write permission for this."), "save");
  assert.equal(told.key, "error_no_write");
  assert.deepEqual(told.notes, ["You need the content.write permission for this."]);
  assert.equal(told.action, "options");
});

test("a token without read permission cannot list the sites", () => {
  assert.equal(explain(api(403, "forbidden", "You need the analytics.read permission for this."), "sites").key, "error_no_read");
  assert.equal(explain(api(403, "forbidden"), "connect").key, "error_no_read");
});

test("a 403 that is not the app's answer is not blamed on the token", () => {
  const told = explain(api(403, null), "save");
  assert.equal(told.key, "error_server");
  assert.deepEqual(told.values, ["403"]);
});

test("the allowance is its own sentence, and nothing offers to retry it", () => {
  const told = explain(api(422, "allowance_reached", "This month's allowance of new testimonials is used"));
  assert.equal(told.key, "error_allowance");
  assert.equal(told.action, null);
});

test("a duplicate offers to save anyway", () => {
  const told = explain(api(422, "duplicate", "This person already said these words here (tm_X)."));
  assert.equal(told.key, "error_duplicate");
  assert.equal(told.action, "duplicate");
});

test("a 422 puts the app's messages under the fields they are about", () => {
  const told = explain(
    api(422, "validation_failed", "x", {
      person_name: ["Give the name of the person who said it, or the id of a person already in the site."],
      body: ["can't be blank"],
      rating: ["must be in 1..5"],
      source_url: ["is not a web address"],
      via: ["via is api or extension. Leave it out for api."]
    })
  );
  assert.equal(told.key, "error_invalid");
  assert.deepEqual(Object.keys(told.fields).sort(), ["personName", "rating", "sourceUrl", "words"]);
  assert.deepEqual(told.fields.words, ["can't be blank"]);
  assert.deepEqual(told.notes, ["via is api or extension. Leave it out for api."]);
});

test("a 422 with no field details shows the app's sentence", () => {
  const told = explain(api(422, "validation_failed", "That does not fit."));
  assert.deepEqual(told.notes, ["That does not fit."]);
  assert.deepEqual(told.fields, {});
});

test("a site that is gone, a rate limit and a server fault each have a sentence", () => {
  assert.equal(explain(api(404, "not_found"), "save").key, "error_site_gone");
  assert.equal(explain(api(404, "not_found"), "connect").key, "error_not_found");
  assert.equal(explain(api(429, "rate_limited")).key, "error_rate_limited");
  const fault = explain(api(502));
  assert.equal(fault.key, "error_server");
  assert.deepEqual(fault.values, ["502"]);
});

test("a plan limit and a locked workspace show the app's sentence", () => {
  assert.deepEqual(explain(api(402, "plan_limit", "Your plan allows 3 members.")).notes, ["Your plan allows 3 members."]);
  assert.equal(explain(api(423, "locked", "This workspace is locked.")).key, "error_locked");
});

test("anything that is not a request failure is an unexpected error", () => {
  assert.equal(explain(new TypeError("x")).key, "error_unexpected");
});
