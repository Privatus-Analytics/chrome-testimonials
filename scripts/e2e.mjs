// End to end, without a browser: the extension's own request code
// (lib/api.js, lib/payload.js) against a running Privatus Analytics.
//
//   PA_ORIGIN=http://localhost:3008 PA_TOKEN=<an API token> node scripts/e2e.mjs
//
// The token needs analytics.read and content.write (bin/auth prints one in
// development). It saves one testimonial to the first site the token
// sees (or PA_SITE), reads it back, checks it is pending with the page
// as its source, and moves it to the trash again (KEEP=1 leaves it).
import assert from "node:assert/strict";
import { connect, createClient } from "../src/lib/api.js";
import { buildPayload, sourceFor, testimonialUrl } from "../src/lib/payload.js";

const origin = (process.env.PA_ORIGIN || "").replace(/\/+$/, "");
const token = process.env.PA_TOKEN || "";
if (!origin || !token) {
  console.error("Set PA_ORIGIN and PA_TOKEN. See the top of this file.");
  process.exit(2);
}

const client = createClient({ origin, token });
const found = await connect(client);
console.log(`account    ${found.account.name} <${found.account.email}>`);
console.log(`workspace  ${found.workspace.name} (${found.workspace.plan})`);
console.log(`sites     ${found.sites.map((site) => site.name).join(", ")}`);
console.log(`can add    ${found.canWrite}`);
assert.equal(found.canRead, true, "the token cannot list sites (analytics.read)");
assert.equal(found.canWrite, true, "the token cannot add testimonials (content.write)");

const site = found.sites.find((entry) => entry.id === process.env.PA_SITE) || found.sites[0];
const page = {
  url: "https://www.trustpilot.com/reviews/65f0c1a2?utm_source=share#review",
  title: "Leo Okafor gave Fernhill Outdoor 5 stars. Check out the full review"
};
const source = sourceFor(page);
const payload = buildPayload({
  words: `The tent survived a week of rain in Skye. (End to end run ${new Date().toISOString()})`,
  personName: "Leo Okafor",
  personTitle: "Mountain guide",
  personCompany: "Skye Trails",
  rating: 5,
  sourceName: source.name,
  sourceUrl: source.url,
  siteId: site.id
});
const saved = await client.createTestimonial(site.id, payload);
const link = testimonialUrl(origin, site.id, saved.id);
console.log(`saved      ${saved.id} to ${site.name}`);
console.log(`link       ${link}`);

const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
const { data } = await (await fetch(`${link}.json`, { headers })).json();
assert.equal(data.status, "pending");
assert.equal(data.source, "extension");
assert.equal(data.source_name, "Trustpilot");
assert.equal(data.source_url, "https://www.trustpilot.com/reviews/65f0c1a2");
assert.equal(data.body, payload.body);
assert.equal(data.rating, 5);
assert.equal(data.person.name, "Leo Okafor");
assert.equal(data.person.company, "Skye Trails");
assert.equal(data.verified, false);
assert.equal(data.waiting_for_allowance, false);
console.log(`stored as  ${data.status}, source ${data.source}, from ${data.source_name} (${data.source_url})`);

if (!process.env.KEEP) {
  const removed = await fetch(`${link}.json`, { method: "DELETE", headers });
  assert.equal(removed.ok, true);
  console.log("moved to the trash again");
}
console.log("ok");
