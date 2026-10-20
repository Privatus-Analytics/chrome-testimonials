import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (path) => readFileSync(join(root, path), "utf8");
const messages = JSON.parse(read("_locales/en/messages.json"));
const sources = [
  "manifest.json",
  "background.js",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  ...readdirSync(join(root, "lib")).map((name) => `lib/${name}`)
];
const code = Object.fromEntries(sources.map((path) => [path, read(path)]));

// Every way a source names a message.
function referenced() {
  const keys = new Set();
  for (const text of Object.values(code)) {
    for (const [, key] of text.matchAll(/data-(?:i18n(?:-[a-z-]+)?|title)="([a-z0-9_]+)"/g)) keys.add(key);
    for (const [, key] of text.matchAll(/__MSG_([a-z0-9_]+)__/g)) keys.add(key);
    for (const [, key] of text.matchAll(/(?:\bt|getMessage)\(\s*"([a-z0-9_]+)"/g)) keys.add(key);
    for (const [, key] of text.matchAll(/"((?:error|blocked|saving|sites)_[a-z0-9_]+)"/g)) keys.add(key);
    for (const [, key] of text.matchAll(/\? "([a-z0-9_]+)" : "([a-z0-9_]+)"/g)) keys.add(key);
  }
  return keys;
}

test("every message a page or a script names exists", () => {
  for (const key of referenced()) assert.ok(messages[key], `${key} is not in messages.json`);
});

test("every message is used somewhere", () => {
  const all = Object.values(code).join("\n");
  for (const key of Object.keys(messages)) {
    assert.ok(all.includes(`"${key}"`) || all.includes(`__MSG_${key}__`), `${key} is not used`);
  }
});

test("the Chrome Web Store's limits on the name and the summary are kept", () => {
  assert.ok(messages.extension_name.message.length <= 75);
  assert.ok(messages.extension_description.message.length <= 132);
  assert.ok(messages.extension_short_name.message.length <= 45);
});

test("the copy follows the house rules", () => {
  for (const [key, { message }] of Object.entries(messages)) {
    assert.ok(message.trim().length > 0, key);
    assert.doesNotMatch(message, /[—–;]/, `${key}: no dashes or semicolons in copy`);
    assert.doesNotMatch(message, /\bPrivatus(?! Analytics\b)/, `${key}: the product is always named in full`);
    assert.doesNotMatch(message, /\bSpaces?\b|\blove\b|kind words/i, `${key}: a testimonial belongs to a site, and the copy is plain`);
    assert.doesNotMatch(message, /\$[A-Za-z]/, `${key}: placeholders are $1 to $9`);
  }
});

test("a message takes as many values as the code gives it", () => {
  const given = { words_count: 2, saved_title: 1, error_server: 1, error_words_too_long: 1, error_too_long: 1,
                  sites_one: 1, sites_many: 1, version: 1 };
  for (const [key, { message }] of Object.entries(messages)) {
    const used = new Set([...message.matchAll(/\$(\d)/g)].map(([, n]) => Number(n)));
    assert.equal(used.size, given[key] || 0, key);
  }
});
