import {
default as makeWASocket,
useMultiFileAuthState,
DisconnectReason,
fetchLatestBaileysVersion
} from "@whiskeysockets/baileys"

import qrcode from "qrcode-terminal"
import axios from "axios"

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

sock.ev.on("messages.upsert", async ({ messages }) => {

try {

const msg = messages[0]

if (!msg.message) return
if (msg.key.fromMe) return

const from = msg.key.remoteJid

const text =
msg.message.conversation ||
msg.message.extendedTextMessage?.text ||
msg.message.imageMessage?.caption ||
msg.message.videoMessage?.caption

if (!text) return

console.log("📩 Mensaje recibido:", text)

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