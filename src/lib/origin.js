// Which Privatus Analytics address the extension talks to. The published
// one is fixed in the manifest. A local address is for development and
// needs the person's permission in Chrome first (optional host
// permissions).

export const DEFAULT_ORIGIN = "https://privatusanalytics.com";
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

// { origin, pattern, builtin } for an address the extension may use, or
// { error: message key }.
//   origin   scheme, host and port, no path
//   pattern  the host permission that covers it
//   builtin  true when the manifest already grants it
export function parseOrigin(input) {
  const text = String(input ?? "").trim();
  if (!text) return { origin: DEFAULT_ORIGIN, pattern: `${DEFAULT_ORIGIN}/*`, builtin: true };

  let parsed;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { error: "error_address_invalid" };
  }
  if (parsed.origin === DEFAULT_ORIGIN) {
    return { origin: DEFAULT_ORIGIN, pattern: `${DEFAULT_ORIGIN}/*`, builtin: true };
  }
  const local = LOCAL_HOSTS.includes(parsed.hostname);
  if (!local || parsed.protocol !== "http:") return { error: "error_address_not_allowed" };
  // A match pattern takes no port: the host covers every port on it.
  return { origin: parsed.origin, pattern: `http://${parsed.hostname}/*`, builtin: false };
}
