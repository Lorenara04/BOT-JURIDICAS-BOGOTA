import express from "express"
import fs from "fs"

const app = express()

function log(file,data){
fs.appendFileSync(file,data+"\n")
}

// PIXEL DE APERTURA
app.get("/open",(req,res)=>{

const id=req.query.id || "unknown"

log("stats/opens.csv",`${id},${new Date().toISOString()}`)

const pixel=Buffer.from(
"R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
"base64"
)

res.writeHead(200,{
"Content-Type":"image/gif",
"Content-Length":pixel.length
})

res.end(pixel)

})

// TRACKING DE CLICS
app.get("/click",(req,res)=>{

const id=req.query.id
const url=req.query.url

log("stats/clicks.csv",`${id},${url},${new Date().toISOString()}`)

if(url==="whatsapp"){
return res.redirect("https://wa.me/573057751870")
}

if(url==="web"){
return res.redirect("https://juridicasbogota.com/")
}

res.send("ok")

})

app.listen(3001,()=>{
console.log("Tracker funcionando en puerto 3001")
})