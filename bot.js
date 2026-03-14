import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys"

import qrcode from "qrcode-terminal"
import axios from "axios"
import fs from "fs"

// ===============================
// CONFIGURACIONES
// ===============================

// 5 minutos para pruebas (como pediste)
const OCHO_HORAS = 5 * 60 * 1000 
const ANTISPAM_TIEMPO = 3000
const conversacionesHumanasFile = "./conversaciones.json"

let conversacionesHumanas = {}
let ultimoMensaje = {}

// ===============================
// CARGAR MEMORIA (CON SEGURIDAD)
// ===============================
if (fs.existsSync(conversacionesHumanasFile)) {
  try {
    conversacionesHumanas = JSON.parse(fs.readFileSync(conversacionesHumanasFile))
  } catch (e) {
    console.log("⚠️ Error leyendo conversaciones.json, iniciando vacío");
    conversacionesHumanas = {};
  }
}

// ===============================
// GUARDAR MEMORIA
// ===============================
function guardarMemoria() {
  try {
    fs.writeFileSync(conversacionesHumanasFile, JSON.stringify(conversacionesHumanas, null, 2))
  } catch (e) {
    console.error("❌ Error guardando memoria:", e);
  }
}

// ===============================
// BOT
// ===============================
async function startBot() {
  // Carpeta 'auth' que prometiste no borrar
  const { state, saveCreds } = await useMultiFileAuthState("auth")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    // Ajuste para evitar que la conexión se cuelgue en la nube
    defaultQueryTimeoutMs: 60000, 
    connectTimeoutMs: 60000
  })

  // Guardar credenciales cada vez que se actualicen
  sock.ev.on("creds.update", saveCreds)

  // ===============================
  // CONEXION
  // ===============================
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) {
      console.log("📱 NUEVO QR DETECTADO (Escanea si la sesión expiró):")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("✅ WhatsApp conectado correctamente en Render")
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode
      console.log("❌ Conexión cerrada. Razón:", reason)

      // Si la sesión es inválida (401), ahí sí tendrías que volver a pedir QR, 
      // pero mientras sea otro error, reintentamos:
      if (reason === 401 || reason === 440) {
        console.log("⚠️ SESIÓN INVÁLIDA O REEMPLAZADA. Revisa la carpeta auth.");
        return;
      }

      const shouldReconnect = reason !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        console.log("🔄 Reconectando en 10 segundos...");
        setTimeout(() => startBot(), 10000)
      }
    }
  });

  // ===============================
  // MENSAJES
  // ===============================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') return

      const from = msg.key.remoteJid
      if (from.endsWith("@g.us")) return

      // Ignorar mensajes de hace más de 30 segundos (evita spam al conectar)
      const ahora = Date.now()
      if (msg.messageTimestamp * 1000 < ahora - 30000) return

      // ===============================
      // DETECTAR SI ESCRIBE EL ABOGADO (Humano)
      // ===============================
      if (msg.key.fromMe) {
        conversacionesHumanas[from] = ahora
        guardarMemoria()
        console.log(`👨‍⚖️ Abogado respondió a ${from}. Bot pausado ${OCHO_HORAS / 60000} min.`)
        return
      }

      // ===============================
      // VALIDAR PAUSA DEL BOT
      // ===============================
      if (conversacionesHumanas[from]) {
        const ultimaActividadHumana = conversacionesHumanas[from]
        if (ahora - ultimaActividadHumana < OCHO_HORAS) {
          console.log(`⏸ Bot pausado para ${from} (Atención humana activa)`)
          return
        }
      }

      // ===============================
      // ANTISPAM
      // ===============================
      if (ultimoMensaje[from] && ahora - ultimoMensaje[from] < ANTISPAM_TIEMPO) return
      ultimoMensaje[from] = ahora

      // ===============================
      // EXTRAER TEXTO
      // ===============================
      const text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || 
                   ""

      if (!text.trim()) return
      console.log(`📩 Mensaje de ${from}: ${text}`)

      // ===============================
      // ENVIAR AL SERVER (Usa localhost para evitar fallos de red en Render)
      // ===============================
      const PORT = process.env.PORT || 10000;
      const response = await axios.post(`http://localhost:${PORT}/chat`, {
        sessionId: from,
        message: text
      }, { timeout: 20000 });

      const replies = response?.data?.messages || []

      // ===============================
      // ENVIAR RESPUESTAS
      // ===============================
      for (const r of replies) {
        await sock.sendMessage(from, { text: r })
        // Pequeño delay entre mensajes para que parezca más natural
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      console.error("❌ Error en bot.js:", error.message)
    }
  })
}

// Iniciar
startBot()