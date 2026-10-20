import { test } from "node:test";
import assert from "node:assert/strict";
import { connect, createClient } from "../src/lib/api.js";
import { ApiError } from "../src/lib/errors.js";

// A stand-in for fetch: answers from a table of "METHOD /path" and keeps
// what was asked.
function fakeFetch(routes) {
  const calls = [];
  const fetcher = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url, parsed, options });
    const answer = routes[`${options.method} ${parsed.pathname}`];
    if (!answer) return respond(404, { error: { code: "not_found", message: "We couldn't find that." } });
    if (answer instanceof Error) throw answer;
    return typeof answer === "function" ? answer(parsed, options) : answer;
  };
  fetcher.calls = calls;
  return fetcher;
}

function respond(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (typeof body === "string") throw new SyntaxError("not JSON");
      return body;
    }
  };
}

const ORIGIN = "https://privatusanalytics.com";
const account = respond(200, { data: { email: "priya.nair@fernhill-outdoor.com", name: "Priya Nair" } });
const workspaces = respond(200, { data: [{ id: "ws_S752CSTLWF", name: "Fernhill Outdoor Co.", plan: "business" }] });
const sites = respond(200, {
  data: [
    { id: "pa_6K8OGUO9KH", name: "Fernhill Outdoor UK" },
    { id: "pa_IAEBWP2D0V", name: "Fernhill Outdoor" }
  ],
  meta: { page: 1, per_page: 100, total: 2, total_pages: 1 }
});
const missing = respond(422, { error: { code: "validation_failed", message: "x", details: { person_name: ["x"] } } });
const refused = (permission) =>
  respond(403, { error: { code: "forbidden", message: `You need the ${permission} permission for this.` } });

test("every request goes to the one address with the token, and nothing else of the browser's", async () => {
  const fetcher = fakeFetch({ "GET /account.json": account });
  await createClient({ origin: ORIGIN, token: "pat_abc", fetch: fetcher }).account();
  const [{ url, options }] = fetcher.calls;
  assert.equal(url, "https://privatusanalytics.com/account.json");
  assert.equal(options.headers.Authorization, "Bearer pat_abc");
  assert.equal(options.headers.Accept, "application/json");
  assert.equal(options.credentials, "omit");
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.equal(options.referrerPolicy, "no-referrer");
  assert.equal(options.body, undefined);
});

test("connecting says whose token it is, which sites it sees and that it may add", async () => {
  const fetcher = fakeFetch({
    "GET /account.json": account,
    "GET /workspaces.json": workspaces,
    "GET /workspaces/ws_S752CSTLWF/sites.json": sites,
    "POST /sites/pa_IAEBWP2D0V/testimonials.json": missing
  });
  const found = await connect(createClient({ origin: ORIGIN, token: "pat_abc", fetch: fetcher }));
  assert.deepEqual(found.account, { email: "priya.nair@fernhill-outdoor.com", name: "Priya Nair" });
  assert.deepEqual(found.workspace, { id: "ws_S752CSTLWF", name: "Fernhill Outdoor Co.", plan: "business" });
  assert.deepEqual(found.sites.map((site) => site.name), ["Fernhill Outdoor", "Fernhill Outdoor UK"]);
  assert.equal(found.canRead, true);
  assert.equal(found.canWrite, true);

  const probe = fetcher.calls.at(-1);
  assert.equal(probe.options.method, "POST");
  assert.equal(probe.options.body, "{}");
});

test("a token that may only read is connected, and known not to add", async () => {
  const fetcher = fakeFetch({
    "GET /account.json": account,
    "GET /workspaces.json": workspaces,
    "GET /workspaces/ws_S752CSTLWF/sites.json": sites,
    "POST /sites/pa_IAEBWP2D0V/testimonials.json": refused("content.write")
  });
  const found = await connect(createClient({ origin: ORIGIN, token: "pat_abc", fetch: fetcher }));
  assert.equal(found.canRead, true);
  assert.equal(found.canWrite, false);
});

