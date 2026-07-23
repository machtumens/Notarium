const isProd = import.meta.env.PROD;

export const logger = {
  debug: (scope: string, ...args: unknown[]) => {
    if (!isProd) console.log(`[${scope}]`, ...args);
  },
  info: (scope: string, ...args: unknown[]) => {
    if (!isProd) console.info(`[${scope}]`, ...args);
  },
  warn: (scope: string, ...args: unknown[]) => console.warn(`[${scope}]`, ...args),
  error: (scope: string, ...args: unknown[]) => console.error(`[${scope}]`, ...args),
};
