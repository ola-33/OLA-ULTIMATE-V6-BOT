import 'dotenv/config';
import express from 'express';
import pino from 'pino';
import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AUTH_DIR = path.join(ROOT, 'auth_info');
const PORT = Number(process.env.PORT || 3000);
const BOT_NAME = process.env.BOT_NAME || 'EMMY HENZ BOT V6';
const USER = process.env.DASHBOARD_USER;
const PASS = process.env.DASHBOARD_PASSWORD;

if (!USER || !PASS || PASS.length < 16 || PASS.includes('replace-with')) {
  console.error('Set DASHBOARD_USER and a strong DASHBOARD_PASSWORD (16+ characters) in .env.');
  process.exit(1);
}

await fs.mkdir(AUTH_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

// Protect the dashboard and API with HTTP Basic Authentication.
// Always use HTTPS when deployed. Never expose this service without a strong password.
app.use((req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    let decoded = '';
    try { decoded = Buffer.from(encoded, 'base64').toString('utf8'); } catch {}
    const split = decoded.indexOf(':');
    if (split >= 0) {
      const u = decoded.slice(0, split);
      const p = decoded.slice(split + 1);
      if (safeEqual(u, USER) && safeEqual(p, PASS)) return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="EMMY HENZ V6 Dashboard", charset="UTF-8"');
  return res.status(401).send('Authentication required');
});

function safeEqual(a, b) {
  // Constant-time comparison for same-length strings.
  const crypto = requireCrypto();
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function requireCrypto() {
  // Static import-free helper is unnecessary; Node's built-in module is safe here.
  return cryptoModule;
}
import cryptoModule from 'node:crypto';

const state = {
  connected: false,
  connecting: false,
  registered: false,
  lastEvent: 'Bot starting',
  startedAt: new Date().toISOString(),
  messagesHandled: 0,
  lastPairingCode: null
};

let sock;
let reconnectTimer;
let requestedPairing = false;

app.get('/api/status', (_req, res) => {
  res.json({
    botName: BOT_NAME,
    connected: state.connected,
    connecting: state.connecting,
    registered: state.registered,
    lastEvent: state.lastEvent,
    startedAt: state.startedAt,
    messagesHandled: state.messagesHandled
  });
});

app.post('/api/pair', async (req, res) => {
  const phone = String(req.body?.phone || '').replace(/[^\d]/g, '');
  if (phone.length < 8 || phone.length > 15) {
    return res.status(400).json({ error: 'Enter the full phone number with country code, digits only.' });
  }
  if (state.registered || (sock?.user && state.connected)) {
    return res.status(409).json({ error: 'This WhatsApp session is already connected.' });
  }
  try {
    await startSocket(phone);
    // Baileys emits connection updates asynchronously. The browser polls status.
    return res.json({ ok: true, message: 'Pairing requested. Wait a few seconds and check the pairing code area below.' });
  } catch (err) {
    console.error('Pairing request failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not request a pairing code. Check server logs and try again.' });
  }
});

app.post('/api/reconnect', async (_req, res) => {
  try {
    requestedPairing = false;
    await startSocket();
    res.json({ ok: true, message: 'Reconnect started.' });
  } catch {
    res.status(500).json({ error: 'Reconnect failed. Check server logs.' });
  }
});

app.get('/api/pairing-code', (_req, res) => {
  res.json({ code: state.lastPairingCode, registered: state.registered });
});

app.use(express.static(path.join(ROOT, 'public'), {
  dotfiles: 'deny',
  index: 'index.html',
  setHeaders(res) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Cache-Control', 'no-store');
  }
}));

async function startSocket(phoneForPairing) {
  if (state.connecting) return;
  state.connecting = true;
  state.lastEvent = 'Connecting to WhatsApp';
  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
      version,
      auth: authState,
      logger: pino({ level: process.env.LOG_LEVEL || 'warn' }),
      printQRInTerminal: false,
      browser: [BOT_NAME, 'Chrome', '6.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'open') {
        state.connected = true;
        state.connecting = false;
        state.registered = true;
        state.lastPairingCode = null;
        state.lastEvent = 'Connected to WhatsApp';
        console.log(`${BOT_NAME} connected.`);
      }
      if (connection === 'close') {
        state.connected = false;
        state.connecting = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        state.lastEvent = `Disconnected (${code ?? 'unknown'})`;
        if (code !== DisconnectReason.loggedOut) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            startSocket().catch((e) => console.error('Reconnect error:', e?.message || e));
          }, 3000);
        } else {
          state.registered = false;
          state.lastEvent = 'Logged out. Remove auth_info only if you intend to pair again.';
        }
      }
      if (phoneForPairing && !authState.creds.registered && !requestedPairing) {
        requestedPairing = true;
        try {
          const code = await sock.requestPairingCode(phoneForPairing);
          state.lastPairingCode = code;
          state.lastEvent = 'Pairing code generated; enter it in WhatsApp Linked Devices';
        } catch (e) {
          requestedPairing = false;
          state.lastEvent = 'Pairing-code request failed';
          console.error('Pairing code generation failed:', e?.message || e);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe || !msg.key.remoteJid) continue;
        if (msg.key.remoteJid === 'status@broadcast') continue;
        const body = getText(msg.message).trim();
        if (!body.startsWith('.')) continue;
        state.messagesHandled++;
        const command = body.split(/\s+/)[0].toLowerCase();
        const jid = msg.key.remoteJid;
        try {
          if (command === '.ping') {
            await sock.sendMessage(jid, { text: '🏓 PONG! EMMY HENZ V6 is online.' }, { quoted: msg });
          } else if (command === '.menu' || command === '.help') {
            await sock.sendMessage(jid, { text:
`╭━━━「 ${BOT_NAME} 」
┃
┃ • .menu  — Show commands
┃ • .ping  — Check bot status
┃ • .info  — Bot information
┃
╰━━━━━━━━━━━━━━━
More features coming soon 🚀` }, { quoted: msg });
          } else if (command === '.info') {
            await sock.sendMessage(jid, { text: `🤖 ${BOT_NAME}\nVersion: 6.0.0\nStatus: Online\nBuilt with Node.js` }, { quoted: msg });
          }
        } catch (e) {
          console.error('Command failed:', e?.message || e);
        }
      }
    });
  } finally {
    state.connecting = false;
  }
}

function getText(message) {
  return message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || '';
}

// On process restart, attempt to restore an existing saved session.
try {
  const creds = JSON.parse(await fs.readFile(path.join(AUTH_DIR, 'creds.json'), 'utf8'));
  if (creds?.registered) {
    requestedPairing = false;
    startSocket().catch((e) => console.error('Startup connection error:', e?.message || e));
  }
} catch {
  // First run: pairing is started from the dashboard.
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`${BOT_NAME} dashboard listening on port ${PORT}`);
});
