const messages = {
  CONFIG: 'Collector configuration is missing or invalid.',
  CHANNEL_NOT_FOUND: 'The configured channel could not be resolved.',
  IDENTITY_MISMATCH: 'API metadata does not match the configured channel.',
  INVALID_RESPONSE: 'YouTube returned an invalid or inconsistent response.',
  QUOTA: 'YouTube API quota is exhausted; retry after quota is restored.',
  CREDENTIALS: 'YouTube API credentials were rejected.',
  HTTP: 'YouTube rejected the request.',
  NETWORK: 'YouTube could not be reached.',
  TIMEOUT: 'YouTube request timed out.',
  INDETERMINATE: 'The current livestream state could not be confirmed.',
  VALIDATION: 'Generated data failed the existing data contract.',
  STORAGE: 'Snapshot storage could not be read or updated safely.',
  SECRET: 'Output was rejected because it contained credential material.',
  INTERNAL: 'Collector failed without publishing a new snapshot.'
};

const cleanupMessages = {
  LOCK_CLOSE_FAILED: 'Snapshot lock could not be closed. Check the collector process and lock before another refresh.',
  LOCK_REMOVE_FAILED: 'Snapshot lock could not be removed. Check that no collector is running before removing the leftover lock.'
};

export function cleanupWarning(code) {
  if (!Object.hasOwn(cleanupMessages, code)) return undefined;
  return { code, message: cleanupMessages[code], phase: 'cleanup' };
}

export class CollectorError extends Error {
  constructor(code, { retryable = false, status, attempts } = {}) {
    super(messages[code] || messages.INTERNAL);
    this.name = 'CollectorError';
    this.code = Object.hasOwn(messages, code) ? code : 'INTERNAL';
    this.retryable = retryable;
    if (status !== undefined) this.status = status;
    if (attempts !== undefined) this.attempts = attempts;
  }
}

// Never include third-party messages, response bodies, URLs or exception causes.
export function safeError(error) {
  const e = error instanceof CollectorError ? error : new CollectorError('INTERNAL');
  const warnings = Array.isArray(e.cleanupWarnings)
    ? e.cleanupWarnings.map(warning => cleanupWarning(warning?.code)).filter(Boolean) : [];
  return { code: e.code, message: e.message, retryable: e.retryable,
    ...(warnings.length ? { warnings } : {}),
    ...(e.status !== undefined ? { status: e.status } : {}),
    ...(e.attempts !== undefined ? { attempts: e.attempts } : {}) };
}
