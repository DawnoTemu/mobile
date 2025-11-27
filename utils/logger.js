// Lightweight structured logger to keep console output consistent.
// Usage: const log = createLogger('PlaybackQueue'); log.info('hydrated', payload);

const format = (level, context, args) => {
  const prefix = `[${context}]`;
  return [`${prefix} ${level}:`, ...args];
};

export const createLogger = (context = 'App') => ({
  debug: (...args) => console.debug(...format('DEBUG', context, args)),
  info: (...args) => console.info(...format('INFO', context, args)),
  warn: (...args) => console.warn(...format('WARN', context, args)),
  error: (...args) => console.error(...format('ERROR', context, args)),
});

export default createLogger;
