export async function restGet(sb, path) {
  const res = await fetch(`${sb.url}/rest/v1/${path}`, {
    headers: {
      apikey: sb.key,
      Authorization: `Bearer ${sb.key}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : [];
}

export async function postJson(url, secret, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    const err = new Error(
      `POST ${url} ${res.status}: ${text.slice(0, 300)}`
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}
