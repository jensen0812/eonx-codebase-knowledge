import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import queryRouter from "./routes/query.js";
import answerRouter from "./routes/answer.js";
import reposRouter from "./routes/repos.js";

dotenv.config({ path: "../../.env" });

const app = express();
const port = parseInt(process.env.API_PORT || "3001");

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/query", queryRouter);
app.use("/answer", answerRouter);
app.use("/repos", reposRouter);

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
