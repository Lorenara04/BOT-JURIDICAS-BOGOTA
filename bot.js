import {
default as makeWASocket,
useMultiFileAuthState,
DisconnectReason,
fetchLatestBaileysVersion
} from "@whiskeysockets/baileys"

import qrcode from "qrcode-terminal"
import axios from "axios"

// ===============================
// CONTROL DE CONVERSACIONES
// ===============================

const conversacionesHumanas = {}
const OCHO_HORAS = 8 * 60 * 60 * 1000


async function startBot() {

const { state, saveCreds } = await useMultiFileAuthState("auth")

const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
version,
auth: state,
printQRInTerminal: false
})

sock.ev.on("creds.update", saveCreds)

sock.ev.on("connection.update", (update) => {

const { connection, qr, lastDisconnect } = update

if (qr) {
console.log("📱 Escanea el QR con WhatsApp")
qrcode.generate(qr, { small: true })
}

if (connection === "open") {
console.log("✅ WhatsApp conectado correctamente")
}

if (connection === "close") {

const reason = lastDisconnect?.error?.output?.statusCode

const shouldReconnect = reason !== DisconnectReason.loggedOut

console.log("❌ Conexión cerrada. Reconectar:", shouldReconnect)

if (shouldReconnect) {
startBot()
}

}

})


// ===============================
// MENSAJES
// ===============================

sock.ev.on("messages.upsert", async ({ messages }) => {

try {

const msg = messages[0]

if (!msg.message) return

const from = msg.key.remoteJid

// ❌ ignorar grupos
if (from.endsWith("@g.us")) return

const ahora = Date.now()

// ===============================
// SI EL MENSAJE LO ENVIA EL ABOGADO
// ===============================

if (msg.key.fromMe) {

conversacionesHumanas[from] = ahora
console.log("👨‍⚖️ Conversación humana detectada, bot pausado")

return

}


// ===============================
// SI HAY CONVERSACION HUMANA RECIENTE
// ===============================

if (conversacionesHumanas[from]) {

const ultima = conversacionesHumanas[from]

if (ahora - ultima < OCHO_HORAS) {

console.log("⏸ Bot pausado para este cliente")
return

}

}


// ===============================
// EXTRAER TEXTO
// ===============================

const text =
msg.message.conversation ||
msg.message.extendedTextMessage?.text ||
msg.message.imageMessage?.caption ||
msg.message.videoMessage?.caption

if (!text) return

console.log("📩 Mensaje recibido:", text)


// ===============================
// ENVIAR AL SERVIDOR
// ===============================

const response = await axios.post(
"https://bot-juridicas-bogota.onrender.com/chat",
{
sessionId: from,
message: text
},
{
timeout: 15000
}
)

const replies = response?.data?.messages || []

if (!replies.length) {
console.log("⚠️ No hubo respuesta del servidor")
return
}


// ===============================
// ENVIAR RESPUESTAS
// ===============================

for (const r of replies) {

await sock.sendMessage(from, {
text: r
})

}

} catch (error) {

console.log("❌ Error procesando mensaje")

if (error.response) {
console.log("Servidor respondió con error:", error.response.data)
} else {
console.log(error.message)
}

}

})

}

startBot()