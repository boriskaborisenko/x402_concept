import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultConfigPath = path.join(__dirname, "..", "..", "config", "config.json");

export function loadConfig(configPath = defaultConfigPath) {
  const raw = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);
  validateConfig(config);
  return config;
}

export function watchConfig(configPath, onReload) {
  fs.watchFile(configPath, () => {
    try {
      const updated = loadConfig(configPath);
      onReload(updated);
      console.log("Config reloaded successfully.");
    } catch (err) {
      console.error("Error reloading config:", err);
    }
  });
}

function validateConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Config must be a JSON object.");
  }
  if (!Array.isArray(config.networks) || config.networks.length === 0) {
    throw new Error("Config must include at least one network.");
  }
  if (!Array.isArray(config.resources) || config.resources.length === 0) {
    throw new Error("Config must include at least one resource.");
  }
  if (!config.merchants?.m_001) {
    throw new Error("Config must include merchants.m_001.");
  }
}
