# Privatus Analytics: capture a testimonial (Chrome extension)

Select what a customer said on any page, click the extension, confirm the
person and the site, and it is a pending testimonial in Privatus Analytics
with the page as its source.

> **It is not published yet, and until it is, nothing a customer reads may
> mention it**: not the app, the docs in `content/docs/`, the marketing
> pages, the emails or a locale file. `spec/config/chrome_extension_unnamed_spec.rb`
> fails otherwise. Publishing is James's step: `docs/deploy/chrome-extension.md`.

It is a different extension from `../browser-extension` ("Block my
visits"), and shares no code with it.

Manifest V3, plain JavaScript, no build step, no framework, no
dependencies. What is in this folder is what runs.

## What it does, exactly

- **It reads a page only on a click.** The toolbar button and the menu
  item "Save as a testimonial" (on a text selection) are the only two ways
  in. The click gives the extension access to that one tab (`activeTab`),
  and it reads the selection, the page's address and title, and the author
  marks near the selection (`src/lib/capture.js`). There is no content script.
- **It talks to one address.** Every request goes to the Privatus Analytics
  address in the settings, with the person's API token, and nowhere else.
  The manifest's own content security policy refuses any other connection.
- **It calls the app's own operations**, the same ones the pages and MCP
  use (CLAUDE.md section 3). Nothing on the server exists for the
  extension alone except one input, `via`:

  | Request | Operation | Why |
  |---|---|---|
  | `GET /account.json` | `account_get` | Whose token it is |
  | `GET /workspaces.json` | `workspaces_list` | The token's workspace |
  | `GET /workspaces/:id/sites.json` | `sites_list` | The site picker. Needs `analytics.read` |
  | `POST /sites/:id/testimonials.json` | `testimonials_create` | Saving. Needs `content.write`. Sent with `via: "extension"`, which stores the source as `extension` |

  When a token is checked, the same `POST` is sent once with an empty
  body. It can never be stored (a testimonial needs a person and words).
  A token without `content.write` is refused with 403 before the app looks
  at the body, and one with it gets a 422. That is how the settings
  page knows whether the token can add, without adding anything.
- **It keeps the token in `chrome.storage.local`**, in this browser
  profile, not encrypted beyond what Chrome does for the profile, and
  readable only by the extension's own pages (`src/lib/store.js`). Next to it:
  the account's name and email, the workspace's name, the names of the
  sites and the site chosen last. An unsaved form is kept in memory
  (`chrome.storage.session`) for 30 minutes so a closed popup does not
  lose it. "Disconnect" removes all of it.
- **It saves as pending.** It never sends a status, so the app's default
  applies. At the monthly allowance the app refuses what a member adds
  (`allowance_reached`): it is not held. The popup says so. Only a
  customer's own form submission is held as waiting.

## Files

| Path | What it is |
|---|---|
| `src/manifest.json` | Permissions: `activeTab`, `contextMenus`, `scripting`, `storage`. Host: `https://privatusanalytics.com/*`. Optional hosts for development, in `src` only: `http://localhost/*`, `http://127.0.0.1/*` (the store zip has none, `scripts/store-manifest`) |
| `src/background.js` | The service worker: adds the menu item and opens the popup for the tab it was clicked on |
| `src/popup.html`, `popup.js`, `popup.css` | The capture form, 360 wide |
| `src/options.html`, `options.js`, `options.css` | The settings page: token, account, disconnect |
| `src/ui.css` | The brand tokens (the app's green scale from `app/assets/tailwind/application.css`), the system typeface, light and dark |
| `src/lib/api.js` | The only code that makes a request |
| `src/lib/capture.js` | The function that runs in the page, and how its result is read |
| `src/lib/author.js` | Who said it: the nearest author mark, and only when it names one person |
| `src/lib/payload.js` | The body of `testimonials_create`, the source name and link |
| `src/lib/platforms.js`, `src/data/platforms.json` | Host to platform name. A copy of `TestimonialSourceHelper::PLATFORMS` with hosts |
| `src/lib/errors.js` | A failed request to a message key |
| `src/lib/origin.js` | Which addresses are accepted |
| `src/lib/store.js` | What is stored and where |
| `src/_locales/en/messages.json` | Every word it shows. Not in `config/locales/en.yml` |
| `src/icons/` | The brand mark, resized from `public/icon.png` (see below) |
| `test/` | Node tests. Not shipped |
| `scripts/package` | Builds the zip from `src/`, with the manifest of `scripts/store-manifest` (no local hosts) |
| `scripts/store-manifest` | Turns `src/manifest.json` into the store's: no optional localhost hosts, no local `connect-src` |
| `scripts/e2e.mjs` | The request-level run against a live app. Not shipped |

## Load it unpacked

1. Open `chrome://extensions`, turn on "Developer mode".
2. "Load unpacked", and choose the `src` folder (`integrations/chrome-testimonials/src`).
3. The settings page opens. Follow it.

After a change, press the reload arrow on the extension's card.

## Point it at localhost

1. Start the app (`docker compose up`), then `bin/auth priya.nair@fernhill-outdoor.com`
   prints an API token of a seeded member (each run replaces the one
   before).
2. On the extension's settings page open "For developers" and enter the
   address, for example `http://localhost:3008`.
3. Paste the token and click "Connect". Chrome asks once whether the
   extension may reach localhost. That is the optional host permission.

Only `https://privatusanalytics.com`, `http://localhost:<port>` and
`http://127.0.0.1:<port>` are accepted (`src/lib/origin.js`). This works in
the unpacked copy only: the zip from `scripts/package` has no local host
in its manifest, so Chrome refuses the permission and the content
security policy blocks the connection.

## Tests

Node 22 or newer, nothing to install. From this folder:

```bash
node --test
```

That runs the pure modules (host to platform, the payload, error mapping,
author detection, the address rule), the API client against a fake
`fetch`, and checks on the manifest, the messages and the shipped code (no
remote code, one place that makes requests, no synced storage).

They run on the host only. The web container has no Node, so these are
**not** part of `bin/ci`. What
`bin/ci` does check, in Ruby: `spec/config/chrome_extension_data_spec.rb`
(the platform list, the field limits and the manifest's permissions against
the app) and `spec/config/chrome_extension_unnamed_spec.rb` (the rule at
the top of this page).

End to end against a running app, without a browser:

```bash
PA_ORIGIN=http://localhost:3008 PA_TOKEN=<token from bin/auth> node scripts/e2e.mjs
```

It connects, saves one testimonial through `lib/api.js`, reads it back,
checks it is pending with source `extension` and the page as its source,
and moves it to the trash again.

## When the app's platform list changes

`src/data/platforms.json` must list every key of `TestimonialSourceHelper::PLATFORMS`
with the same name, plus the hosts its pages are on. The Ruby spec fails
until it does. A host matches itself and its subdomains. Use
`host_pattern` (a regular expression on the whole host) only when a list
cannot say it, as for Google's country domains.

## Icons

The four PNGs are the brand mark (`public/icon.png`, 512 pixels), resized
on a Mac:

```bash
for s in 16 32 48 128; do sips -z $s $s public/icon.png --out integrations/chrome-testimonials/src/icons/icon-$s.png; done
```

## Package

```bash
integrations/chrome-testimonials/scripts/package
```

It zips what is under `src/` into `dist/` (not committed) and prints the
size and the manifest version. Raise `version` in `src/manifest.json` before
every upload: the Chrome Web Store refuses a version it has seen.
