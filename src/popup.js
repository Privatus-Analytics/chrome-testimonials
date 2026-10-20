// The capture form. It opens when the person clicks the extension's
// button or its menu item, reads the selection from that one tab, and
// saves what the person confirms as a pending testimonial.
import { createClient } from "./lib/api.js";
import { captureTab } from "./lib/capture.js";
import { ApiError, explain } from "./lib/errors.js";
import { localize, t } from "./lib/i18n.js";
import { LIMITS, buildPayload, checkForm, sourceFor, testimonialUrl } from "./lib/payload.js";
import * as store from "./lib/store.js";

const $ = (id) => document.getElementById(id);
const VIEWS = ["loading", "connect", "blocked", "form", "saved"];
// Form field => the input it belongs to and where its message goes.
const FIELDS = {
  words: { input: "words", error: "words-error" },
  personName: { input: "person-name", error: "person-name-error" },
  personTitle: { input: "person-title", error: "person-title-error" },
  personCompany: { input: "person-company", error: "person-company-error" },
  rating: { input: "rating", error: "rating-error" },
  sourceName: { input: "source-name", error: "source-name-error" },
  sourceUrl: { input: "source-name", error: "source-url-error" },
  siteId: { input: "site", error: "site-error" }
};

const state = { connection: null, client: null, sites: [], rating: null, sourceUrl: null, pageKey: "" };

function show(name) {
  for (const view of VIEWS) $(`view-${view}`).hidden = view !== name;
}

// --- starting ---------------------------------------------------------------

async function start() {
  localize();
  wire();
  const params = new URLSearchParams(location.search);
  if (params.has("window")) document.documentElement.classList.add("windowed");

  state.connection = await store.getConnection();
  if (!state.connection) return show("connect");
  state.client = createClient({ origin: state.connection.origin, token: state.connection.token });

  const [page, sitesProblem] = await Promise.all([readPage(params), loadSites()]);
  if (sitesProblem) return showBlocked(sitesProblem);
  if (!state.sites.length) return showBlocked({ key: "error_no_sites", notes: [], action: "options" });

  await fillForm(page);
  show("form");
  resizeWords();
  // Known since the token was checked: say it before anything is typed.
  if (state.connection.canWrite === false) {
    showFailure({ key: "saving_no", values: [], fields: {}, notes: [], action: "options" });
  }
  ($("words").value.trim() ? $("person-name") : $("words")).focus();
}

// The tab the click was on, and what is selected in it.
async function readPage(params) {
  const pending = await store.takePending();
  const wanted = pending?.tabId ?? (params.has("tabId") ? Number(params.get("tabId")) : null);
  let tab = null;
  if (wanted !== null) tab = await chrome.tabs.get(wanted).catch(() => null);
  if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  const captured = tab?.id === undefined ? null : await captureTab(tab.id);
  return {
    readable: Boolean(captured),
    text: captured?.text?.trim() ? captured.text : pending?.text || "",
    personName: captured?.personName || "",
    url: captured?.url || tab?.url || pending?.url || "",
    title: captured?.title || tab?.title || pending?.title || ""
  };
}

// The sites the token sees. The list kept from last time shows at once
// and is refreshed behind it. Returns what to tell the person when there
// is no list to show, or null.
async function loadSites() {
  const kept = await store.getSites();
  if (kept?.list?.length) {
    state.sites = kept.list;
    refreshSites().catch(() => {});
    return null;
  }
  try {
    await refreshSites();
    return null;
  } catch (error) {
    return explain(error, "sites");
  }
}

async function refreshSites() {
  const list = await state.client.sites(state.connection.workspace.id);
  await store.setSites(list);
  const changed = JSON.stringify(list) !== JSON.stringify(state.sites);
  state.sites = list;
  if (changed && !$("view-form").hidden) await fillSites($("site").value);
}

// --- the form ---------------------------------------------------------------

