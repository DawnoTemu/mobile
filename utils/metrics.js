import { createLogger } from './logger';

const log = createLogger('Metrics');

export const recordEvent = (name, payload = {}) => {
  try {
    log.info(name, payload);
  } catch (error) {
    // Swallow to avoid crashing the app on logging failures
  }
};

export const recordError = (name, error, payload = {}) => {
  try {
    log.error(name, { error, ...payload });
  } catch (err) {
    // ignore
  }
};

export default {
  recordEvent,
  recordError
};
