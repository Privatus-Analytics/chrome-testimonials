// What the capture form sends to testimonials_create
// (POST /sites/:site_id/testimonials.json). Pure functions: no browser
// and no network here.
import { platformForUrl } from "./platforms.js";

// The app's own limits (Testimonial and Person validations).
export const LIMITS = {
  body: 10000,
  personName: 120,
  personTitle: 120,
  personCompany: 120,
  sourceName: 120,
  sourceUrl: 2000
};

// Query parameters that say how a visitor got to the page, not which page
// it is. They are dropped from the source link.
const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|ref_src)$/i;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// The words keep their line breaks. Only the edges and runs of blank
// lines are tidied.
export function cleanWords(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

// The page's address as a source link: http or https only, without the
// fragment and the tracking parameters. null for anything else (a
// browser page, a local file) and for one too long to store.
export function cleanUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  for (const name of [...parsed.searchParams.keys()]) {
    if (TRACKING.test(name)) parsed.searchParams.delete(name);
  }
  const text = parsed.toString();
  return text.length > LIMITS.sourceUrl ? null : text;
}

// Where the words were found: the platform's name when the host is one
// the app knows, otherwise the page's title, otherwise its host.
export function sourceFor({ url, title } = {}) {
  const link = cleanUrl(url);
  const platform = link ? platformForUrl(link) : null;
  let name = platform ? platform.name : clean(title);
  if (!name && link) name = new URL(link).hostname.replace(/^www\./, "");
  return {
    name: truncate(name, LIMITS.sourceName),
    url: link,
    platform: platform ? platform.key : null
  };
}

// The rating as the API takes it: 1 to 5, or nothing.
export function cleanRating(value) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

// Problems the form can name before anything is sent.
// Returns { field: message key }.
export function checkForm(form) {
  const problems = {};
  const words = cleanWords(form.words);
  if (!words) problems.words = "error_words_needed";
  else if (words.length > LIMITS.body) problems.words = "error_words_too_long";
  const name = clean(form.personName);
  if (!name) problems.personName = "error_name_needed";
  else if (name.length > LIMITS.personName) problems.personName = "error_too_long";
  if (clean(form.personTitle).length > LIMITS.personTitle) problems.personTitle = "error_too_long";
  if (clean(form.personCompany).length > LIMITS.personCompany) problems.personCompany = "error_too_long";
  if (clean(form.sourceName).length > LIMITS.sourceName) problems.sourceName = "error_too_long";
  if (!form.siteId) problems.siteId = "error_site_needed";
  return problems;
}

// The JSON body of testimonials_create. Empty fields are left out, so the
// API's own defaults apply (status pending, kind text).
export function buildPayload(form, { allowDuplicate = false } = {}) {
  const payload = {
    body: cleanWords(form.words),
    person_name: clean(form.personName),
    via: "extension"
  };
  const optional = {
    person_title: clean(form.personTitle),
    person_company: clean(form.personCompany),
    source_name: clean(form.sourceName),
    source_url: cleanUrl(form.sourceUrl)
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value) payload[key] = value;
  }
  const rating = cleanRating(form.rating);
  if (rating) payload.rating = rating;
  if (allowDuplicate) payload.allow_duplicate = true;
  return payload;
}

// Which form field an API field's message belongs under.
export const API_FIELDS = {
  body: "words",
  person_name: "personName",
  name: "personName",
  person_title: "personTitle",
  person_company: "personCompany",
  company: "personCompany",
  rating: "rating",
  source_name: "sourceName",
  source_url: "sourceUrl"
};

// The address of a saved testimonial in the app.
export function testimonialUrl(origin, siteId, testimonialId) {
  return `${origin}/sites/${encodeURIComponent(siteId)}/testimonials/${encodeURIComponent(testimonialId)}`;
}
