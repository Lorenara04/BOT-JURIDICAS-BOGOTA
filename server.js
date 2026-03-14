import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fetch from "node-fetch";
// El bot.js se encarga de la conexión de WhatsApp y debe usar la carpeta montada en el Disk de Render
import "./bot.js"; 

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// ENDPOINT DE SALUD (Health Check)
// Fundamental para que Render no reinicie el servicio constantemente
// ===============================
app.get("/", (req, res) => {
  res.status(200).send("Bot Jurídicas Bogotá activo y funcionando ⚖️");
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby6yTmqBFvuAmYKSTIiLw3hVYH6iR8X2ZVKaWSlOfCPlFBDabbikMyzU6xbdFlwYU5A0g/exec";

// Memoria de sesiones
const sessions = {};

// ===============================
// UTILIDADES
// ===============================
function obtenerHoraColombia() {
  const ahora = new Date();
  const format = (options) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", ...options }).format(ahora);
  
  return { 
    hora: parseInt(format({ hour: "numeric", hour12: false })), 
    dia: format({ weekday: "short" }) 
  };
}

async function enviarAGoogleSheets(datos) {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    console.log(`Lead guardado en Google Sheets. Status: ${response.status}`);
  } catch (error) {
    console.error("Error enviando a Google Sheets:", error);
  }
}

async function detectarArea(caso) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Clasifica el caso en UNA sola área: Transporte, Laboral y Seguridad Social, Administrativo, Civil, Comercial, Familia, Penal, Seguros. Responde SOLO el nombre del área."
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

function extraerDatos(texto) {
  let nombre = "", cedula = "", correo = "", telefono = "";
  const lineas = texto.split("\n");

  lineas.forEach(linea => {
    const limpio = linea.trim();
    if (!correo && limpio.includes("@")) correo = limpio;
    if (!telefono && /3\d{9}/.test(limpio)) {
       const match = limpio.match(/3\d{9}/);
       if (match) telefono = match[0];
    }
    if (!cedula && /\d{5,15}/.test(limpio) && !limpio.startsWith("3")) {
       const match = limpio.match(/\d{5,15}/);
       if (match) cedula = match[0];
    }
    if (!nombre && /^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]{8,}$/.test(limpio)) nombre = limpio;
  });

  return { nombre, cedula, correo, telefono };
}

// ===============================
// LÓGICA DEL BOT
// ===============================
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

  if (session.estado === "BIENVENIDA") {
    session.estado = "ESPERANDO_CASO";
    return [`Bienvenido(a) a *JURÍDICAS BOGOTÁ* ⚖️\n\nSomos una firma especializada en consultoría y acompañamiento legal.\n\nPor favor, *descríbanos brevemente su situación* para asignarle el área correcta.`];
  }

  if (session.estado === "ESPERANDO_CASO") {
    if (message.length < 15) {
      return ["Para poder ayudarle, por favor descríbanos su caso con un poco más de detalle."];
    }

    const areaDetectada = await detectarArea(message);
    session.area = areaDetectada;
    session.caso = message;
    session.estado = "ESPERANDO_DATOS";

    return [
      `He identificado que su caso pertenece al área de *${areaDetectada}*.`,
      `Para que un abogado analice su situación, por favor envíenos en *un solo mensaje*:\n\n• Nombre completo\n• Cédula o NIT\n• Correo electrónico\n• Número de contacto`
    ];
  }

  if (session.estado === "ESPERANDO_DATOS") {
    const nuevosDatos = extraerDatos(message);

    if (nuevosDatos.nombre) session.datos.nombre = nuevosDatos.nombre;
    if (nuevosDatos.cedula) session.datos.cedula = nuevosDatos.cedula;
    if (nuevosDatos.correo) session.datos.correo = nuevosDatos.correo;
    if (nuevosDatos.telefono) session.datos.telefono = nuevosDatos.telefono;

    if (!session.datos.nombre || !session.datos.cedula || !session.datos.correo || !session.datos.telefono) {
      return ["Aún nos faltan algunos datos. Por favor, envíe su Nombre, Cédula, Correo y Teléfono para finalizar el registro."];
    }

    const lead = {
      area_juridica: session.area,
      nombre: session.datos.nombre,
      cedula_nit: session.datos.cedula,
      correo: session.datos.correo,
      telefono: session.datos.telefono,
      estado: "Nuevo",
      observaciones: session.caso
    };

    await enviarAGoogleSheets(lead);
    session.estado = "FINALIZADO";

    return ["¡Excelente! Hemos recibido su información.\n\nUn abogado especialista se pondrá en contacto con usted a la brevedad. Gracias por confiar en *JURÍDICAS BOGOTÁ*."];
  }

  return [];
}

// ===============================
// API CHAT
// ===============================
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

// ===============================
// INICIO SERVIDOR
// ===============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`>>> Servidor activo en puerto ${PORT}`);
});