async function fillForm(page) {
  const source = sourceFor({ url: page.url, title: page.title });
  state.sourceUrl = source.url;
  state.pageKey = source.url || page.url || "";

  // What was typed before the popup closed, when there is no new
  // selection to replace it.
  const draft = page.text.trim() ? null : await store.getDraft(state.pageKey);
  const form = draft?.form || {
    words: page.text,
    personName: page.personName,
    personTitle: "",
    personCompany: "",
    rating: null,
    sourceName: source.name
  };

  $("words").value = form.words || "";
  $("person-name").value = form.personName || "";
  $("person-title").value = form.personTitle || "";
  $("person-company").value = form.personCompany || "";
  $("source-name").value = form.sourceName || "";
  setRating(form.rating);

  const shown = source.url ? source.url.replace(/^https?:\/\/(www\.)?/, "") : "";
  $("source-url").textContent = shown;
  $("source-url").title = source.url || "";

  // On a page Chrome does not let extensions read, the box says so.
  if (!page.readable) $("words").placeholder = t("words_unreadable");

  await fillSites(draft?.form?.siteId);
  updateCount();
}

async function fillSites(preferred) {
  const select = $("site");
  const last = preferred || (await store.getLastSiteId());
  select.replaceChildren(
    ...state.sites.map((site) => {
      const option = document.createElement("option");
      option.value = site.id;
      option.textContent = site.name;
      return option;
    })
  );
  select.value = state.sites.some((site) => site.id === last) ? last : state.sites[0].id;
}

function readForm() {
  return {
    words: $("words").value,
    personName: $("person-name").value,
    personTitle: $("person-title").value,
    personCompany: $("person-company").value,
    rating: state.rating,
    sourceName: $("source-name").value,
    sourceUrl: state.sourceUrl,
    siteId: $("site").value
  };
}

function setRating(value) {
  state.rating = value || null;
  const stars = [...$("rating").querySelectorAll(".star")];
  for (const star of stars) {
    const number = Number(star.dataset.value);
    star.classList.toggle("on", state.rating !== null && number <= state.rating);
    star.setAttribute("aria-checked", String(number === state.rating));
    // One stop in the tab order, like a group of radio buttons.
    star.tabIndex = number === (state.rating || 1) ? 0 : -1;
  }
  $("rating-clear").hidden = state.rating === null;
}

function resizeWords() {
  const words = $("words");
  words.style.height = "auto";
  words.style.height = `${Math.min(words.scrollHeight, 232)}px`;
}

function updateCount() {
  const length = $("words").value.trim().length;
  const count = $("words-count");
  count.hidden = length < LIMITS.body * 0.9;
  count.classList.toggle("over", length > LIMITS.body);
  if (!count.hidden) {
    count.textContent = t("words_count", [length.toLocaleString("en-US"), LIMITS.body.toLocaleString("en-US")]);
  }
}

let draftTimer = null;
function keepDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    store.setDraft({ pageUrl: state.pageKey, form: readForm() }).catch(() => {});
  }, 250);
}

// --- messages ---------------------------------------------------------------

function clearMessages() {
  $("form-error").hidden = true;
  $("form-error-notes").replaceChildren();
  $("form-error-actions").hidden = true;
  $("save-anyway").hidden = true;
  $("error-open-options").hidden = true;
  document.querySelector(".quote").classList.remove("invalid");
  for (const { input, error } of Object.values(FIELDS)) {
    $(error).hidden = true;
    $(error).textContent = "";
    $(input).removeAttribute("aria-invalid");
  }
}

function showFieldMessages(fields) {
  let first = null;
  for (const [field, messages] of Object.entries(fields)) {
    const target = FIELDS[field];
    if (!target) continue;
    $(target.error).textContent = [].concat(messages).join(" ");
    $(target.error).hidden = false;
    $(target.input).setAttribute("aria-invalid", "true");
    if (field === "words") document.querySelector(".quote").classList.add("invalid");
    first = first || $(target.input);
  }
  if (first) (first.id === "rating" ? first.querySelector("[tabindex='0']") : first).focus();
}

// What explain() returned, on the form.
function showFailure(told) {
  const quiet = told.key === "error_invalid" && Object.keys(told.fields).length > 0 && !told.notes.length;
  if (!quiet) {
    $("form-error-text").textContent = t(told.key, told.values);
    $("form-error-notes").replaceChildren(
      ...told.notes.map((note) => {
        const line = document.createElement("p");
        line.textContent = note;
        return line;
      })
    );
    $("save-anyway").hidden = told.action !== "duplicate";
    $("error-open-options").hidden = told.action !== "options";
    $("form-error-actions").hidden = told.action !== "duplicate" && told.action !== "options";
    $("form-error").hidden = false;
  }
  showFieldMessages(told.fields);
}

