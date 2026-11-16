#!/usr/bin/env node
// Published files in docs/ are generated artifacts, not editable SSOT.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
const root=resolve(import.meta.dirname,"..");
const check=process.argv.includes("--check");
const read=p=>readFileSync(resolve(root,p),"utf8");
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
function output(path,contents){
  const full=resolve(root,path);
  if(check){if(!existsSync(full)||readFileSync(full,"utf8")!==contents){console.error("Out of sync: "+path);process.exitCode=1;}else{console.log("OK: "+path);}return;}
  mkdirSync(dirname(full),{recursive:true});writeFileSync(full,contents,"utf8");console.log("Generated: "+path);
}
const catalog=JSON.parse(read("portal/apps.json"));
if(catalog.schema_version!==1||!Array.isArray(catalog.apps))throw Error("Invalid portal app registry");
const seen=new Set();
for(const a of catalog.apps){
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.id)||seen.has(a.id))throw Error("Invalid or duplicate app id");
 seen.add(a.id);
 if(!a.path.startsWith("./")||a.path.includes("..")||a.path.includes(String.fromCharCode(92)))throw Error("Invalid public path");
 if(a.kind!=="poc"&&a.kind!=="app")throw Error("Invalid app kind");
}
const cards=catalog.apps.map(a=>`<article class="app"><span class="status">${esc(a.kind==="poc"?"Prototype / POC":"Application")}</span><h2>${esc(a.name)}</h2><p>${esc(a.description)}</p><a href="${esc(a.path)}">เปิด${a.kind==="poc"?"หน้าทดสอบ":"แอปพลิเคชัน"}</a><p><small>${esc(a.notice)}</small></p></article>`).join("\n");
const page=read("portal/index.template.html").replace("<!-- APP_LINKS -->",cards);
output("docs/index.html",page);
output("docs/qr-scanner-poc/index.html",read("apps/vehicle-contact/poc/qr-scanner/index.html"));
