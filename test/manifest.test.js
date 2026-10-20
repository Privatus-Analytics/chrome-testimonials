import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (path) => readFileSync(join(root, path), "utf8");
const manifest = JSON.parse(read("manifest.json"));

test("it asks for the four permissions it uses and no more", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "contextMenus", "scripting", "storage"]);
});

test("the only host it may always reach is Privatus Analytics", () => {
  assert.deepEqual(manifest.host_permissions, ["https://privatusanalytics.com/*"]);
  assert.deepEqual(manifest.optional_host_permissions, ["http://localhost/*", "http://127.0.0.1/*"]);
  const text = JSON.stringify(manifest);
  assert.doesNotMatch(text, /<all_urls>|\*:\/\/\*|https?:\/\/\*\//);
});

test("no script runs on a page by itself, and no page of the web can reach the extension", () => {
  for (const key of ["content_scripts", "externally_connectable", "web_accessible_resources", "optional_permissions"]) {
    assert.equal(manifest[key], undefined, key);
  }
});

test("its own pages can load and call nothing but themselves and Privatus Analytics", () => {
  const policy = manifest.content_security_policy.extension_pages;
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'self'(;|$)/);
  assert.match(policy, /connect-src https:\/\/privatusanalytics\.com http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*(;|$)/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\bdata:|\bblob:|https:\/\/\*/);
});

test("every file the manifest names is there", () => {
  const named = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    `_locales/${manifest.default_locale}/messages.json`
  ];
  for (const path of named) assert.ok(existsSync(join(root, path)), path);
});

// What ships: every script and page, read as text.
const shipped = [
  "background.js",
  "popup.js",
  "popup.html",
  "options.js",
  "options.html",
  "ui.css",
  "popup.css",
  "options.css",
  ...readdirSync(join(root, "lib")).map((name) => `lib/${name}`)
];

test("nothing is loaded from anywhere else: no remote script, style, font or image", () => {
  for (const path of shipped) {
    const text = read(path);
    assert.doesNotMatch(text, /<script[^>]+src="(?:https?:)?\/\//, path);
    assert.doesNotMatch(text, /<link[^>]+href="(?:https?:)?\/\//, path);
    assert.doesNotMatch(text, /url\(\s*["']?(?:https?:)?\/\//, path);
    assert.doesNotMatch(text, /@import/, path);
    assert.doesNotMatch(text, /\beval\(|new Function\(|importScripts\(/, path);
  }
});

test("pages carry no inline script and no inline handler", () => {
  for (const path of ["popup.html", "options.html"]) {
    const text = read(path);
    assert.doesNotMatch(text, /<script(?![^>]*\bsrc=)[^>]*>/, path);
    assert.doesNotMatch(text, /\son[a-z]+="/, path);
    assert.doesNotMatch(text, /\sstyle="/, path);
  }
});

test("the only request code is the API client, and it is the only fetch", () => {
  for (const path of shipped.filter((name) => name.endsWith(".js"))) {
    const text = read(path);
    if (path === "lib/api.js") continue;
    assert.doesNotMatch(text, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/, path);
  }
  assert.doesNotMatch(read("lib/api.js"), /XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
});

test("the token is kept in local storage only, never synced", () => {
  for (const path of shipped.filter((name) => name.endsWith(".js"))) {
    assert.doesNotMatch(read(path), /storage\.sync|document\.cookie|localStorage|indexedDB/, path);
  }
});

test("the code injected into a page reads and returns, and nothing else", () => {
  const capture = read("lib/capture.js");
  const injected = capture.slice(capture.indexOf("export function readPage"), capture.indexOf("// { text, personName"));
  assert.ok(injected.length > 500);
  assert.doesNotMatch(injected, /chrome\.|fetch\(|\.cookie|Storage|addEventListener|appendChild|innerHTML\s*=|\.remove\(|setAttribute|password"\)\s*return\s+[^"]/);
  assert.match(injected, /field\.type === "password"\) return ""/);
});
