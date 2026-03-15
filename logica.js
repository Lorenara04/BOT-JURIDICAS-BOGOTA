import OpenAI from "openai";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby6yTmqBFvuAmYKSTIiLw3hVYH6iR8X2ZVKaWSlOfCPlFBDabbikMyzU6xbdFlwYU5A0g/exec";

export const sessions = {};

/**
 * Valida si el momento actual está dentro del horario laboral de Bogotá
 */
function estaEnHorarioLaboral() {
  const ahora = new Date();
  // Forzamos la hora de Colombia sin importar dónde esté el servidor
  const fechaBogota = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  
  const dia = fechaBogota.getDay(); // 0=Domingo, 6=Sábado
  const hora = fechaBogota.getHours();

  // Lunes (1) a Viernes (5) | 8:00 AM (8) a 6:00 PM (18)
  const esDiaLaboral = (dia >= 1 && dia <= 5);
  const esHoraLaboral = (hora >= 8 && hora < 18);

  return esDiaLaboral && esHoraLaboral;
}

async function enviarAGoogleSheets(datos) {
  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
  } catch (e) { 
    console.error("Error enviando a Google Sheets:", e); 
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
  } catch (e) { 
    return "General"; 
  }
}

function extraerDatos(texto) {
  let nombre = "", cedula = "", correo = "", telefono = "";
  texto.split("\n").forEach(linea => {
    const l = linea.trim();
    if (!correo && l.includes("@")) correo = l;
    if (!telefono && /3\d{9}/.test(l)) { 
      const m = l.match(/3\d{9}/); 
      if (m) telefono = m[0]; 
    }
    if (!cedula && /\d{5,15}/.test(l) && !l.startsWith("3")) { 
      const m = l.match(/\d{5,15}/); 
      if (m) cedula = m[0]; 
    }
    if (!nombre && /^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]{8,}$/.test(l)) nombre = l;
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

  const s = sessions[sessionId];

  // Si el caso ya se cerró, no respondemos más para no ser intrusivos
  if (s.estado === "CERRADO") return [];

  if (s.estado === "BIENVENIDA") {
    s.estado = "ESPERANDO_CASO";
    
    let bienvenida = `Bienvenido(a) a *JURÍDICAS BOGOTÁ* ⚖️\n\nSomos especialistas en consultoría, auditoría y representación legal integral.`;
    
    // Agregamos el aviso de horario si corresponde
    if (!estaEnHorarioLaboral()) {
      bienvenida += `\n\nLe informamos que nuestro horario laboral es de lunes a viernes de 8am a 6pm. Sin embargo, tomaremos sus datos para que un abogado se contacte con usted lo más pronto posible.`;
    }

    bienvenida += `\n\nPor favor, *descríbanos brevemente su situación* para asignarle el área correcta.`;
    return [bienvenida];
  }

  if (s.estado === "ESPERANDO_CASO") {
    const area = await detectarArea(message);
    s.area = area;
    s.caso = message;
    s.estado = "ESPERANDO_DATOS";
    
    // Guardado inicial del caso
    await enviarAGoogleSheets({ area_juridica: s.area, observaciones: s.caso, estado: "En Proceso" });
    
    return [`He identificado que su caso pertenece al área de *${area}*.\n\nPara asignarle un abogado especializado, por favor indíquenos:\n\n1️⃣ Nombre completo\n2️⃣ Número de cédula\n3️⃣ Correo electrónico\n4️⃣ Número de teléfono`];
  }

  if (s.estado === "ESPERANDO_DATOS") {
    const nuevosDatos = extraerDatos(message);
    
    // Actualizamos solo lo que el bot logre extraer
    s.datos.nombre = nuevosDatos.nombre || s.datos.nombre;
    s.datos.cedula = nuevosDatos.cedula || s.datos.cedula;
    s.datos.correo = nuevosDatos.correo || s.datos.correo;
    s.datos.telefono = nuevosDatos.telefono || s.datos.telefono;
    
    // Guardado final con datos del cliente
    await enviarAGoogleSheets({ ...s.datos, area_juridica: s.area });
    
    s.estado = "CERRADO";
    
    let despedida = "Agradecemos la información suministrada.";
    
    if (!estaEnHorarioLaboral()) {
      despedida += " Como estamos fuera de horario, un abogado se pondrá en contacto con usted lo más pronto posible.";
    } else {
      despedida += " En breve un abogado se pondrá en contacto con usted.";
    }
    
    return [despedida];
  }

  return [];
}