import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fetch from "node-fetch";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const GOOGLE_SCRIPT_URL =
"https://script.google.com/macros/s/AKfycby6yTmqBFvuAmYKSTIiLw3hVYH6iR8X2ZVKaWSlOfCPlFBDabbikMyzU6xbdFlwYU5A0g/exec";

const sessions = {};


// ===============================
// HORARIO LABORAL
// ===============================

function fueraDeHorario() {

  const ahora = new Date();

  const dia = ahora.getDay(); 
  const hora = ahora.getHours();

  const esFinDeSemana = dia === 0 || dia === 6;

  const fueraHorario = hora < 8 || hora >= 18;

  return esFinDeSemana || fueraHorario;

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

    console.log("✅ Datos enviados a Google Sheets");

  } catch (error) {

    console.error("❌ Error enviando a Google Sheets:", error);

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

Responde únicamente con el nombre exacto del área.
`,
        },
        { role: "user", content: caso },
      ],

      temperature: 0,

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

async function procesarMensaje(sessionId, message) {

  if (!sessions[sessionId]) {

    sessions[sessionId] = {
      estado: "BIENVENIDA",
      areaDetectada: "",
      caso: "",
    };

  }

  const session = sessions[sessionId];


  // ===============================
  // BIENVENIDA
  // ===============================

  if (session.estado === "BIENVENIDA") {

    session.estado = "ESPERANDO_CASO";

    if (fueraDeHorario()) {

      return [

`Gracias por comunicarse con JURÍDICAS BOGOTÁ ⚖️`,

`Nuestro horario de atención es de lunes a viernes de 8:00 AM a 6:00 PM.`,

`Mientras tanto podemos registrar su caso.`,

`Por favor descríbanos brevemente su situación jurídica.`

      ];

    }

    return [

`Bienvenido(a) a JURÍDICAS BOGOTÁ ⚖️
Somos una firma especializada en defensa y acompañamiento legal.`,

`Por favor descríbanos brevemente su situación para identificar el área correspondiente.`

    ];

  }


  // ===============================
  // ESPERANDO CASO
  // ===============================

  if (session.estado === "ESPERANDO_CASO") {

    if (esSaludo(message) || message.trim().length < 10) {

      return [
        "Para orientarlo mejor necesitamos que describa su situación jurídica."
      ];

    }

    const area = await detectarArea(message);

    session.areaDetectada = area;
    session.caso = message;

    session.estado = "ESPERANDO_DATOS";

    return [

`Hemos identificado que su caso corresponde al área de ${area}.

Para asignarle un abogado necesitamos:

• Nombre completo
• Cédula o NIT
• Correo electrónico
• Número de contacto`

    ];

  }


  // ===============================
  // ESPERANDO DATOS
  // ===============================

  if (session.estado === "ESPERANDO_DATOS") {

    const datosExtraidos = extraerDatos(message);

    const estadoLead = fueraDeHorario() ? "Fuera de horario" : "Nuevo";

    const datos = {

      area_juridica: session.areaDetectada,
      nombre: datosExtraidos.nombre,
      cedula_nit: datosExtraidos.cedula,
      correo: datosExtraidos.correo,
      telefono: datosExtraidos.telefono,
      estado: estadoLead,
      observaciones: session.caso

    };

    await enviarAGoogleSheets(datos);

    session.estado = "FINALIZADO";

    return [

"Gracias por la información suministrada.",

fueraDeHorario()
? "Un abogado revisará su caso y se comunicará con usted en el próximo horario laboral."
: "En breve uno de nuestros abogados se comunicará con usted."

    ];

  }


  // ===============================
  // FINALIZADO
  // ===============================

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

    if (!sessionId || !message) {

      return res.status(400).json({
        error: "sessionId y message son requeridos"
      });

    }

    const messages = await procesarMensaje(sessionId, message);

    res.json({ messages });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Error interno del servidor"
    });

  }

});


// ===============================
// WEBHOOK WHATSAPP
// ===============================

app.post("/whatsapp", async (req, res) => {

  try {

    const sessionId = req.body.From;
    const message = req.body.Body;

    const messages = await procesarMensaje(sessionId, message);

    let twiml = "<Response>";

    if (messages && messages.length > 0) {

      messages.forEach((msg) => {
        twiml += `<Message>${msg}</Message>`;
      });

    }

    twiml += "</Response>";

    res.type("text/xml");
    res.send(twiml);

  } catch (error) {

    console.error(error);

    res.type("text/xml");

    res.send(`
<Response>
<Message>Ocurrió un error procesando su solicitud.</Message>
</Response>
`);

  }

});


// ===============================
// SERVIDOR
// ===============================

app.listen(3000, () => {

  console.log("🚀 Servidor corriendo en puerto 3000");

});