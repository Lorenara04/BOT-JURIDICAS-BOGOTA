import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fetch from "node-fetch";
import { startBot } from "./bot.js"; 

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.status(200).send("Bot Jurídicas Bogotá activo y funcionando ⚖️");
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby6yTmqBFvuAmYKSTIiLw3hVYH6iR8X2ZVKaWSlOfCPlFBDabbikMyzU6xbdFlwYU5A0g/exec";

const sessions = {};

async function enviarAGoogleSheets(datos) {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    console.log(`Lead guardado. Status: ${response.status}`);
  } catch (error) {
    console.error("Error enviando a Google Sheets:", error);
  }
}

async function detectarArea(caso) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Clasifica en: Transporte, Laboral y Seguridad Social, Administrativo, Civil, Comercial, Familia, Penal, Seguros. Responde SOLO el nombre del área." },
        { role: "user", content: caso }
      ],
      temperature: 0
    });
    return response.choices[0].message.content.trim();
  } catch (error) { return "General"; }
}

function extraerDatos(texto) {
  let nombre = "", cedula = "", correo = "", telefono = "";
  texto.split("\n").forEach(linea => {
    const limpio = linea.trim();
    if (!correo && limpio.includes("@")) correo = limpio;
    if (!telefono && /3\d{9}/.test(limpio)) { const m = limpio.match(/3\d{9}/); if (m) telefono = m[0]; }
    if (!cedula && /\d{5,15}/.test(limpio) && !limpio.startsWith("3")) { const m = limpio.match(/\d{5,15}/); if (m) cedula = m[0]; }
    if (!nombre && /^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]{8,}$/.test(limpio)) nombre = limpio;
  });
  return { nombre, cedula, correo, telefono };
}

export async function procesarMensaje(sessionId, message) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      estado: "BIENVENIDA",
      area: "",
      caso: "",
      datos: { nombre: "", cedula: "", correo: "", telefono: "" }
    };
  }

  const session = sessions[sessionId];

  // ESTADO: CERRADO (El bot "muere" aquí)
  if (session.estado === "CERRADO") {
    return []; // No responde nada a nada
  }

  if (session.estado === "BIENVENIDA") {
    session.estado = "ESPERANDO_CASO";
    return [`Bienvenido(a) a *JURÍDICAS BOGOTÁ* ⚖️\n\nSomos una firma especializada en consultoría, auditoria y acompañamiento legal.\n\nPor favor, *descríbanos brevemente su situación* para asignarle el área correcta.`];
  }

  if (session.estado === "ESPERANDO_CASO") {
    const areaDetectada = await detectarArea(message);
    session.area = areaDetectada;
    session.caso = message;
    session.estado = "ESPERANDO_DATOS"; // Cambiado a estado intermedio

    await enviarAGoogleSheets({ area_juridica: session.area, observaciones: session.caso, estado: "En Proceso" });

    return [
      `He identificado que su caso pertenece al área de *${areaDetectada}*.\n\nPara asignarle un abogado especializado por favor nos indica la siguiente informacion:\n\n1️⃣ Nombre completo\n2️⃣ Número de cédula\n3️⃣ Correo electrónico\n4️⃣ Número de teléfono`
    ];
  }

  if (session.estado === "ESPERANDO_DATOS") {
     const nuevosDatos = extraerDatos(message);
     
     session.datos.nombre = nuevosDatos.nombre || session.datos.nombre;
     session.datos.cedula = nuevosDatos.cedula || session.datos.cedula;
     session.datos.correo = nuevosDatos.correo || session.datos.correo;
     session.datos.telefono = nuevosDatos.telefono || session.datos.telefono;
     
     await enviarAGoogleSheets({ ...session.datos, area_juridica: session.area });
     
     // Marcamos como CERRADO inmediatamente después de agradecer
     session.estado = "CERRADO"; 
     
     return ["¡Gracias! por la informacion suministrada. En breve Un abogado se pondrá en contacto con usted."];
  }

  return [];
}

app.post("/chat", async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) return res.status(400).json({ error: "Faltan datos" });

    const responses = await procesarMensaje(sessionId, message);
    res.json({ messages: responses });
  } catch (error) {
    console.error("Error en /chat:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`>>> Servidor activo en puerto ${PORT}`);
  startBot(); 
});