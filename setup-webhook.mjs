#!/usr/bin/env node
// setup-webhook.mjs
// Run once after deploying to Vercel:
//   BOT_TOKEN=xxx APP_URL=https://yourapp.vercel.app node setup-webhook.mjs

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL   = process.env.APP_URL;

if (!BOT_TOKEN || !APP_URL) {
  console.error('Set BOT_TOKEN and APP_URL env vars first.');
  process.exit(1);
}

const webhookUrl = `${APP_URL}/api/bot`;

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message'] }),
});

const data = await res.json();
console.log('Webhook set:', data);
console.log('URL:', webhookUrl);
