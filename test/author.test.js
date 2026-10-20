import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, pickAuthor } from "../src/lib/author.js";

test("a name is tidied of its lead-in and of what follows it", () => {
  assert.equal(cleanName("  Maya   Chen "), "Maya Chen");
  assert.equal(cleanName("— Maya Chen"), "Maya Chen");
  assert.equal(cleanName("- Maya Chen"), "Maya Chen");
  assert.equal(cleanName("by Maya Chen"), "Maya Chen");
  assert.equal(cleanName("Posted by Maya Chen"), "Maya Chen");
  assert.equal(cleanName("Maya Chen, Head of Support at Brightpath"), "Maya Chen");
  assert.equal(cleanName("Maya Chen | Brightpath"), "Maya Chen");
  assert.equal(cleanName("Maya Chen · 2 reviews"), "Maya Chen");
  assert.equal(cleanName("Maya Chen\nHead of Support\n3 days ago"), "Maya Chen");
  assert.equal(cleanName("José Álvarez-O'Neil"), "José Álvarez-O'Neil");
  assert.equal(cleanName("王小明"), "王小明");
});

test("what is not a name is not taken for one", () => {
  for (const text of [
    "",
    null,
    "   ",
    "12 March 2026",
    "2026-03-12",
    "3 days ago",
    "a week ago",
    "Yesterday",
    "mike88",
    "maya@brightpath.app",
    "@mayachen",
    "https://example.com/maya",
    "www.example.com",
    "Verified buyer",
    "Anonymous",
    "Read more",
    "5/5",
    "★★★★★",
    "This is a whole sentence somebody wrote about a product",
    "x".repeat(81)
  ]) {
    assert.equal(cleanName(text), null, String(text));
  }
});

test("the nearest level that names one person gives the name", () => {
  assert.equal(pickAuthor([[], [], ["— Maya Chen, Brightpath"]]), "Maya Chen");
  assert.equal(pickAuthor([[{ text: "Leo Okafor" }]]), "Leo Okafor");
});

test("the same person marked twice at a level is one person", () => {
  assert.equal(pickAuthor([["Maya Chen\nHead of Support", "maya chen", "MAYA CHEN"]]), "Maya Chen");
});

test("two people at the nearest level that names anyone means no guess", () => {
  assert.equal(pickAuthor([[], ["Maya Chen", "Leo Okafor"], ["Priya Nair"]]), "");
});

test("a level whose marks are not names is passed over", () => {
  assert.equal(pickAuthor([["12 March 2026", "Verified buyer"], ["Priya Nair"]]), "Priya Nair");
});

test("a page that names nobody near the selection prefills nothing", () => {
  assert.equal(pickAuthor([]), "");
  assert.equal(pickAuthor(null), "");
  assert.equal(pickAuthor([[], [], []]), "");
  assert.equal(pickAuthor([["3 days ago"]]), "");
});
