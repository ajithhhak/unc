// api/bot.js — Vercel Serverless Webhook Handler

const ADMIN_ID  = Number(process.env.ADMIN_TELEGRAM_ID);
const BOT_TOKEN = process.env.BOT_TOKEN;
const KV_URL    = process.env.KV_REST_API_URL;
const KV_TOKEN  = process.env.KV_REST_API_TOKEN;
const APP_URL   = process.env.APP_URL; // e.g. https://gatepass.vercel.app

// ── KV helpers (Upstash Redis REST) ──────────────────────────────────────────
async function kvSet(key, value, exSeconds) {
  const args = ['SET', key, JSON.stringify(value)];
  if (exSeconds) args.push('EX', String(exSeconds));
  await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([args]),
  });
}

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  if (!json.result) return null;
  try { return JSON.parse(json.result); } catch { return json.result; }
}

async function kvDel(key) {
  await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
}

// ── Telegram API ──────────────────────────────────────────────────────────────
async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Random token ──────────────────────────────────────────────────────────────
function makeToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Parse key=value block ─────────────────────────────────────────────────────
function parseDetails(text) {
  const data = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase().replace(/\s/g, '');
    const val = line.slice(idx + 1).trim();
    if (val) data[key] = val;
  }
  return data;
}

function isComplete(d) {
  return d.name && d.emailid && d.monthwithdate && d.reason && d.branch && d.time && d.rollno;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  const update = req.body;
  const msg = update.message;
  if (!msg) return res.status(200).send('OK');

  const chatId  = msg.chat.id;
  const text    = (msg.text || '').trim();
  const isAdmin = chatId === ADMIN_ID;
  const isPhoto = !!msg.photo;

  // ══════════════════════════════════════════════════════════════
  // ADMIN COMMANDS
  // ══════════════════════════════════════════════════════════════
  if (isAdmin) {

    // yes <chatId>
    // optionally followed by edited details block on next lines
    if (text.toLowerCase().startsWith('yes')) {
      const lines     = text.split('\n');
      const firstLine = lines[0].trim();
      const parts     = firstLine.split(/\s+/);
      const targetId  = Number(parts[1]);

      if (!targetId) {
        await tg('sendMessage', { chat_id: ADMIN_ID, text: '⚠️ Usage: yes <chatId>\nAdd edited details below if needed.' });
        return res.status(200).send('OK');
      }

      let userData;
      if (lines.length > 1) {
        userData = parseDetails(lines.slice(1).join('\n'));
        if (!isComplete(userData)) {
          await tg('sendMessage', { chat_id: ADMIN_ID, text: '⚠️ Edited details are incomplete. Missing fields.' });
          return res.status(200).send('OK');
        }
      } else {
        userData = await kvGet(`pending:${targetId}`);
        if (!userData) {
          await tg('sendMessage', { chat_id: ADMIN_ID, text: `⚠️ No pending request for ${targetId}.` });
          return res.status(200).send('OK');
        }
      }

      if (!userData.subject) userData.subject = 'Requesting for gate pass';

      const token = makeToken();
      await kvSet(`token:${token}`, { ...userData, chatId: targetId }, 3600); // 1 hour
      await kvDel(`pending:${targetId}`);
      await kvSet(`state:${targetId}`, 'done');

      const link = `${APP_URL}/pass?t=${token}`;

      await tg('sendMessage', {
        chat_id: targetId,
        parse_mode: 'Markdown',
        text: `✅ *Payment verified! Your gate pass is ready.*\n\n🔗 [Open Gate Pass](${link})\n\n⏱ Expires in *1 hour*\n📲 Open the link → tap ⋮ menu → *Add to Home Screen*`,
      });

      await tg('sendMessage', { chat_id: ADMIN_ID, text: `✅ Gate pass sent to ${targetId}.\n🔗 ${link}` });
      return res.status(200).send('OK');
    }

    // no <chatId> <reason>
    if (text.toLowerCase().startsWith('no')) {
      const parts    = text.split(/\s+/);
      const targetId = Number(parts[1]);
      const reason   = parts.slice(2).join(' ') || 'Payment could not be verified.';
      if (targetId) {
        await kvDel(`pending:${targetId}`);
        await kvSet(`state:${targetId}`, 'start');
        await tg('sendMessage', { chat_id: targetId, text: `❌ Request rejected.\nReason: ${reason}\n\nSend /start to try again.` });
        await tg('sendMessage', { chat_id: ADMIN_ID, text: `❌ Rejection sent to ${targetId}.` });
      }
      return res.status(200).send('OK');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // STUDENT FLOW
  // ══════════════════════════════════════════════════════════════
  const state = (await kvGet(`state:${chatId}`)) || 'start';

  // Step 1 — any first message or /start → send QR + payment info
  if (state === 'start' || text === '/start') {
    await kvSet(`state:${chatId}`, 'awaiting_screenshot');
    const QR_URL = `${APP_URL}/qr.png`;
    await tg('sendPhoto', {
      chat_id: chatId,
      photo: QR_URL,
      parse_mode: 'Markdown',
      caption:
`👋 Welcome to *GatePass SNIST*!

Scan the QR code above to pay:

━━━━━━━━━━━━━━━
💳 *Amount: ₹59*
\`gatepass@upi\`
━━━━━━━━━━━━━━━

After paying:
📸 Send the *payment screenshot* here`,
    });
    return res.status(200).send('OK');
  }

  // Step 2 — screenshot received → forward to admin, send template
  if (isPhoto && state === 'awaiting_screenshot') {
    await kvSet(`state:${chatId}`, 'awaiting_details');

    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await tg('sendPhoto', {
      chat_id: ADMIN_ID,
      photo: fileId,
      caption: `📸 Screenshot from Chat ID: \`${chatId}\``,
      parse_mode: 'Markdown',
    });

    await tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text:
`✅ Screenshot received!

Now *copy the template below*, fill in your details, and send it back 👇

\`\`\`
subject=Requesting for gate pass
name=
emailid=
monthwithdate=
reason=
branch=
time=
rollno=
\`\`\``,
    });
    return res.status(200).send('OK');
  }

  // Step 3 — filled details received → validate, store, forward to admin
  if (state === 'awaiting_details' && text.includes('=')) {
    const data = parseDetails(text);

    if (!isComplete(data)) {
      const missing = ['name','emailid','monthwithdate','reason','branch','time','rollno']
        .filter(k => !data[k]);
      await tg('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `⚠️ Missing fields: *${missing.join(', ')}*\n\nPlease resend the complete filled template.`,
      });
      return res.status(200).send('OK');
    }

    if (!data.subject) data.subject = 'Requesting for gate pass';

    await kvSet(`pending:${chatId}`, data, 86400);
    await kvSet(`state:${chatId}`, 'awaiting_approval');

    const block = Object.entries(data).map(([k,v]) => `${k}=${v}`).join('\n');
    await tg('sendMessage', {
      chat_id: ADMIN_ID,
      parse_mode: 'Markdown',
      text:
`📋 *Details — Chat ID: ${chatId}*

\`\`\`
${block}
\`\`\`

Reply:
✅ \`yes ${chatId}\` — approve as-is
✏️ \`yes ${chatId}\` + edited block below — approve with changes
❌ \`no ${chatId} reason\` — reject`,
    });

    await tg('sendMessage', {
      chat_id: chatId,
      text: `⏳ Details submitted! Waiting for admin verification.\n\nYou'll receive your gate pass link shortly.`,
    });
    return res.status(200).send('OK');
  }

  // Catch-all
  if (state === 'awaiting_approval') {
    await tg('sendMessage', { chat_id: chatId, text: `⏳ Your request is under review. Please wait.` });
  } else {
    await tg('sendMessage', { chat_id: chatId, text: `Send /start to begin.` });
  }

  return res.status(200).send('OK');
}
