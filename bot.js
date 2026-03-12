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

const OCHO_HORAS = 8 * 60 * 60 * 1000
const ANTISPAM_TIEMPO = 3000

const conversacionesHumanasFile = "./conversaciones.json"

let conversacionesHumanas = {}
let ultimoMensaje = {}

// ===============================
// CARGAR MEMORIA
// ===============================

if (fs.existsSync(conversacionesHumanasFile)) {
  conversacionesHumanas = JSON.parse(
    fs.readFileSync(conversacionesHumanasFile)
  )
}

// ===============================
// GUARDAR MEMORIA
// ===============================

function guardarMemoria() {
  fs.writeFileSync(
    conversacionesHumanasFile,
    JSON.stringify(conversacionesHumanas, null, 2)
  )
}

// ===============================
// BOT
// ===============================

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

setTimeout(() => {
startBot()
}, 5000)

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

// ❌ ignorar mensajes antiguos al iniciar
if (msg.messageTimestamp * 1000 < Date.now() - 10000) return

const ahora = Date.now()

// ===============================
// SI EL ABOGADO ESCRIBE
// ===============================

if (msg.key.fromMe) {

conversacionesHumanas[from] = ahora
guardarMemoria()

console.log("👨‍⚖️ Conversación humana detectada")

return

}

// ===============================
// SI HAY CONVERSACION HUMANA
// ===============================

if (conversacionesHumanas[from]) {

const ultima = conversacionesHumanas[from]

if (ahora - ultima < OCHO_HORAS) {

conversacionesHumanas[from] = ahora
guardarMemoria()

console.log("⏸ Bot pausado para este cliente")

return

}

}

// ===============================
// ANTISPAM
// ===============================

if (ultimoMensaje[from]) {

if (ahora - ultimoMensaje[from] < ANTISPAM_TIEMPO) {
return
}

}

ultimoMensaje[from] = ahora

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
// RESPONDER
// ===============================

for (const r of replies) {

await sock.sendMessage(from, {
text: r
})

}

} catch (error) {

console.log("❌ Error procesando mensaje")

if (error.response) {
console.log(error.response.data)
} else {
console.log(error.message)
}

}

})

}

startBot()