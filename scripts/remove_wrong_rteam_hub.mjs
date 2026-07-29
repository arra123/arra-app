import { createRequire } from "node:module";

const require = createRequire("C:/Claude/Work/09_Sotrudniki/package.json");
const { Client } = require("ssh2");
const password = process.env.WRONG_SERVER_SSH_PASSWORD;
if (!password) throw new Error("WRONG_SERVER_SSH_PASSWORD is required");

const conn = new Client();
await new Promise((resolve, reject) => {
  conn.once("ready", resolve).once("error", reject).connect({
    host: "147.45.97.155", port: 22, username: "root", password, readyTimeout: 30000,
  });
});

const command = [
  "test \"$(realpath -m /var/www/rteam.ru)\" = /var/www/rteam.ru",
  "systemctl disable --now rteam-hub.service 2>/dev/null || true",
  "rm -f -- /etc/systemd/system/rteam-hub.service",
  "rm -f -- /etc/nginx/sites-enabled/rteam.ru /etc/nginx/sites-available/rteam.ru",
  "rm -rf -- /var/www/rteam.ru",
  "systemctl daemon-reload",
  "nginx -t",
  "systemctl reload nginx",
  "test ! -e /var/www/rteam.ru",
  "test ! -e /etc/nginx/sites-enabled/rteam.ru",
  "test ! -e /etc/systemd/system/rteam-hub.service",
].join(" && ");

try {
  await new Promise((resolve, reject) => {
    conn.exec(command, (error, stream) => {
      if (error) return reject(error);
      let output = "";
      stream.on("data", (chunk) => { output += chunk; });
      stream.stderr.on("data", (chunk) => { output += chunk; });
      stream.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(output || `exit ${code}`)));
    });
  });
  console.log("Wrong rteam virtual host removed and nginx verified");
} finally {
  conn.end();
}
