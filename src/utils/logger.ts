const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

function log(level: Level, ...args: unknown[]) {
  const currentLevel: Level = (process.env.DOCS_GEN_LOG_LEVEL as Level) || 'info';
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  const prefix = `[aiwiki:${level}]`;
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
};
