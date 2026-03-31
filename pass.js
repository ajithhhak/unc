// api/pass.js — serves gate pass data for a token

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  if (!json.result) return null;
  try { return JSON.parse(json.result); } catch { return json.result; }
}

export default async function handler(req, res) {
  const token = req.query.t;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const data = await kvGet(`token:${token}`);
  if (!data) return res.status(404).json({ error: 'Expired or invalid link' });

  res.status(200).json(data);
}
