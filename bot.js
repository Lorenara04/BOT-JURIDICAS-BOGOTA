import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { procesarMensaje } from "./logica.js";

export async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;
    if (qr) {
      console.log("📱 QR DETECTADO:");
      qrcode.generate(qr, { small: true });
      console.log(`🔗 URL QR: https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qr)}`);
    }
    if (connection === "open") console.log("✅ Conectado.");
    if (connection === "close") setTimeout(() => startBot(), 10000);
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (msg.key.fromMe || !msg.message || msg.key.remoteJid.endsWith("@g.us")) return;
    
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (!text.trim()) return;

    const replies = await procesarMensaje(from, text);
    for (const r of replies) {
      await sock.sendMessage(from, { text: r });
      await new Promise(res => setTimeout(res, 1000));
    }
  });
}