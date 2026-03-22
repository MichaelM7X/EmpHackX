import cors from "cors";
import express from "express";
import { runAudit } from "./orchestrator";
import { answerQuestion } from "./tools/llm/chatAgent";
import { callOpenAIJson } from "./openaiClient";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const auditLimiter = new Map<string, number>();
const AUDIT_COOLDOWN_MS = 10_000;

function isRateLimited(ip: string): boolean {
  const last = auditLimiter.get(ip);
  if (last && Date.now() - last < AUDIT_COOLDOWN_MS) return true;
  auditLimiter.set(ip, Date.now());
  return false;
}

function validateAuditRequest(body: Record<string, unknown>): string | null {
  const req = body.request as Record<string, unknown> | undefined;
  if (!req || typeof req !== "object") return "Missing 'request' object in body";
  if (!req.prediction_goal || typeof req.prediction_goal !== "string") return "Missing or invalid 'prediction_goal'";
  if (!Array.isArray(req.csv_columns) || req.csv_columns.length === 0) return "Missing or empty 'csv_columns' array";
  if (typeof req.preprocessing_code !== "string") return "Missing 'preprocessing_code' string";
  return null;
}

app.post("/api/audit", async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too many requests. Please wait before starting another audit." });
    return;
  }

  const validationError = validateAuditRequest(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  try {
    const { request } = req.body;
    const report = await runAudit(request);
    res.json({ report });
  } catch (error) {
    console.error("Audit error:", error);
    res.status(500).json({ error: "Audit failed" });
  }
});

app.post("/api/audit-stream", async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too many requests. Please wait before starting another audit." });
    return;
  }

  const validationError = validateAuditRequest(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const { request } = req.body;

  const sendEvent = (type: string, data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    const report = await runAudit(request, (event) => {
      sendEvent("step", event as unknown as Record<string, unknown>);
    });
    sendEvent("complete", { report: report as unknown as Record<string, unknown> });
  } catch (error) {
    console.error("Audit stream error:", error);
    sendEvent("error", { message: "Audit failed" });
  }

  res.end();
});

app.post("/api/chat", async (req, res) => {
  try {
    const { question, report, request, history } = req.body;
    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "Missing 'question' string" });
      return;
    }
    const answer = await answerQuestion(
      question,
      report,
      request,
      history ?? [],
    );
    res.json({ answer });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Chat failed" });
  }
});

app.post("/api/classify-code", async (req, res) => {
  try {
    const { files } = req.body as {
      files: Array<{ filename: string; content: string }>;
    };

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files provided" });
      return;
    }

    if (files.length === 1) {
      res.json({
        preprocessing_code: files[0].content,
        model_training_code: null,
      });
      return;
    }

    const fileSummaries = files
      .map(
        (f, i) =>
          `--- File ${i + 1}: "${f.filename}" ---\n${f.content.slice(0, 3000)}`,
      )
      .join("\n\n");

    const result = await callOpenAIJson(
      `You classify Python files for an ML audit tool. Given multiple Python files, determine which one is the data preprocessing / feature engineering code and which one is the model training / evaluation code.

Return JSON: { "preprocessing_index": <0-based index>, "training_index": <0-based index or null> }

Rules:
- The preprocessing file typically contains: pd.read_csv, feature transforms, train_test_split, StandardScaler, encoding, etc.
- The training file typically contains: model.fit, classifier/regressor instantiation, accuracy_score, cross_val_score, etc.
- If both concerns are in a single file, set that as preprocessing_index and training_index to null.
- If you can't tell, default the first file to preprocessing and the second to training.`,
      `Classify these ${files.length} Python files:\n\n${fileSummaries}`,
    );

    const preIdx = Number(result.preprocessing_index ?? 0);
    const trainIdx =
      result.training_index != null ? Number(result.training_index) : null;

    res.json({
      preprocessing_code: files[preIdx]?.content ?? files[0].content,
      model_training_code:
        trainIdx != null ? (files[trainIdx]?.content ?? null) : null,
    });
  } catch (error) {
    console.error("Classify error:", error);
    res.status(500).json({ error: "Classification failed" });
  }
});

export default app;
