import express from "express";
import { startBot } from "./bot.js";
import { sessions } from "./logica.js";

const app = express();

app.get("/", (req, res) => {
  res.status(200).send("Bot Jurídicas Bogotá activo ⚖️");
});

// REINICIO DE SESIONES CADA 8 HORAS
const OCHO_HORAS_MS = 8 * 60 * 60 * 1000;
setInterval(() => {
  console.log(">>> Limpiando sesiones (8h)...");
  Object.keys(sessions).forEach(key => delete sessions[key]);
}, OCHO_HORAS_MS);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`>>> Servidor activo en puerto ${PORT}`);
  startBot(); 
}); 