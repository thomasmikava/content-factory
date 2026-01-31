#!/usr/bin/env node

import path from "path";
import fs from "fs";
import { Engine } from "./core/engine";
import { TransmuteConfig } from "./types";

// Helper to load config file (supports .js/.json)
async function loadConfig(configPath: string): Promise<TransmuteConfig> {
  const absolutePath = path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found at: ${absolutePath}`);
  }

  // Dynamic import for JS files, require for JSON
  try {
    const module = require(absolutePath);
    return module.default || module;
  } catch (e) {
    throw new Error(`Failed to load config: ${e}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const configArgIndex = args.indexOf("--config");
  const configPath =
    configArgIndex !== -1
      ? args[configArgIndex + 1]
      : "content-factory.config.js";

  try {
    const config = await loadConfig(configPath);
    const engine = new Engine(config, process.cwd());
    await engine.run();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export * from "./types";
export * from "./core/engine";
