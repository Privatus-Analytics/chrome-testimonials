// Who said the selected words, when the page says so near the selection.
//
// The page side (lib/capture.js) walks up from the selection and, at each
// ancestor, lists the text of the elements marked as an author (a cite, a
// figcaption, itemprop="author", rel="author", a class named for one).
// That gives `levels`: nearest ancestor first, each a list of texts.
//
// The rule here is deliberately narrow. The name is taken from the
// nearest level that names anyone, and only if it names exactly one
// person. Two names at that level means the walk has reached a list of
// reviews, and a guess from there would put words in the wrong mouth.

const MAX_LENGTH = 80;
const MAX_WORDS = 6;
// "by Maya Chen", "— Maya Chen", "Posted by Maya Chen"
const LEAD_IN = /^(?:[\s\-–—―~|:·•]+|(?:written|posted|reviewed|review)\s+by\s+|by\s+)+/i;
// "Maya Chen, Head of Support at Brightpath": the name is before the comma.
const SEPARATOR = /\s*(?:,|\||·|•|\s[\-–—]\s)\s*/;
// "a week ago", "Yesterday", "Edited"
const WHEN = /\b(?:ago|yesterday|today|just now|edited|updated)\b/i;
const NOT_A_NAME = /^(?:anonymous|verified|verified (?:buyer|customer|reviewer|user)|customer|reviewer|user|guest|admin|author|review|reviews|read more|follow|share|reply)$/i;

// One candidate text as a name, or null when it does not read as one.
export function cleanName(text) {
  let value = String(text ?? "").split(/[\r\n]+/)[0] || "";
  value = value.replace(/\s+/g, " ").trim().replace(LEAD_IN, "");
  value = value.split(SEPARATOR)[0].trim().replace(/[\s,.:;]+$/, "");
  if (!value || value.length > MAX_LENGTH) return null;
  if (value.split(" ").length > MAX_WORDS) return null;
  if (!/\p{L}/u.test(value)) return null;
  // A date, a count, an address, a handle or a link is not a name.
  if (/\d/.test(value) || /@|https?:|www\.|\//i.test(value)) return null;
  if (WHEN.test(value)) return null;
  if (NOT_A_NAME.test(value)) return null;
  return value;
}

// The name to prefill, or "" when the page is not clear about it.
export function pickAuthor(levels) {
  for (const level of levels || []) {
    const names = new Map();
    for (const candidate of level || []) {
      const name = cleanName(typeof candidate === "string" ? candidate : candidate?.text);
      if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
    if (names.size === 1) return [...names.values()][0];
    if (names.size > 1) return "";
  }
  return "";
}
