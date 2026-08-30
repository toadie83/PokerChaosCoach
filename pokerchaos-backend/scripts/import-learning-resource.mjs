import { readFile } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";

import { parseLearningResourceDocument } from "../src/studySpots/structuredImport.js";

const args = process.argv.slice(2);
const filePath = args.find((arg) => !arg.startsWith("--"));
const commit = args.includes("--commit");
const apiBase = String(
  process.env.LEARNING_IMPORT_API_URL ||
  process.env.LEARNING_ADMIN_API_URL ||
  "http://localhost:4011",
).replace(/\/$/, "");
const token = String(
  process.env.LEARNING_IMPORT_TOKEN || process.env.LEARNING_ADMIN_TOKEN || "",
).trim();

if (!filePath) {
  console.error("Usage: npm run learning:import -- <lesson.json|lesson.md> [--commit]");
  process.exit(1);
}
if (!token) {
  console.error("Set LEARNING_IMPORT_TOKEN to an authenticated learning-import bearer token.");
  process.exit(1);
}

const absolutePath = path.resolve(filePath);
const source = await readFile(absolutePath, "utf8");
const resource = parseLearningResourceDocument(source, path.extname(absolutePath));
const endpoint = commit ? "/admin/learning/import" : "/admin/learning/import/preview";
const response = await fetch(`${apiBase}${endpoint}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ resource }),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log(commit ? "Learning resource imported." : "Learning resource preview is valid.");
console.log(JSON.stringify(payload, null, 2));
