import { createRequire } from "node:module";
const require = createRequire("C:/Claude/Work/09_Sotrudniki/package.json");
const { Client } = require("ssh2");
const password = process.env.SERVER_122_PASSWORD;
if (!password) throw new Error("SERVER_122_PASSWORD is required");
const command = process.argv.slice(2).join(" ") || "hostname; uname -a";
const conn = new Client();
await new Promise((resolve, reject) => conn.once("ready", resolve).once("error", reject).connect({host:"5.42.122.102",username:"root",password,readyTimeout:30000}));
try {
  const output = await new Promise((resolve, reject) => conn.exec(command,(error,stream)=>{
    if(error) return reject(error);
    let out="";
    stream.on("data",c=>out+=c);
    stream.stderr.on("data",c=>out+=c);
    stream.on("close",code=>code===0?resolve(out):reject(new Error(out||`exit ${code}`)));
  }));
  process.stdout.write(output);
} finally { conn.end(); }
