import nodemailer from "nodemailer";
import fs from "fs";

// ==============================
// LISTA DE DESTINATARIOS
// ==============================

const correos = [
"lorenarodriguezr155@gmail.com",
"sac.garex@gmail.com",
"edgarchacon532@gmail.com",
"sac.juridicasbogota@gmail.com"
];

// ==============================
// CARGAR HTML
// ==============================

const html = fs.readFileSync("./correos/correo-transporte.html","utf8");

// ==============================
// CONFIGURAR GMAIL SMTP
// ==============================

const transporter = nodemailer.createTransport({

host: "smtp.gmail.com",
port: 587,
secure: false,

auth: {
user: "sac.juridicasbogota@gmail.com",
pass: "iohu wycf vpcb mzrz"
}

});

// ==============================
// FUNCIÓN DE ENVÍO
// ==============================

async function enviarCorreos(){

try{

for(const correo of correos){

await transporter.sendMail({

from: '"Jurídicas Bogotá" <procesos@juridicasbogota.com>',
to: correo,

replyTo: "procesos@juridicasbogota.com",

bcc: "procesos@juridicasbogota.com",

subject: "Bufete especializado en Derecho de Transporte",

html: html

});

console.log("Correo enviado a:", correo);

// pequeña pausa para evitar bloqueo
await new Promise(r => setTimeout(r, 5000));

}

console.log("Todos los correos fueron enviados");

}catch(error){

console.error("Error enviando correos:", error);

}

}

enviarCorreos();