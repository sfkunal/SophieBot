/** Build a web app return URL with query params (handles Vite base path trailing slash). */
export function buildWebReturnUrl(
  webUrl: string,
  params: Record<string, string>,
): string {
  const url = new URL(webUrl.endsWith("/") ? webUrl : `${webUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
