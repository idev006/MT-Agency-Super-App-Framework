#!/usr/bin/env node
// Deployment output is ephemeral: canonical app source stays in apps/ and portal/.
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, isAbsolute, relative } from "node:path";
const root = resolve(import.meta.dirname, "..");
const out = resolve(root, process.argv[2] || "_site");
const read = p => readFileSync(resolve(root,p),"utf8");
const esc = s => String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
function insideOut(path){const rel=relative(out,path);return rel!==""&&!rel.startsWith("..")&&!isAbsolute(rel);}
function emit(path, content){const f=resolve(out,path);if(!insideOut(f))throw Error("Invalid output");mkdirSync(dirname(f),{recursive:true});writeFileSync(f,content,"utf8");}
const data=JSON.parse(read("portal/apps.json"));
if(data.schema_version!==1||!Array.isArray(data.apps))throw Error("Invalid registry");
const seen=new Set();
for(const a of data.apps){
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.id)||seen.has(a.id))throw Error("Invalid/duplicate app ID");
 seen.add(a.id);
 if(!a.path.startsWith("./")||a.path.includes("..")||a.path.includes(String.fromCharCode(92)))throw Error("Invalid link");
 if(!["poc","app"].includes(a.kind))throw Error("Invalid kind");
 if(!a.source.startsWith("apps/")||a.source.includes(".."))throw Error("Invalid source");
}
const cards=data.apps.map(a=>`<article class="app"><span class="status">${esc(a.kind==="poc"?"Prototype / POC":"Application")}</span><h2>${esc(a.name)}</h2><p>${esc(a.description)}</p><a href="${esc(a.path)}">เปิด${a.kind==="poc"?"หน้าทดสอบ":"แอปพลิเคชัน"}</a><p><small>${esc(a.notice)}</small></p></article>`).join("\n");
emit("index.html",read("portal/index.template.html").replace("<!-- APP_LINKS -->",cards));
const source="apps/vehicle-contact/poc/qr-scanner/index.html";
emit("apps/vehicle-contact/poc/qr-scanner/index.html",read(source));
const frontendDist=resolve(root,"apps/vehicle-contact/frontend/dist");
const frontendOut=resolve(out,"apps/vehicle-contact/frontend");
if(!existsSync(frontendDist))throw Error("Missing vehicle frontend dist; run npm ci and npm run build in apps/vehicle-contact/frontend first");
if(!insideOut(frontendOut))throw Error("Invalid frontend output");
cpSync(frontendDist,frontendOut,{recursive:true});
// Redirect preserved only in deployment artifact, never in committed docs/.
const target="../apps/vehicle-contact/poc/qr-scanner/";
emit("qr-scanner-poc/index.html",`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR Scanner moved</title></head><body><p>QR Scanner ย้ายตำแหน่งแล้ว <a href="${target}">เปิดหน้าใหม่</a></p></body></html>\n`);
console.log("Built Pages artifact: "+out+" from canonical sources");
