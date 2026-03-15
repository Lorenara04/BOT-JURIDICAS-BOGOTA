import OpenAI from "openai";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby6yTmqBFvuAmYKSTIiLw3hVYH6iR8X2ZVKaWSlOfCPlFBDabbikMyzU6xbdFlwYU5A0g/exec";

export const sessions = {};

async function enviarAGoogleSheets(datos) {
  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
  } catch (e) { console.error("Error Sheets:", e); }
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
  } catch (e) { return "General"; }
}

function extraerDatos(texto) {
  let nombre = "", cedula = "", correo = "", telefono = "";
  texto.split("\n").forEach(linea => {
    const l = linea.trim();
    if (!correo && l.includes("@")) correo = l;
    if (!telefono && /3\d{9}/.test(l)) { const m = l.match(/3\d{9}/); if (m) telefono = m[0]; }
    if (!cedula && /\d{5,15}/.test(l) && !l.startsWith("3")) { const m = l.match(/\d{5,15}/); if (m) cedula = m[0]; }
    if (!nombre && /^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]{8,}$/.test(l)) nombre = l;
  });
  return { nombre, cedula, correo, telefono };
}

export async function procesarMensaje(sessionId, message) {
  if (!sessions[sessionId]) sessions[sessionId] = { estado: "BIENVENIDA", area: "", caso: "", datos: {} };
  const s = sessions[sessionId];

  if (s.estado === "CERRADO") return [];

  if (s.estado === "BIENVENIDA") {
    s.estado = "ESPERANDO_CASO";
    return [`Bienvenido(a) a *JURÍDICAS BOGOTÁ* ⚖️\n\nSomos una firma especializada en consultoría, auditoría y acompañamiento legal.\n\nPor favor, *descríbanos brevemente su situación* para asignarle el área correcta.`];
  }

  if (s.estado === "ESPERANDO_CASO") {
    const area = await detectarArea(message);
    s.area = area; s.caso = message; s.estado = "ESPERANDO_DATOS";
    await enviarAGoogleSheets({ area_juridica: area, observaciones: message, estado: "En Proceso" });
    return [`He identificado que su caso pertenece al área de *${area}*.\n\nPara asignarle un abogado especializado por favor nos indica:\n\n1️⃣ Nombre completo\n2️⃣ Cédula\n3️⃣ Correo\n4️⃣ Teléfono`];
  }

  if (s.estado === "ESPERANDO_DATOS") {
    const d = extraerDatos(message);
    s.datos = { ...s.datos, ...d };
    await enviarAGoogleSheets({ ...s.datos, area_juridica: s.area });
    s.estado = "CERRADO";
    return ["¡Gracias! por la información suministrada. En breve un abogado se pondrá en contacto con usted."];
  }
  return [];
}