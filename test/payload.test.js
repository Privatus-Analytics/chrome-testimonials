import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS,
  buildPayload,
  checkForm,
  cleanRating,
  cleanUrl,
  cleanWords,
  sourceFor,
  testimonialUrl
} from "../src/lib/payload.js";

const form = {
  words: "  The tent survived a week of rain in Skye.\r\n\r\n\r\n\r\nWe would buy it again.  ",
  personName: "  Leo   Okafor ",
  personTitle: "Guide",
  personCompany: "Skye Trails",
  rating: "5",
  sourceName: "Trustpilot",
  sourceUrl: "https://www.trustpilot.com/reviews/65f0c1?utm_source=mail#top",
  siteId: "pa_IAEBWP2D0V"
};

test("the payload is the create operation's fields, marked as captured from a page", () => {
  assert.deepEqual(buildPayload(form), {
    body: "The tent survived a week of rain in Skye.\n\nWe would buy it again.",
    person_name: "Leo Okafor",
    via: "extension",
    person_title: "Guide",
    person_company: "Skye Trails",
    source_name: "Trustpilot",
    source_url: "https://www.trustpilot.com/reviews/65f0c1",
    rating: 5
  });
});

test("it never sends a status, a site, an email or anything it was not given", () => {
  const payload = buildPayload({ words: "Good.", personName: "Leo", siteId: "pa_X" });
  assert.deepEqual(payload, { body: "Good.", person_name: "Leo", via: "extension" });
});

test("saving anyway after a duplicate says so", () => {
  assert.equal(buildPayload(form, { allowDuplicate: true }).allow_duplicate, true);
  assert.equal("allow_duplicate" in buildPayload(form), false);
});

test("the rating is 1 to 5 or nothing", () => {
  assert.equal(cleanRating("3"), 3);
  assert.equal(cleanRating(5), 5);
  for (const value of [0, 6, "", null, undefined, "five", -1]) assert.equal(cleanRating(value), null);
});

test("the words keep their paragraphs", () => {
  assert.equal(cleanWords("One.  \n\n\n\nTwo.\n"), "One.\n\nTwo.");
  assert.equal(cleanWords(null), "");
});

test("the source link drops the fragment, tracking and any login in it", () => {
  assert.equal(
    cleanUrl("https://user:pw@example.com/a?id=7&utm_campaign=x&fbclid=abc&gclid=1#reviews"),
    "https://example.com/a?id=7"
  );
  assert.equal(cleanUrl("http://example.com/plain"), "http://example.com/plain");
});

test("a page that is not on the web has no source link", () => {
  for (const url of ["chrome://newtab/", "file:///Users/x/a.html", "about:blank", "", null, "javascript:alert(1)"]) {
    assert.equal(cleanUrl(url), null, String(url));
  }
  assert.equal(cleanUrl(`https://example.com/${"a".repeat(LIMITS.sourceUrl)}`), null);
});

test("the source is the platform's name on a known host", () => {
  assert.deepEqual(sourceFor({ url: "https://www.g2.com/products/x/reviews#r1", title: "Reviews 2026 | G2" }), {
    name: "G2",
    url: "https://www.g2.com/products/x/reviews",
    platform: "g2"
  });
});

test("the source is the page's title anywhere else, cut to what the app stores", () => {
  const plain = sourceFor({ url: "https://blog.example.com/post", title: "  Why we\n switched  " });
  assert.deepEqual(plain, { name: "Why we switched", url: "https://blog.example.com/post", platform: null });

  const long = sourceFor({ url: "https://example.com/", title: "x".repeat(300) });
  assert.equal(long.name.length, LIMITS.sourceName);
});

test("a page with no title is named by its host, and a browser page by nothing", () => {
  assert.equal(sourceFor({ url: "https://www.example.com/a", title: "" }).name, "example.com");
  assert.deepEqual(sourceFor({ url: "chrome://extensions", title: "Extensions" }), {
    name: "Extensions",
    url: null,
    platform: null
  });
  assert.deepEqual(sourceFor(), { name: "", url: null, platform: null });
});

test("the form names what is missing before anything is sent", () => {
  assert.deepEqual(checkForm(form), {});
  assert.deepEqual(checkForm({}), {
    words: "error_words_needed",
    personName: "error_name_needed",
    siteId: "error_site_needed"
  });
  assert.equal(checkForm({ ...form, words: "x".repeat(LIMITS.body + 1) }).words, "error_words_too_long");
  assert.equal(checkForm({ ...form, personName: "x".repeat(121) }).personName, "error_too_long");
  assert.equal(checkForm({ ...form, personCompany: "x".repeat(121) }).personCompany, "error_too_long");
  assert.equal(checkForm({ ...form, sourceName: "x".repeat(121) }).sourceName, "error_too_long");
});

test("the link to a saved testimonial is its page in the app", () => {
  assert.equal(
    testimonialUrl("https://privatusanalytics.com", "pa_IAEBWP2D0V", "tm_TYO573UOXR"),
    "https://privatusanalytics.com/sites/pa_IAEBWP2D0V/testimonials/tm_TYO573UOXR"
  );
});
