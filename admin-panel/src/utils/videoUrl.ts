export function isSupportedYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") return url.pathname.length > 1;
    if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) return false;
    return (url.pathname === "/watch" && !!url.searchParams.get("v")) ||
      /^\/(shorts|live|embed)\/[^/]+$/.test(url.pathname);
  } catch {
    return false;
  }
}
