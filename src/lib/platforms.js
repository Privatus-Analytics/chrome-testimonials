// Which platform a page belongs to, from its host name. The list is data
// (data/platforms.json), a copy of the app's TestimonialSourceHelper::PLATFORMS
// with the hosts added.
import data from "../data/platforms.json" with { type: "json" };

export const PLATFORMS = data.platforms;

function hostOf(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function matches(platform, host) {
  const listed = (platform.hosts || []).some(
    (known) => host === known || host.endsWith(`.${known}`)
  );
  if (listed) return true;
  return Boolean(platform.host_pattern) && new RegExp(platform.host_pattern).test(host);
}

// { key, name } of the platform the URL is on, or null.
export function platformForUrl(url, platforms = PLATFORMS) {
  const host = hostOf(url);
  if (!host) return null;
  const found = platforms.find((platform) => matches(platform, host));
  return found ? { key: found.key, name: found.name } : null;
}
