# GatePass SNIST — Telegram Bot System

## How it works

```
Student → any message → bot shows payment QR/UPI
Student → sends payment screenshot → forwarded to you (admin)
Bot     → sends template to student to fill details
Student → sends filled details → forwarded to you
You     → reply "yes <chatId>" → bot sends 1-hour gate pass link
Student → opens link → installs PWA → shows gate pass
```

---

## Setup Steps

### 1. Create Telegram Bot
- Message @BotFather → `/newbot` → get your `BOT_TOKEN`
- Get your own Telegram user ID: message @userinfobot → note your `id`

### 2. Create Upstash Redis (free)
- Go to https://upstash.com → create a Redis database (free tier)
- Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

### 3. Deploy to Vercel
- Push this folder to a GitHub repo
- Import into https://vercel.com
- Set these Environment Variables in Vercel dashboard:

| Variable | Value |
|---|---|
| `BOT_TOKEN` | From @BotFather |
| `ADMIN_TELEGRAM_ID` | Your Telegram user ID (numbers only) |
| `KV_REST_API_URL` | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Upstash Redis REST Token |
| `APP_URL` | Your Vercel app URL e.g. `https://gatepass-snist.vercel.app` |

### 4. Register Webhook (one time)
After deploying, run:
```bash
BOT_TOKEN=xxx APP_URL=https://yourapp.vercel.app node setup-webhook.mjs
```

### 5. Copy icons
Put `icon-192.png` and `icon-512.png` into the `public/` folder.

---

## Admin Commands (send in Telegram bot chat)

| Command | What it does |
|---|---|
| `yes 123456789` | Approve request with student's original details |
| `yes 123456789` + edited block below | Approve with your edits |
| `no 123456789 reason` | Reject and notify student |

### Editing details before approval:
```
yes 123456789
name=Ajith Kumar
emailid=23311A04M3@sreenidhi.edu.in
monthwithdate=Mar 30
reason=Medical emergency
branch=ECE
time=10:30 AM
rollno=23311A04M3
subject=Requesting for gate pass
```

---

## File Structure

```
gatepass-bot/
├── api/
│   ├── bot.js          ← Telegram webhook handler
│   └── pass.js         ← Serves gate pass data by token
├── public/
│   ├── pass.html       ← Gate pass page (Gmail dark theme)
│   ├── sw.js           ← Service worker for PWA install
│   ├── icon-192.png    ← App icon (copy from original project)
│   └── icon-512.png    ← App icon (copy from original project)
├── manifest.json       ← PWA manifest
├── vercel.json         ← Vercel routing config
├── package.json
└── setup-webhook.mjs   ← Run once to register Telegram webhook
```

---

## Gate Pass Link
- Link format: `https://yourapp.vercel.app/pass?t=<token>`
- Token expires in **1 hour** (stored in Upstash with TTL)
- After expiry, the page shows "Link Expired" screen
- Student installs via browser → **Add to Home Screen**
