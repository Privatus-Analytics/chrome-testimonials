import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATFORMS, platformForUrl } from "../src/lib/platforms.js";

test("a platform's own host and its subdomains are that platform", () => {
  assert.deepEqual(platformForUrl("https://www.trustpilot.com/review/fernhill-outdoor.com"), {
    key: "trustpilot",
    name: "Trustpilot"
  });
  assert.equal(platformForUrl("https://uk.trustpilot.com/review/x").name, "Trustpilot");
  assert.equal(platformForUrl("https://www.g2.com/products/brightpath/reviews").name, "G2");
  assert.equal(platformForUrl("https://senja.io/p/brightpath/r/abc").name, "Senja");
  assert.equal(platformForUrl("https://testimonial.to/brightpath/all").name, "Testimonial.to");
});

test("each review site and app store is known by its own host", () => {
  const cases = {
    "https://www.capterra.com/p/1/Brightpath/reviews/": "capterra",
    "https://www.capterra.co.uk/reviews/1/brightpath": "capterra",
    "https://www.producthunt.com/products/brightpath/reviews": "product_hunt",
    "https://x.com/someone/status/1": "x",
    "https://twitter.com/someone/status/1": "x",
    "https://appsumo.com/products/brightpath/": "app_sumo",
    "https://www.tripadvisor.com/Attraction_Review-g1-d2-Reviews-Fernhill.html": "tripadvisor",
    "https://www.tripadvisor.co.uk/Attraction_Review-g1-d2": "tripadvisor",
    "https://www.tripadvisor.de/Attraction_Review-g1-d2": "tripadvisor",
    "https://chromewebstore.google.com/detail/x/abc/reviews": "chrome_web_store",
    "https://apps.shopify.com/brightpath/reviews": "shopify_app_store",
    "https://wordpress.org/support/plugin/brightpath/reviews/": "wordpress",
    "https://apps.apple.com/us/app/brightpath/id1": "apple_app_store",
    "https://play.google.com/store/apps/details?id=app.brightpath": "google_play"
  };
  for (const [url, key] of Object.entries(cases)) {
    assert.equal(platformForUrl(url)?.key, key, url);
  }
});

test("a search engine or a maps page is not a platform the app imports from", () => {
  for (const url of [
    "https://www.google.com/maps/place/Fernhill",
    "https://google.com/search?q=fernhill+reviews",
    "https://www.google.co.uk/maps",
    "https://g.page/r/abc/review",
    "https://www.yelp.com/biz/fernhill",
    "https://www.facebook.com/fernhill/reviews",
    "https://www.linkedin.com/in/someone"
  ]) {
    assert.equal(platformForUrl(url), null, url);
  }
});

test("a host that only looks like one is not a platform", () => {
  for (const url of [
    "https://nottrustpilot.com/review/x",
    "https://trustpilot.com.example.org/review/x",
    "https://docs.google.com/document/d/1",
    "https://mail.google.com/mail/u/0",
    "https://google.example.com/",
    "https://shopify.com/pricing",
    "https://www.apple.com/",
    "https://tripadvisor.com.example.org/x",
    "https://fernhill-outdoor.com/reviews?from=trustpilot.com",
    "https://example.com/g2.com"
  ]) {
    assert.equal(platformForUrl(url), null, url);
  }
});

test("anything that is not a web page has no platform", () => {
  for (const url of ["", null, undefined, "chrome://extensions", "file:///tmp/a.html", "not a url", "ftp://g2.com/x"]) {
    assert.equal(platformForUrl(url), null, String(url));
  }
});

test("every platform in the data has a key, a name and a way to match", () => {
  assert.ok(PLATFORMS.length > 0);
  const keys = new Set();
  for (const platform of PLATFORMS) {
    assert.match(platform.key, /^[a-z0-9_]+$/);
    assert.ok(platform.name.trim().length > 0, platform.key);
    assert.ok(!keys.has(platform.key), `${platform.key} is listed twice`);
    keys.add(platform.key);
    const hosts = platform.hosts || [];
    assert.ok(hosts.length > 0 || platform.host_pattern, `${platform.key} matches nothing`);
    for (const host of hosts) assert.match(host, /^[a-z0-9.-]+\.[a-z]{2,}$/, `${platform.key}: ${host}`);
    if (platform.host_pattern) {
      assert.ok(platform.host_pattern.startsWith("^") && platform.host_pattern.endsWith("$"), platform.key);
      assert.doesNotThrow(() => new RegExp(platform.host_pattern));
    }
  }
});
