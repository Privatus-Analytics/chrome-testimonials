import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ORIGIN, parseOrigin } from "../src/lib/origin.js";

test("nothing typed is the published address, which the manifest already allows", () => {
  for (const input of ["", "   ", null, undefined, "https://privatusanalytics.com", "https://privatusanalytics.com/sites", "privatusanalytics.com"]) {
    assert.deepEqual(parseOrigin(input), {
      origin: DEFAULT_ORIGIN,
      pattern: "https://privatusanalytics.com/*",
      builtin: true
    });
  }
});

test("a local address keeps its port and asks for the host", () => {
  assert.deepEqual(parseOrigin("http://localhost:3029/"), {
    origin: "http://localhost:3029",
    pattern: "http://localhost/*",
    builtin: false
  });
  assert.deepEqual(parseOrigin(" http://127.0.0.1:3008/workspaces "), {
    origin: "http://127.0.0.1:3008",
    pattern: "http://127.0.0.1/*",
    builtin: false
  });
});

test("no other address is accepted", () => {
  for (const input of [
    "https://example.com",
    "http://privatusanalytics.com",
    "https://privatusanalytics.com.example.org",
    "https://app.privatusanalytics.com",
    "https://localhost:3029",
    "http://localhost.example.com:3000",
    "http://192.168.1.10:3000",
    "ftp://localhost"
  ]) {
    assert.deepEqual(parseOrigin(input), { error: "error_address_not_allowed" }, input);
  }
  assert.deepEqual(parseOrigin("http://"), { error: "error_address_invalid" });
});
