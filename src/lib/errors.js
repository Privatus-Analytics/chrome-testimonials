// Turns a failed request into what the person is told. Pure: it returns
// message keys (_locales/en/messages.json), never text, except the field
// messages of a 422, which are the API's own sentences.
import { API_FIELDS } from "./payload.js";

// The shape every request failure has in this extension (lib/api.js).
export class ApiError extends Error {
  constructor({ status = 0, code = null, message = "", details = null, network = false } = {}) {
    super(message || code || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.network = network;
  }
}

// `during` is what was being done: "connect", "sites" or "save".
//
// Returns:
//   key      the sentence to show
//   values   what the sentence's placeholders take
//   fields   { form field: [the API's messages] } for a 422
//   notes    API messages for fields the form does not have
//   action   "options" (open the settings), "duplicate" (offer to save
//            anyway), "retry" or null
export function explain(error, during = "save") {
  if (!(error instanceof ApiError)) return plain("error_unexpected", "retry");
  if (error.network) return plain("error_offline", "retry");

  switch (error.status) {
    case 401:
      return plain("error_token_rejected", "options");
    case 402:
      return apiSentence(error, "error_plan_limit");
    case 403:
      return forbidden(error, during);
    case 404:
      return plain(during === "save" ? "error_site_gone" : "error_not_found", "retry");
    case 422:
      return unprocessable(error);
    case 423:
      return apiSentence(error, "error_locked");
    case 429:
      return plain("error_rate_limited", "retry");
    default:
      return { key: "error_server", values: [String(error.status)], fields: {}, notes: [], action: "retry" };
  }
}

function plain(key, action = null) {
  return { key, values: [], fields: {}, notes: [], action };
}

// The API's own sentence when it sent one, ours when it did not.
function apiSentence(error, fallback) {
  const result = plain(fallback);
  if (error.code && error.message) result.notes = [error.message];
  return result;
}

// A 403 with the API's error body is a permission the token lacks (or a
// site it may not reach). Without one, something in front of the app
// answered, and the token was never looked at.
function forbidden(error, during) {
  if (error.code !== "forbidden") {
    return { key: "error_server", values: ["403"], fields: {}, notes: [], action: "retry" };
  }
  const key = { connect: "error_no_read", sites: "error_no_read", save: "error_no_write" }[during];
  const result = plain(key || "error_no_write", "options");
  // On saving, the app's sentence says which of the two it is: the
  // permission, or the site.
  if (during === "save" && error.message) result.notes = [error.message];
  return result;
}

function unprocessable(error) {
  if (error.code === "allowance_reached") return plain("error_allowance");
  if (error.code === "duplicate") return plain("error_duplicate", "duplicate");

  const fields = {};
  const notes = [];
  for (const [name, messages] of Object.entries(error.details || {})) {
    const list = [].concat(messages).map(String).filter(Boolean);
    if (!list.length) continue;
    const field = API_FIELDS[name];
    if (field) fields[field] = (fields[field] || []).concat(list);
    else notes.push(...list);
  }
  if (!Object.keys(fields).length && !notes.length && error.message) notes.push(error.message);
  return { key: "error_invalid", values: [], fields, notes, action: null };
}
