# EMMY HENZ BOT V6 — starter project

A small Node.js WhatsApp bot with a password-protected web dashboard and pairing-code flow.

## Requirements

- Node.js 20 or newer
- A WhatsApp account you control
- A computer for the easiest setup (Android can use Termux, but setup is less convenient)

## Run locally

1. Install Node.js 20+.
2. Extract this project and open a terminal in its folder.
3. Copy `.env.example` to `.env`.
4. Change `DASHBOARD_PASSWORD` to a strong, unique password of at least 16 characters.
5. Install dependencies and start the app:

   ```bash
   npm install
   npm start
   ```

6. Open `http://localhost:3000`. Your browser will ask for the dashboard username and password from `.env`.
7. Enter your WhatsApp phone number with country code, digits only. For Nigeria, a number beginning `080...` should be converted to international format like `23480...` (drop the leading zero).
8. In WhatsApp, open **Settings → Linked devices → Link a device → Link with phone number instead**, then enter the code shown by the dashboard.

Do not share the pairing code or the `auth_info/` folder. The folder contains the linked WhatsApp session.

## Commands

- `.menu` or `.help`
- `.ping`
- `.info`

The bot only responds to these commands when they begin with a dot. It ignores messages it sends itself.

## Deploying to a free host

Choose a host that currently supports Node.js web services and long-running WebSocket connections. Free-plan policies change, and some hosts sleep after inactivity or erase local files. WhatsApp sessions need persistent storage: configure a persistent disk/volume for `auth_info/` if the provider offers one. If persistent storage is unavailable, a redeploy/restart may require pairing again. Do not assume a free tier is suitable for a 24/7 bot.

Set these environment variables in the host dashboard (do not upload `.env`):
- `DASHBOARD_USER`
- `DASHBOARD_PASSWORD` (strong and unique)
- `BOT_NAME` (optional)
- `LOG_LEVEL` (optional)

The host should supply `PORT`; the app reads it automatically. After deployment, open the HTTPS service URL and authenticate. Pair only over HTTPS.

## Security and reliability notes

- Baileys is an unofficial WhatsApp Web client, not the official WhatsApp Business Platform. WhatsApp may change compatibility or restrict accounts for automated use.
- Never commit `.env`, `auth_info/`, pairing codes, or credentials to a public repository.
- The dashboard uses HTTP Basic Auth. Use HTTPS in production, choose a long password, and do not share the dashboard URL plus credentials.
- This starter does not include rate limiting, a database, multi-user accounts, backups, AI API keys, or admin roles. Add those before opening it to other people.
- Do not use the bot for bulk unsolicited messaging or spam.
- If you are logged out and intentionally need a fresh pairing, stop the app and back up/remove the local `auth_info/` directory, then restart and pair again. Deleting it signs the bot out of its saved session.

## Troubleshooting

- **Pair code does not appear:** inspect server terminal output; verify the number is in international format; restart and try once more.
- **Dashboard asks for login repeatedly:** check the username/password in `.env`.
- **Bot is offline after restart:** ensure `auth_info/` persists and inspect logs.
- **Dependency/API changes:** Baileys is community-maintained; consult its current documentation before upgrading.

## Next features to add

AI chat (with an API key kept server-side), stickers, group admin commands, configurable welcome messages, command permissions, and a proper database-backed dashboard.
