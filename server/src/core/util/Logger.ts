// Simplified Logger - console only

class LoggerClass {
  info(message: string, ...args: any[]) {
    console.log(`[INFO] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]) {
    console.warn(`[WARN] ${message}`, ...args);
  }

  error(message: string, ...args: any[]) {
    console.error(`[ERROR] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]) {
    // No-op in production
  }
}

export const Logger = new LoggerClass();
