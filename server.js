import express from "express";
import { startBot } from "./bot.js";

const app = express();
app.get("/", (req, res) => res.status(200).send("Bot Activo ⚖️"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`>>> Servidor activo en puerto ${PORT}`);
  startBot(); 
});