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
      // Dibujo en consola para referencia local
      qrcode.generate(qr, { small: true });
      // URL para ver el QR perfecto en navegador (Render-friendly)
      console.log("🔗 ESCANEA ESTA URL EN TU NAVEGADOR PARA EL QR:");
      console.log(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qr)}`);
    }

    if (connection === "open") {
      console.log("✅ WhatsApp conectado y activo.");
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      // Reconectar si no es cierre manual (logout)
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(() => startBot(), 10000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      
      // FILTRO: Ignorar mensajes del bot y notificaciones de sistema
      if (msg.key.fromMe) return;
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
      
      const from = msg.key.remoteJid;
      // FILTRO: Ignorar grupos
      if (from.endsWith("@g.us")) return;

      const text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || 
                   "";

      if (!text.trim()) return;

      console.log(`📩 Recibiendo mensaje de ${from}: ${text}`);

      // Conexión al servidor local
      const response = await axios.post("http://localhost:3000/chat", {
        sessionId: from,
        message: text
      }, { timeout: 10000 });

      const replies = response?.data?.messages || [];

      // Envío de respuestas al cliente
      for (const r of replies) {
        await sock.sendMessage(from, { text: r });
        await new Promise(resolve => setTimeout(resolve, 1500)); // Delay para evitar bloqueos
      }
    } catch (error) {
      console.error("❌ Error en bot.js:", error.message);
    }
  });
}