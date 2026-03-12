import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fetch from "node-fetch";
import "./bot.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Bot Jurídicas Bogotá activo");
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby6yTmqBFvuAmYKSTIiLw3hVYH6iR8X2ZVKaWSlOfCPlFBDabbikMyzU6xbdFlwYU5A0g/exec";

const sessions = {};

// ===============================
// HORA COLOMBIA
// ===============================

function obtenerHoraColombia() {

  const ahora = new Date();

  const hora = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "numeric",
    hour12: false
  }).format(ahora);

  const dia = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short"
  }).format(ahora);

  return {
    hora: parseInt(hora),
    dia
  };

}

function fueraDeHorario() {

  const { hora, dia } = obtenerHoraColombia();

  const finDeSemana =
    dia.includes("sáb") ||
    dia.includes("dom");

  return finDeSemana || hora < 8 || hora >= 18;

}


// ===============================
// ENVIAR A GOOGLE SHEETS
// ===============================

async function enviarAGoogleSheets(datos) {

  try {

    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(datos),
    });

    console.log("Lead guardado en Google Sheets");

  } catch (error) {

    console.error("Error enviando a Google Sheets:", error);

  }

}


// ===============================
// DETECTAR AREA CON IA
// ===============================

async function detectarArea(caso) {

  try {

    const response = await openai.chat.completions.create({

      model: "gpt-4o-mini",

      messages: [
        {
          role: "system",
          content: `
Clasifica el siguiente caso en UNA sola de estas áreas:

Transporte
Laboral y Seguridad Social
Administrativo
Civil
Comercial
Familia
Penal
Seguros

Responde únicamente con el nombre del área.
`
        },
        { role: "user", content: caso }
      ],

      temperature: 0

    });

    return response.choices[0].message.content.trim();

  } catch (error) {

    console.error("Error detectando área:", error);
    return "General";

  }

}


// ===============================
// DETECTAR SALUDO
// ===============================

function esSaludo(texto) {

  const saludos = [
    "hola",
    "buenas",
    "buenos dias",
    "buenas tardes",
    "buenas noches"
  ];

  return saludos.includes(texto.toLowerCase().trim());

}


// ===============================
// EXTRAER DATOS
// ===============================

function extraerDatos(texto) {

  let nombre = "";
  let cedula = "";
  let correo = "";
  let telefono = "";

  const lineas = texto.split("\n");

  lineas.forEach(linea => {

    const limpio = linea.trim();

    if (!correo && limpio.includes("@")) {
      correo = limpio;
      return;
    }

    if (!telefono && /^3\d{9}$/.test(limpio)) {
      telefono = limpio;
      return;
    }

    if (!cedula && /^\d{4,15}$/.test(limpio) && !limpio.startsWith("3")) {
      cedula = limpio;
      return;
    }

    if (!nombre && /^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]{4,}$/.test(limpio)) {
      nombre = limpio;
    }

  });

  return { nombre, cedula, correo, telefono };

}


// ===============================
// LOGICA DEL BOT
// ===============================

export async function procesarMensaje(sessionId, message) {

  if (!sessions[sessionId]) {

    sessions[sessionId] = {
      estado: "BIENVENIDA",
      area: "",
      caso: "",
      datos: {
        nombre: "",
        cedula: "",
        correo: "",
        telefono: ""
      }
    };

  }

  const session = sessions[sessionId];

  // Evitar repetir saludo
  if (session.estado !== "BIENVENIDA" && esSaludo(message)) {
    return [];
  }


  // ===============================
  // BIENVENIDA (SOLO UN MENSAJE)
  // ===============================

  if (session.estado === "BIENVENIDA") {

    session.estado = "ESPERANDO_CASO";

    return [`
Bienvenido(a) a *JURÍDICAS BOGOTÁ* ⚖️

Somos una firma especializada en consultoría, auditoría y acompañamiento legal.

Por favor descríbanos brevemente su situación para identificar el área correspondiente.
`];

  }


  // ===============================
  // ESPERANDO CASO
  // ===============================

  if (session.estado === "ESPERANDO_CASO") {

    if (message.trim().length < 10) {

      return [
        "Para orientarlo mejor necesitamos que describa su situación jurídica."
      ];

    }

    const area = await detectarArea(message);

    session.area = area;
    session.caso = message;

    session.estado = "ESPERANDO_DATOS";

    return [`
Hemos identificado que su caso corresponde al área de *${area}*.

Para asignarle un abogado necesitamos:

• Nombre completo  
• Cédula o NIT  
• Correo electrónico  
• Número de contacto
`];

  }


  // ===============================
  // ESPERANDO DATOS
  // ===============================

  if (session.estado === "ESPERANDO_DATOS") {

    const datosExtraidos = extraerDatos(message);

    if (datosExtraidos.nombre) session.datos.nombre = datosExtraidos.nombre;
    if (datosExtraidos.cedula) session.datos.cedula = datosExtraidos.cedula;
    if (datosExtraidos.correo) session.datos.correo = datosExtraidos.correo;
    if (datosExtraidos.telefono) session.datos.telefono = datosExtraidos.telefono;

    if (
      !session.datos.nombre ||
      !session.datos.cedula ||
      !session.datos.correo ||
      !session.datos.telefono
    ) {

      return [
        "Por favor envíenos los datos faltantes: nombre completo, cédula, correo y teléfono."
      ];

    }

    const datos = {

      area_juridica: session.area,
      nombre: session.datos.nombre,
      cedula_nit: session.datos.cedula,
      correo: session.datos.correo,
      telefono: session.datos.telefono,
      estado: "Nuevo",
      observaciones: session.caso

    };

    await enviarAGoogleSheets(datos);

    session.estado = "FINALIZADO";

    return [`
Gracias por la información suministrada.

En breve uno de nuestros abogados se comunicará con usted.
`];

  }

  if (session.estado === "FINALIZADO") {
    return [];
  }

}


// ===============================
// API CHAT
// ===============================

app.post("/chat", async (req, res) => {

  try {

    const { sessionId, message } = req.body;

    const messages = await procesarMensaje(sessionId, message);

    res.json({ messages });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Error interno"
    });

  }

});


// ===============================
// SERVIDOR
// ===============================

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});