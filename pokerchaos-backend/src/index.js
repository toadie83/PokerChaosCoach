import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { z } from "zod";
import { getAggressionPrompt } from "./openaiService.js";

dotenv.config();

const BASE_PORT = process.env.PORT ? Number(process.env.PORT) : 4011;
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .filter(Boolean);
const allowedOrigins = FRONTEND_ORIGIN.length > 0 ? FRONTEND_ORIGIN : undefined;

if (!process.env.OPENAI_API_KEY) {
  console.warn("[pokerchaos-backend] OPENAI_API_KEY is not set.");
}

const app = express();

app.use(
  cors({
    origin: allowedOrigins || true,
    credentials: false,
  })
);
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "pokerchaos-backend" });
});

const promptSchema = z.object({
  context: z.record(z.any()).optional().default({}),
  instruction: z.string().trim().max(500).optional(),
});

app.post("/prompts", async (req, res) => {
  const parsed = promptSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
  }

  try {
    const result = await getAggressionPrompt(
      parsed.data.context,
      parsed.data.instruction
    );
    return res.json(result);
  } catch (error) {
    console.error("[pokerchaos-backend] OpenAI error", error);
    return res.status(502).json({
      error: "Failed to generate ChaosCoach line. Please try again later.",
    });
  }
});

function startServer(port, attempts = 0) {
  const server = app
    .listen(port, () => {
      console.log(`pokerchaos-backend listening on http://localhost:${port}`);
    })
    .on("error", (err) => {
      if (err && err.code === "EADDRINUSE" && attempts < 5) {
        const next = port + 1;
        console.warn(
          `[pokerchaos-backend] Port ${port} in use. Retrying on ${next}...`
        );
        startServer(next, attempts + 1);
      } else {
        console.error("[pokerchaos-backend] Failed to bind port", err);
        process.exit(1);
      }
    });
  return server;
}

startServer(BASE_PORT);
