import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const chromePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const outputDirectory = path.resolve("..", ".artifacts", "learning-library", "cdp");
const port = 9334;

await mkdir(outputDirectory, { recursive: true });
const chrome = spawn(chromePath, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${path.join(outputDirectory, `profile-${process.pid}`)}`,
  "about:blank",
], { stdio: "ignore" });

async function waitForDebugger() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Chrome DevTools endpoint did not start.");
}

async function capture({ name, width, height, url }) {
  const pageResponse = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: "PUT" },
  );
  const page = await pageResponse.json();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 640,
  });
  await command("Page.navigate", { url });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await command("Runtime.evaluate", {
    expression: `Promise.all([
      document.fonts?.ready,
      ...Array.from(document.images).map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          }))
    ])`,
    awaitPromise: true,
  });
  const metricsResult = await command("Runtime.evaluate", {
    expression: `JSON.stringify({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      resourceCards: document.querySelectorAll('.learning-resource-card').length,
      lessonSections: document.querySelectorAll('.learning-lesson-section').length,
      errorText: document.querySelector('.learning-state--error')?.textContent || '',
      header: (() => {
        const box = document.querySelector('.learning-library-header')?.getBoundingClientRect();
        return box ? { left: box.left, right: box.right, width: box.width } : null;
      })(),
      navigation: Object.fromEntries(['.home-brand-mark', '.home-brand-copy', '.home-menu-toggle'].map((selector) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return [selector, box ? { left: box.left, right: box.right, width: box.width } : null];
      }))
    })`,
    returnByValue: true,
  });
  const metrics = JSON.parse(metricsResult.result.value);
  const screenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outputDirectory, `${name}.png`), screenshot.data, "base64");
  socket.close();
  return metrics;
}

try {
  await waitForDebugger();
  const results = {};
  results.desktop = await capture({
    name: "learn-desktop-verified",
    width: 1440,
    height: 1000,
    url: "http://localhost:5183/learn",
  });
  results.mobile = await capture({
    name: "learn-mobile-verified",
    width: 390,
    height: 844,
    url: "http://localhost:5183/learn",
  });
  results.lessonDesktop = await capture({
    name: "lesson-desktop-verified",
    width: 1440,
    height: 1000,
    url: "http://localhost:5183/learn/best-mtt-study-workflow",
  });
  results.lessonMobile = await capture({
    name: "lesson-mobile-verified",
    width: 390,
    height: 844,
    url: "http://localhost:5183/learn/best-mtt-study-workflow",
  });
  console.log(JSON.stringify(results, null, 2));
} finally {
  chrome.kill();
}
