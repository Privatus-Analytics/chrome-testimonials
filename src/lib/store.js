// What the extension keeps, and where.
//
// chrome.storage.local (this browser profile, until "Disconnect"):
//   connection  { origin, token, account: { email, name },
//                 workspace: { id, name, plan }, canRead, canWrite,
//                 checkedAt }
//   sites      { list: [{ id, name }], fetchedAt }
//   lastSiteId the site chosen last time
//
// chrome.storage.session (memory only, gone when the browser closes):
//   pending     what the context menu passed to the popup
//   draft       an unsaved form, so closing the popup by accident does
//               not lose what was typed
//
// Nothing is kept anywhere else, and the synced storage area is never
// used: the token does not leave this browser except in requests to the
// address it was checked against.

const DRAFT_MINUTES = 30;
const PENDING_SECONDS = 120;

const local = () => chrome.storage.local;
const session = () => chrome.storage.session;

async function read(area, key) {
  return (await area.get(key))[key] ?? null;
}

export const getConnection = () => read(local(), "connection");
export const setConnection = (connection) => local().set({ connection });

export const getSites = () => read(local(), "sites");
export const setSites = (list) => local().set({ sites: { list, fetchedAt: Date.now() } });

export const getLastSiteId = () => read(local(), "lastSiteId");
export const setLastSiteId = (lastSiteId) => local().set({ lastSiteId });

// "Disconnect": the token and everything learned with it.
export async function clearEverything() {
  await local().clear();
  await session().clear();
}

export const setPending = (pending) => session().set({ pending: { ...pending, at: Date.now() } });

// Read once: the capture the context menu just asked for, if it is fresh.
export async function takePending() {
  const pending = await read(session(), "pending");
  if (!pending) return null;
  await session().remove("pending");
  return Date.now() - pending.at <= PENDING_SECONDS * 1000 ? pending : null;
}

export const setDraft = (draft) => session().set({ draft: { ...draft, at: Date.now() } });
export const clearDraft = () => session().remove("draft");

export async function getDraft(pageUrl) {
  const draft = await read(session(), "draft");
  if (!draft || draft.pageUrl !== pageUrl) return null;
  return Date.now() - draft.at <= DRAFT_MINUTES * 60 * 1000 ? draft : null;
}
