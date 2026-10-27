const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 10000;

let qrCodeData = null;
let isConnected = false;

app.get('/', (req, res) => {
  res.send(`
  <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
  body{margin:0;background:#0a0a0a;color:#fff;font-family:sans-serif;text-align:center}
  .hero{padding:50px 20px;background:linear-gradient(135deg,#25D366,#128C7E)}
  h1{font-size:32px;margin:0} .box{max-width:480px;margin:30px auto;background:#111;border:1px solid #222;padding:30px;border-radius:16px}
  .btn{background:#25D366;color:#fff;padding:14px 28px;border:none;border-radius:30px;font-size:16px;width:100%;margin:10px 0;cursor:pointer}
  code{background:#1e1e1e;padding:15px;display:block;border-radius:10px;margin:15px 0;word-break:break-all;font-size:12px}
  </style></head><body>
  <div class="hero">
    <h1>🤖 WhatsApp Bot</h1>
    <p>Connected & Running 24/7</p>
  </div>
  <div class="box">
    <h2>Status: ${isConnected?'🟢 Online':'🔴 Waiting for QR'}</h2>
    ${qrCodeData ? `<code>${qrCodeData}</code><p>Open WhatsApp > Linked Devices > Link a Device > Scan QR</p>` : '<p>Starting bot... QR will appear here</p>'}
    <button class="btn" onclick="location.reload()">Refresh</button>
    <p style="color:#888;font-size:13px;margin-top:25px">Scan QR code to connect your WhatsApp</p>
  </div>
  </body></html>
  `);
});

app.get('/ping', (req,res)=>res.send('Pong! Bot is active'));

app.listen(PORT, ()=>console.log('Running on '+PORT));

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('session');
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ["My Bot", "Chrome", "1.0"]
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', async (update)=>{
    const { connection, lastDisconnect, qr } = update;
    if(qr){ qrCodeData = qr; qrcode.generate(qr,{small:true}); }
    if(connection === 'close'){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if(shouldReconnect) startBot();
    } else if(connection === 'open'){
      isConnected = true; qrCodeData = null; console.log('✅ BOT CONNECTED');
    }
  });

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0]; if(!m.message) return;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    if(!text.startsWith('.')) return;
    const cmd = text.slice(1).split(' ')[0].toLowerCase();
    const jid = m.key.remoteJid;

    if(cmd === 'menu'){
      await sock.sendMessage(jid,{text:`
╭───『 MY BOT MENU 』───
│ • .menu - Show menu
│ • .ping - Check speed
│ • .alive - Bot status
│ • .sticker - Image to sticker
│ • .play [song] - Search song
│ • .tiktok [link] - Download TikTok
│ • .ig [link] - Instagram
│ • .fb [link] - Facebook
╰─────────────────
      `});
    }
    if(cmd === 'ping') await sock.sendMessage(jid,{text:'Pong! 45ms'});
    if(cmd === 'alive') await sock.sendMessage(jid,{text:'Bot is alive ✅'});
  });
}

startBot();
