// The settings page: paste an API token, see whose it is and what it may
// do, and disconnect.
import { connect, createClient } from "./lib/api.js";
import { explain } from "./lib/errors.js";
import { localize, t } from "./lib/i18n.js";
import { DEFAULT_ORIGIN, parseOrigin } from "./lib/origin.js";
import * as store from "./lib/store.js";

const $ = (id) => document.getElementById(id);
const OPTIONAL_ORIGINS = chrome.runtime.getManifest().optional_host_permissions || [];

function showNotice(told) {
  $("notice-text").textContent = t(told.key, told.values);
  $("notice-notes").replaceChildren(
    ...(told.notes || []).map((note) => {
      const line = document.createElement("p");
      line.textContent = note;
      return line;
    })
  );
  $("notice").hidden = false;
}

function clearMessages() {
  $("notice").hidden = true;
  for (const id of ["token-error", "address-error"]) {
    $(id).hidden = true;
    $(id).textContent = "";
  }
  $("token").removeAttribute("aria-invalid");
  $("address").removeAttribute("aria-invalid");
}

function fieldError(field, key) {
  $(`${field}-error`).textContent = t(key);
  $(`${field}-error`).hidden = false;
  $(field).setAttribute("aria-invalid", "true");
  $(field).focus();
}

// --- what is shown ----------------------------------------------------------

function line(className, icon, text) {
  const row = document.createElement("span");
  row.className = className;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${icon}`);
  svg.append(use);
  const label = document.createElement("span");
  label.textContent = text;
  row.append(svg, label);
  return row;
}

function render(connection, sites) {
  $("connected").hidden = !connection;
  $("connect").hidden = Boolean(connection);
  $("open-app").href = parseOrigin($("address").value).origin || DEFAULT_ORIGIN;
  if (!connection) return;

  $("fact-name").textContent = connection.account.name || connection.account.email;
  $("fact-email").textContent = connection.account.name ? connection.account.email : "";
  $("fact-workspace").textContent = connection.workspace.name;

  const names = (sites || []).map((site) => site.name);
  $("fact-sites").textContent = connection.canRead
    ? t(names.length === 1 ? "sites_one" : "sites_many", [names.length])
    : t("sites_unreadable");
  $("fact-site-names").textContent = names.slice(0, 6).join(", ") + (names.length > 6 ? ", …" : "");

  let saving;
  if (connection.canWrite === true) saving = line("can", "i-check", t("saving_yes"));
  else if (connection.canWrite === false) saving = line("cannot", "i-warning", t("saving_no"));
  else saving = line("cannot", "i-warning", t(connection.canRead ? "saving_no_sites" : "saving_no_read"));
  $("fact-saving").replaceChildren(saving);

  $("fact-token").textContent = `${connection.token.slice(0, 8)}…`;
  $("fact-address-row").hidden = connection.origin === DEFAULT_ORIGIN;
  $("fact-address").textContent = connection.origin;
}

async function refresh() {
  const [connection, sites] = await Promise.all([store.getConnection(), store.getSites()]);
  render(connection, sites?.list || []);
}

// --- connecting -------------------------------------------------------------

// Chrome asks the person before the extension may reach a local address.
async function allowed(target) {
  if (target.builtin) return true;
  const wanted = { origins: [target.pattern] };
  if (await chrome.permissions.contains(wanted)) return true;
  return chrome.permissions.request(wanted).catch(() => false);
}

async function check(origin, token) {
  const found = await connect(createClient({ origin, token }));
  if (!found.workspace) throw new Error("no workspace");
  await store.setConnection({
    origin,
    token,
    account: found.account,
    workspace: found.workspace,
    canRead: found.canRead,
    canWrite: found.canWrite,
    checkedAt: Date.now()
  });
  await store.setSites(found.sites);
}

function busy(prefix, on) {
  $(`${prefix}-spinner`).hidden = !on;
  $(prefix === "connect" ? "connect-button" : prefix).disabled = on;
}

async function submit(event) {
  event.preventDefault();
  clearMessages();
  // A token copied with its header's first word still works.
  const token = $("token").value.trim().replace(/^Bearer\s+/i, "");
  if (!token) return fieldError("token", "error_token_needed");
  const target = parseOrigin($("address").value);
  if (target.error) {
    $("advanced").open = true;
    return fieldError("address", target.error);
  }

  busy("connect", true);
  try {
    if (!(await allowed(target))) {
      $("advanced").open = true;
      return fieldError("address", "error_address_refused");
    }
    await check(target.origin, token);
    $("token").value = "";
    await refresh();
  } catch (error) {
    showNotice(explain(error, "connect"));
  } finally {
    busy("connect", false);
  }
}

async function recheck() {
  clearMessages();
  const connection = await store.getConnection();
  if (!connection) return refresh();
  busy("recheck", true);
  try {
    await check(connection.origin, connection.token);
  } catch (error) {
    showNotice(explain(error, "connect"));
  } finally {
    busy("recheck", false);
    await refresh();
  }
}

// Removes the token, the sites, the last choice and any draft, and gives
// back the permission for a local address if one was granted.
async function disconnect() {
  clearMessages();
  await store.clearEverything();
  if (OPTIONAL_ORIGINS.length) await chrome.permissions.remove({ origins: OPTIONAL_ORIGINS }).catch(() => false);
  $("address").value = "";
  await refresh();
  $("token").focus();
}

async function start() {
  localize();
  $("version").textContent = t("version", [chrome.runtime.getManifest().version]);
  $("connect").addEventListener("submit", submit);
  $("recheck").addEventListener("click", recheck);
  $("disconnect").addEventListener("click", disconnect);
  $("address").addEventListener("input", () => {
    $("open-app").href = parseOrigin($("address").value).origin || DEFAULT_ORIGIN;
  });
  await refresh();
}

start();
