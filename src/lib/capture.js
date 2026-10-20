// Reading the page. This happens only when the person clicks the
// extension's button or its menu item: the click is what gives the
// extension access to that one tab (activeTab). There is no content
// script and nothing runs on a page otherwise.
import { pickAuthor } from "./author.js";

// Runs inside the page (chrome.scripting.executeScript), so it stands
// alone: nothing outside this function exists there. It reads the
// selection and the author marks around it, changes nothing, and stores
// nothing.
export function readPage() {
  const MAX_TEXT = 12000;
  const MAX_LEVELS = 8;
  const MAX_MARKS = 12;
  const MARKS = [
    "cite",
    "figcaption",
    '[itemprop~="author"]',
    '[rel~="author"]',
    '[class*="author" i]',
    '[class*="reviewer" i]',
    '[class*="byline" i]',
    '[class*="consumer-name" i]',
    '[data-testid*="author" i]',
    '[data-testid*="reviewer" i]',
    '[data-testid="User-Name"]'
  ].join(",");

  function fromField() {
    const field = document.activeElement;
    if (!field || !("selectionStart" in field)) return "";
    if (field.type === "password") return "";
    try {
      return String(field.value || "").slice(field.selectionStart, field.selectionEnd);
    } catch {
      return "";
    }
  }

  function markText(element) {
    if (element.matches('[itemprop~="author"]')) {
      const name = element.matches('[itemprop~="name"]') ? element : element.querySelector('[itemprop~="name"]');
      if (name) return name.getAttribute("content") || name.innerText || name.textContent || "";
    }
    if (element.tagName === "META") return element.getAttribute("content") || "";
    return element.innerText || element.textContent || "";
  }

  // A cite or a figcaption counts only next to the quote the selection
  // is in. Anywhere else it is the title of a book or the caption of a
  // photo.
  function besideQuote(element, start) {
    if (!element.matches("cite, figcaption")) return true;
    const quote = start.closest("blockquote, figure, q");
    if (!quote) return false;
    return quote.contains(element) || (quote.parentElement !== null && quote.parentElement === element.parentElement);
  }

  function levelsAround(start) {
    const levels = [];
    let ancestor = start;
    while (ancestor && ancestor !== document.documentElement && levels.length < MAX_LEVELS) {
      const marks = [];
      for (const element of ancestor.querySelectorAll(MARKS)) {
        if (marks.length >= MAX_MARKS) break;
        if (element.contains(start) || !besideQuote(element, start)) continue;
        const text = markText(element).trim().slice(0, 200);
        if (text) marks.push(text);
      }
      levels.push(marks);
      ancestor = ancestor.parentElement;
    }
    return levels;
  }

  const selection = window.getSelection();
  let text = selection ? selection.toString() : "";
  let levels = [];
  if (text.trim() && selection.rangeCount) {
    const node = selection.getRangeAt(0).commonAncestorContainer;
    const start = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (start) levels = levelsAround(start);
  } else {
    text = fromField();
  }

  return {
    top: window === window.top,
    text: text.slice(0, MAX_TEXT),
    levels,
    url: location.href,
    title: document.title
  };
}

// { text, personName, url, title } from a tab, or null when Chrome does
// not let the page be read (its own pages, the Web Store, a tab the
// person did not click the extension on).
export async function captureTab(tabId, scripting = chrome.scripting) {
  let results;
  try {
    results = await scripting.executeScript({ target: { tabId, allFrames: true }, func: readPage });
  } catch {
    try {
      results = await scripting.executeScript({ target: { tabId }, func: readPage });
    } catch {
      return null;
    }
  }
  return chooseFrame((results || []).map((entry) => entry.result).filter(Boolean));
}

// The page is the top frame. The words are wherever the selection is:
// the top frame, or an embedded one (a review widget, for example).
export function chooseFrame(frames) {
  if (!frames.length) return null;
  const top = frames.find((frame) => frame.top) || frames[0];
  const chosen = top.text.trim() ? top : frames.find((frame) => frame.text.trim()) || top;
  return {
    text: chosen.text,
    personName: pickAuthor(chosen.levels),
    url: top.url,
    title: top.title
  };
}
