// The service worker. It adds the menu item, and when that is clicked it
// tells the popup which tab the click was on. It makes no request and
// reads no page itself.
import { setPending } from "./lib/store.js";

const MENU_ID = "save-testimonial";

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: chrome.i18n.getMessage("menu_save"),
      contexts: ["selection"]
    });
  });
  await keepStoragePrivate();
  if (reason === "install") chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(keepStoragePrivate);

// The token is for the extension's own pages. Code injected into a web
// page (lib/capture.js) cannot read the storage it is in.
async function keepStoragePrivate() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || tab.id === undefined) return;
  await openCapture(tab, info.selectionText || "");
});

// Opens the capture form for a tab. The form reads the page itself. The
// menu's own copy of the selection is passed along for the pages where
// it cannot (a selection inside an embedded frame, for example).
export async function openCapture(tab, selectionText) {
  await setPending({ tabId: tab.id, text: selectionText, url: tab.url || "", title: tab.title || "" });
  try {
    await chrome.action.openPopup({ windowId: tab.windowId });
  } catch {
    // Chrome would not open the popup from here (no focused window).
    // The same form opens in a small window of its own.
    await chrome.windows.create({
      url: chrome.runtime.getURL(`popup.html?tabId=${tab.id}&window=1`),
      type: "popup",
      width: 376,
      height: 640
    });
  }
}
