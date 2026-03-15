import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";

import qrcode from "qrcode-terminal";
import axios from "axios";

export async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    shouldIgnoreJidAlphabeticalOrder: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;
    if (qr) {
      console.log("📱 QR DETECTADO:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") console.log("✅ Bot conectado.");
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) setTimeout(() => startBot(), 10000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      
      // FILTRO CRUCIAL: Si el mensaje lo enviaste TÚ, se ignora para evitar bucles
      if (msg.key.fromMe) return;
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
      
      const from = msg.key.remoteJid;
      if (from.endsWith("@g.us")) return;

      const text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || 
                   "";

      if (!text.trim()) return;

      console.log(`📩 Mensaje de ${from}: ${text}`);

      const response = await axios.post("http://localhost:3000/chat", {
        sessionId: from,
        message: text
      }, { timeout: 10000 });

      const replies = response?.data?.messages || [];

      for (const r of replies) {
        await sock.sendMessage(from, { text: r });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error("❌ Error en bot.js:", error.message);
    }
  });
}