test("a token that may not read sees no sites, and writing is not checked", async () => {
  const fetcher = fakeFetch({
    "GET /account.json": account,
    "GET /workspaces.json": workspaces,
    "GET /workspaces/ws_S752CSTLWF/sites.json": refused("analytics.read")
  });
  const found = await connect(createClient({ origin: ORIGIN, token: "pat_abc", fetch: fetcher }));
  assert.equal(found.canRead, false);
  assert.equal(found.canWrite, null);
  assert.deepEqual(found.sites, []);
  assert.equal(fetcher.calls.some((call) => call.options.method === "POST"), false);
});

test("a wrong token fails the connection with the app's code", async () => {
  const fetcher = fakeFetch({
    "GET /account.json": respond(401, { error: { code: "unauthorized", message: "That API token is invalid, revoked or expired." } })
  });
  await assert.rejects(
    connect(createClient({ origin: ORIGIN, token: "pat_nope", fetch: fetcher })),
    (error) => error instanceof ApiError && error.status === 401 && error.code === "unauthorized"
  );
});

test("no connection, a timeout and a refused redirect are all a network failure", async () => {
  const fetcher = fakeFetch({ "GET /account.json": new TypeError("Failed to fetch") });
  await assert.rejects(
    createClient({ origin: ORIGIN, token: "pat_abc", fetch: fetcher }).account(),
    (error) => error instanceof ApiError && error.network === true
  );
});

test("an answer that is not the app's JSON keeps its status and has no code", async () => {
  const fetcher = fakeFetch({ "GET /account.json": respond(502, "<html>Bad gateway</html>") });
  await assert.rejects(
    createClient({ origin: ORIGIN, token: "pat_abc", fetch: fetcher }).account(),
    (error) => error.status === 502 && error.code === null && error.network === false
  );
});

test("the sites are read page by page until the last", async () => {
  const page = (number) =>
    respond(200, {
      data: [{ id: `pa_${number}`, name: `Site ${number}` }],
      meta: { page: number, per_page: 100, total: 3, total_pages: 3 }
    });
  const fetcher = fakeFetch({
    "GET /workspaces/ws_1/sites.json": (url) => page(Number(url.searchParams.get("page")))
  });
  const list = await createClient({ origin: ORIGIN, token: "pat_abc", fetch: fetcher }).sites("ws_1");
  assert.deepEqual(list.map((site) => site.id), ["pa_1", "pa_2", "pa_3"]);
  assert.equal(fetcher.calls.length, 3);
  assert.equal(fetcher.calls[0].parsed.searchParams.get("per_page"), "100");
});

test("saving posts the payload to the site and returns the testimonial", async () => {
  const fetcher = fakeFetch({
    "POST /sites/pa_IAEBWP2D0V/testimonials.json": respond(201, {
      data: { id: "tm_TYO573UOXR", status: "pending", source: "extension" }
    })
  });
  const client = createClient({ origin: "http://localhost:3029", token: "pat_abc", fetch: fetcher });
  const saved = await client.createTestimonial("pa_IAEBWP2D0V", { body: "Good.", person_name: "Leo", via: "extension" });
  assert.equal(saved.id, "tm_TYO573UOXR");
  const [{ url, options }] = fetcher.calls;
  assert.equal(url, "http://localhost:3029/sites/pa_IAEBWP2D0V/testimonials.json");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(options.body), { body: "Good.", person_name: "Leo", via: "extension" });
});

test("a refused save carries the app's code and field details", async () => {
  const fetcher = fakeFetch({
    "POST /sites/pa_X/testimonials.json": respond(422, {
      error: { code: "allowance_reached", message: "This month's allowance is used.", details: { base: ["x"] } }
    })
  });
  await assert.rejects(
    createClient({ origin: ORIGIN, token: "pat_abc", fetch: fetcher }).createTestimonial("pa_X", {}),
    (error) => error.status === 422 && error.code === "allowance_reached" && error.details.base[0] === "x"
  );
});
