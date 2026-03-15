import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { procesarMensaje } from "./logica.js";

export async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ 
    version, 
    auth: state, 
    printQRInTerminal: false,
    defaultQueryTimeoutMs: 60000 
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;
    if (qr) {
      console.log("📱 QR DETECTADO:");
      qrcode.generate(qr, { small: true });
      console.log(`🔗 URL QR: https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qr)}`);
    }
    if (connection === "open") console.log("✅ WhatsApp conectado.");
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(() => startBot(), 10000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (msg.key.fromMe || !msg.message || msg.key.remoteJid.endsWith("@g.us")) return;
    
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
    if (!text.trim()) return;

    const replies = await procesarMensaje(from, text);
    for (const r of replies) {
      await sock.sendMessage(from, { text: r });
      await new Promise(res => setTimeout(res, 1000));
    }
  });
}