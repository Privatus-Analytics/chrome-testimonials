// Every word the extension shows is in _locales/en/messages.json.
// Elements name their message with data-i18n (the text),
// data-i18n-placeholder, data-i18n-title or data-i18n-aria-label.

export function t(key, values) {
  const list = values === undefined ? undefined : [].concat(values).map(String);
  return chrome.i18n.getMessage(key, list) || key;
}

const ATTRIBUTES = { i18nPlaceholder: "placeholder", i18nTitle: "title", i18nAriaLabel: "aria-label" };

export function localize(root = document) {
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const [data, attribute] of Object.entries(ATTRIBUTES)) {
    const selector = `[data-${data.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`;
    for (const element of root.querySelectorAll(selector)) {
      element.setAttribute(attribute, t(element.dataset[data]));
    }
  }
  if (root === document) document.title = t(document.documentElement.dataset.title || "extension_name");
}
