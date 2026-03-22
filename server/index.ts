import cors from "cors";
import express from "express";
import { runAudit } from "./orchestrator";
import { answerQuestion } from "./tools/llm/chatAgent";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.post("/api/audit", async (req, res) => {
  try {
    const { request } = req.body;
    const report = await runAudit(request);
    res.json({ report });
  } catch (error) {
    console.error("Audit error:", error);
    res.status(500).json({ error: "Audit failed" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { question, report, request, history } = req.body;
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

const PORT = process.env.PORT ?? 3001;
app.listen(Number(PORT), () => {
  console.log(`LeakGuard API running on http://localhost:${PORT}`);
});