// The heading over a sentence that takes the whole popup.
const BLOCKED_TITLES = {
  error_no_read: "blocked_no_sites_title",
  error_no_sites: "blocked_no_sites_title",
  error_token_rejected: "blocked_token_title",
  error_offline: "blocked_offline_title"
};

function showBlocked(told) {
  $("blocked-title").textContent = t(BLOCKED_TITLES[told.key] || "blocked_title");
  $("blocked-text").textContent = t(told.key, told.values);
  const note = $("blocked-note");
  note.hidden = !told.notes?.length;
  note.textContent = (told.notes || []).join(" ");
  $("blocked-open").hidden = told.action !== "options";
  $("blocked-retry").hidden = told.action !== "retry";
  show("blocked");
}

// --- saving -----------------------------------------------------------------

function setSaving(saving) {
  $("save").disabled = saving;
  $("save-spinner").hidden = !saving;
  $("save-label").textContent = t(saving ? "saving" : "save");
}

async function save({ allowDuplicate = false } = {}) {
  clearMessages();
  const form = readForm();
  const problems = checkForm(form);
  if (Object.keys(problems).length) {
    const limits = { words: LIMITS.body, personName: LIMITS.personName, personTitle: LIMITS.personTitle,
                     personCompany: LIMITS.personCompany, sourceName: LIMITS.sourceName };
    const fields = {};
    for (const [field, key] of Object.entries(problems)) {
      fields[field] = [t(key, [(limits[field] || 0).toLocaleString("en-US")])];
    }
    return showFieldMessages(fields);
  }

  setSaving(true);
  try {
    const saved = await state.client.createTestimonial(form.siteId, buildPayload(form, { allowDuplicate }));
    await store.setLastSiteId(form.siteId);
    await store.clearDraft();
    clearTimeout(draftTimer);
    showSaved(saved, form.siteId);
  } catch (error) {
    showFailure(explain(error, "save"));
    // A site that is gone should not stay in the list.
    if (error instanceof ApiError && error.status === 404) refreshSites().catch(() => {});
  } finally {
    setSaving(false);
  }
}

function showSaved(saved, siteId) {
  const site = state.sites.find((entry) => entry.id === siteId);
  $("saved-title").textContent = t("saved_title", [site ? site.name : ""]);
  $("saved-link").href = testimonialUrl(state.connection.origin, siteId, saved.id);
  show("saved");
  $("saved-link").focus();
}

// --- wiring -----------------------------------------------------------------

function wire() {
  const openOptions = () => chrome.runtime.openOptionsPage();
  for (const id of ["open-options", "connect-open", "blocked-open", "error-open-options"]) {
    $(id).addEventListener("click", openOptions);
  }
  $("blocked-retry").addEventListener("click", () => location.reload());
  $("saved-close").addEventListener("click", () => window.close());

  $("view-form").addEventListener("submit", (event) => {
    event.preventDefault();
    save();
  });
  $("save-anyway").addEventListener("click", () => save({ allowDuplicate: true }));
  $("view-form").addEventListener("input", keepDraft);
  // A field's message goes as soon as the field is edited.
  $("view-form").addEventListener("input", (event) => {
    for (const { input, error } of Object.values(FIELDS)) {
      if (input !== event.target.id) continue;
      $(error).hidden = true;
      $(input).removeAttribute("aria-invalid");
      if (input === "words") document.querySelector(".quote").classList.remove("invalid");
    }
  });
  $("words").addEventListener("input", () => {
    resizeWords();
    updateCount();
  });
  // Enter in the words is a new line. Ctrl or Cmd with Enter saves.
  $("words").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  });

  $("rating").addEventListener("click", (event) => {
    const star = event.target.closest(".star");
    if (!star) return;
    const value = Number(star.dataset.value);
    setRating(value === state.rating ? null : value);
    keepDraft();
  });
  $("rating").addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    setRating(Math.min(5, Math.max(1, (state.rating || 0) + step)));
    $("rating").querySelector("[tabindex='0']").focus();
    keepDraft();
  });
  $("rating-clear").addEventListener("click", () => {
    setRating(null);
    keepDraft();
    $("rating").querySelector("[tabindex='0']").focus();
  });
}

start().catch(() => {
  showBlocked({ key: "error_unexpected", values: [], notes: [], action: "retry" });
});
