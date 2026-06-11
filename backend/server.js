import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { loadConfig, watchConfig } from "./lib/config.js";
import { createState } from "./lib/state.js";
import { createApiRouter } from "./routes/api.js";
import { startSettlementWorker } from "./lib/settlement.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath =
  process.env.X402_CONFIG || path.join(__dirname, "..", "config", "config.json");
const app = express();
app.use(cors());
app.use(express.json());

const state = createState();
let config = loadConfig(configPath);

const ctx = {
  get config() {
    return config;
  },
  state
};

watchConfig(configPath, (updated) => {
  config = updated;
});

app.use("/api", createApiRouter(ctx));

startSettlementWorker(ctx);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`x402 Chain-Agnostic Backend listening on port ${PORT}`);
});
