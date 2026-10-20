// The requests the extension makes, all to the one Privatus Analytics
// address it was given, all with the person's API token. They are the
// app's own JSON operations: nothing here is a separate API.
//
//   account_get          GET  /account.json
//   workspaces_list      GET  /workspaces.json
//   sites_list          GET  /workspaces/:workspace_id/sites.json
//   testimonials_create  POST /sites/:site_id/testimonials.json
import { ApiError } from "./errors.js";

const TIMEOUT_MS = 20000;
const PER_PAGE = 100;
const MAX_PAGES = 20;

export function createClient({ origin, token, fetch: fetcher = globalThis.fetch, timeout = TIMEOUT_MS }) {
  async function request(method, path, { query, body } = {}) {
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value);

    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetcher(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // The token is the only credential: no cookie is sent or kept,
        // nothing is cached, and a redirect is never followed with it.
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });
    } catch {
      throw new ApiError({ network: true });
    } finally {
      clearTimeout(timer);
    }

    let parsed = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const error = parsed && typeof parsed.error === "object" ? parsed.error : {};
      throw new ApiError({
        status: response.status,
        code: error.code || null,
        message: error.message || "",
        details: error.details || null
      });
    }
    if (!parsed || typeof parsed !== "object") throw new ApiError({ status: response.status });
    return parsed;
  }

  return {
    origin,

    async account() {
      const { data } = await request("GET", "/account.json");
      return { email: data.email, name: data.name || "" };
    },

    // A token belongs to one workspace, so this is a list of one.
    async workspace() {
      const { data } = await request("GET", "/workspaces.json");
      const first = (data || [])[0];
      return first ? { id: first.id, name: first.name, plan: first.plan } : null;
    },

    // Every site the token may see, by name. Needs analytics.read.
    async sites(workspaceId) {
      const all = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const { data, meta } = await request(
          "GET",
          `/workspaces/${encodeURIComponent(workspaceId)}/sites.json`,
          { query: { page, per_page: PER_PAGE } }
        );
        for (const site of data || []) all.push({ id: site.id, name: site.name });
        if (!meta || page >= (meta.total_pages || 1)) break;
      }
      return all.sort((a, b) => a.name.localeCompare(b.name));
    },

    // Whether the token may add testimonials to a site, without adding
    // one. An empty testimonial is refused either way, and how tells the
    // two apart: a token without content.write is turned away (403)
    // before the app looks at what was sent, and one with it is told
    // what is missing (422). Nothing is stored and nothing is counted.
    async canWrite(siteId) {
      try {
        await request("POST", `/sites/${encodeURIComponent(siteId)}/testimonials.json`, { body: {} });
      } catch (error) {
        if (error instanceof ApiError && error.status === 422) return true;
        if (error instanceof ApiError && error.status === 403 && error.code === "forbidden") return false;
        throw error;
      }
      // An empty testimonial can never be stored, so this is not reached.
      return true;
    },

    async createTestimonial(siteId, payload) {
      const { data } = await request(
        "POST",
        `/sites/${encodeURIComponent(siteId)}/testimonials.json`,
        { body: payload }
      );
      return data;
    }
  };
}

// Checks a token and says whose it is. Throws ApiError when the account
// cannot be read at all (a wrong token, no connection).
//
//   { account, workspace, sites, canRead, canWrite }
//
// canRead is false when the token lacks analytics.read: the sites cannot be
// listed, so nothing can be saved. canWrite is null when it could not be
// checked (no site to check it on).
export async function connect(client) {
  const account = await client.account();
  const workspace = await client.workspace();
  if (!workspace) return { account, workspace: null, sites: [], canRead: false, canWrite: null };

  let sites = [];
  let canRead = true;
  try {
    sites = await client.sites(workspace.id);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 403) throw error;
    canRead = false;
  }
  const canWrite = sites.length ? await client.canWrite(sites[0].id) : null;
  return { account, workspace, sites, canRead, canWrite };
}
