import type { TransmuteConfig } from "../types";

export function createLogger(config: TransmuteConfig) {
  const enabled = config.useLogs ?? false;

  return {
    log: (...args: any[]) => {
      if (enabled) {
        console.log(...args);
      }
    },
    error: (...args: any[]) => {
      // Always show errors regardless of useLogs setting
      console.error(...args);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
