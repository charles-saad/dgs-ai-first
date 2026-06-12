export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function createLogger(): Logger {
  return {
    info(message, context) {
      console.info(JSON.stringify({ level: 'info', message, ...(context ?? {}) }));
    },
    warn(message, context) {
      console.warn(JSON.stringify({ level: 'warn', message, ...(context ?? {}) }));
    },
    error(message, context) {
      console.error(JSON.stringify({ level: 'error', message, ...(context ?? {}) }));
    },
  };
}
