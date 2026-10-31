export async function requestJson(url, accessToken, options = {}) {
  const { method = "GET", headers = {}, body } = options;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000)
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${text}`);
  }

  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

export async function requestText(url, accessToken, options = {}) {
  const { method = "GET", headers = {}, body } = options;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...headers
    },
    body,
    signal: AbortSignal.timeout(60000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${text}`);
  }
  return text;
}

export async function listAll(url, accessToken) {
  const items = [];
  const origin = new URL(url).origin;
  const visited = new Set();
  let next = url;
  while (next) {
    const nextUrl = new URL(next, url);
    if (nextUrl.origin !== origin || visited.has(nextUrl.href)) {
      throw new Error("Invalid or repeated API pagination link.");
    }
    visited.add(nextUrl.href);
    const page = await requestJson(nextUrl.href, accessToken);
    if (page?.value && Array.isArray(page.value)) {
      items.push(...page.value);
    }
    next = page?.["@odata.nextLink"] || page?.nextLink || null;
  }
  return items;
}
