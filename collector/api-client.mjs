import { CollectorError } from './errors.mjs';

const endpoints = new Set(['channels', 'playlistItems', 'videos', 'search']);
const quota = new Set(['quotaExceeded', 'dailyLimitExceeded', 'dailyLimitExceededUnreg']);
const auth = new Set(['keyInvalid', 'authError', 'accessNotConfigured', 'ipRefererBlocked', 'forbidden']);

export function createApiClient(config, {
  fetchImpl = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  random = Math.random
} = {}) {
  return {
    async list(endpoint, params) {
      if (!endpoints.has(endpoint)) throw new CollectorError('CONFIG');
      const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
      for (const [name, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(name, String(value));
      for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        let timer;
        try {
          const controller = new AbortController();
          // Race also bounds a stalled body read; the signal aborts native fetch.
          const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new CollectorError('TIMEOUT', { retryable: true }));
            }, config.timeoutMs);
          });
          const request = (async () => {
            const response = await fetchImpl(url, { method: 'GET', redirect: 'error',
              headers: { 'X-Goog-Api-Key': config.apiKey, Accept: 'application/json' }, signal: controller.signal });
            let body;
            try { body = await response.json(); } catch { /* HTTP status still decides permanent failures. */ }
            if (!response.ok) {
              const reasons = Array.isArray(body?.error?.errors) ? body.error.errors.map(e => e?.reason) : [];
              if (reasons.some(r => quota.has(r))) throw new CollectorError('QUOTA', { status: response.status });
              if (response.status === 401 || reasons.some(r => auth.has(r))) {
                throw new CollectorError('CREDENTIALS', { status: response.status });
              }
              const retryable = response.status === 429 || [500, 502, 503, 504].includes(response.status) ||
                (response.status === 403 && reasons.some(r => ['rateLimitExceeded', 'userRateLimitExceeded'].includes(r)));
              throw new CollectorError('HTTP', { retryable, status: response.status });
            }
            if (!body || typeof body !== 'object' || !Array.isArray(body.items) || body.error ||
                (body.nextPageToken !== undefined && (typeof body.nextPageToken !== 'string' || !body.nextPageToken))) {
              throw new CollectorError('INVALID_RESPONSE', { retryable: true });
            }
            return body;
          })();
          return await Promise.race([request, timeout]);
        } catch (raw) {
          clearTimeout(timer);
          const error = raw instanceof CollectorError ? raw : new CollectorError('NETWORK', { retryable: true });
          error.attempts = attempt + 1;
          if (!error.retryable || attempt === config.maxRetries) throw error;
          const cap = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** attempt);
          await sleep(Math.floor(cap * (0.5 + Math.max(0, Math.min(1, random())) * 0.5)));
        } finally {
          clearTimeout(timer);
        }
      }
    }
  };
}
