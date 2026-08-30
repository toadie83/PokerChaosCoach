import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const services = [
  { name: "frontend", cwd: "pokerchaos-frontend", script: "dev" },
  { name: "stream", cwd: "pokerchaos-frontend", script: "stream" },
  { name: "backend", cwd: "pokerchaos-backend", script: "dev" },
];

const children = new Set();
let stopping = false;

function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return;

  if (isWindows) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child.kill("SIGTERM");
  }
}

function stopAll(exitCode) {
  if (stopping) return;
  stopping = true;

  for (const child of children) stopProcessTree(child);

  // Give child process trees a moment to close before ending the launcher.
  setTimeout(() => process.exit(exitCode), 750).unref();
}

for (const service of services) {
  console.log(`[startup] Starting ${service.name}...`);

  const args = isWindows
    ? ["/d", "/s", "/c", `npm run ${service.script}`]
    : ["run", service.script];
  const child = spawn(command, args, {
    cwd: path.join(root, service.cwd),
    stdio: "inherit",
  });

  children.add(child);

  child.on("error", (error) => {
    console.error(`[startup] Could not start ${service.name}: ${error.message}`);
    stopAll(1);
  });

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (stopping) return;

    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(`[startup] ${service.name} stopped (${reason}); stopping the other services.`);
    stopAll(code ?? 1);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
