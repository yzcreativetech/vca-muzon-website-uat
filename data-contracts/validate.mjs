// A validator for the documented schema subset, not a general JSON Schema engine.
export function validate(kind, payload, schema) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });
  const timestampValid = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 19) === value.slice(0, 19);
  };
  function visit(rule, value, path) {
    if (rule.$ref) {
      const name = rule.$ref.replace('#/$defs/', '');
      if (!schema.$defs[name]) throw new Error(`Unknown schema reference: ${rule.$ref}`);
      return visit(schema.$defs[name], value, path);
    }
    if ('const' in rule && value !== rule.const) add(path, `Expected ${rule.const}`);
    if (rule.enum && !rule.enum.includes(value)) add(path, `Expected one of ${rule.enum.join(', ')}`);
    const matches = !rule.type || ({
      object: value !== null && typeof value === 'object' && !Array.isArray(value),
      array: Array.isArray(value), string: typeof value === 'string',
      integer: Number.isInteger(value)
    })[rule.type];
    if (!matches) { add(path, `Expected ${rule.type}`); return; }
    if (rule.type === 'object') {
      for (const key of rule.required || []) {
        if (!Object.hasOwn(value, key)) add(`${path}.${key}`, 'Required field is missing');
      }
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(rule.properties, key)) add(`${path}.${key}`, 'Unknown field');
        else visit(rule.properties[key], value[key], `${path}.${key}`);
      }
    }
    if (rule.type === 'array') {
      if (value.length > rule.maxItems) add(path, `Maximum ${rule.maxItems} entries`);
      value.forEach((item, index) => visit(rule.items, item, `${path}[${index}]`));
    }
    if (rule.type === 'integer' && value < rule.minimum) add(path, `Minimum ${rule.minimum}`);
    if (rule.type === 'string') {
      const length = [...value].length;
      if (length < rule.minLength || length > rule.maxLength) add(path, 'String length outside allowed bounds');
      if (rule.pattern && !(new RegExp(rule.pattern, 'u')).test(value)) add(path, 'Invalid string format');
      if (rule.format === 'date-time' && !timestampValid(value)) add(path, 'Invalid UTC calendar timestamp');
      if (rule.format === 'uri') {
        try { new URL(value); } catch { add(path, 'Invalid absolute URL'); }
      }
    }
  }
  if (kind === 'state') {
    const states = { LIVE: 'live', OFFLINE: 'offline', STALE: 'stale' };
    const status = payload?.status;
    kind = typeof status === 'string' && Object.hasOwn(states, status) ? states[status] : undefined;
    if (!kind) return { valid: false, errors: [{ path: '$.status', message: 'Unsupported state status' }] };
  }
  if (!['live', 'offline', 'stale', 'archiveEntry', 'archiveCollection'].includes(kind)) {
    throw new Error(`Unsupported contract: ${kind}`);
  }
  visit(schema.$defs[kind], payload, '$');
  // Semantic rules cannot be expressed by standard JSON Schema field comparisons.
  function relationships(value, path) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.videoId === 'string' && typeof value.watchUrl === 'string' &&
        value.watchUrl !== `https://www.youtube.com/watch?v=${value.videoId}`) {
      add(`${path}.watchUrl`, 'Watch URL must match videoId');
    }
    for (const [key, child] of Object.entries(value)) relationships(child, `${path}.${key}`);
  }
  relationships(payload, '$');
  if (kind === 'stale' && errors.length === 0) {
    const f = payload.freshness;
    const age = (Date.parse(f.evaluatedAt) - Date.parse(payload.lastSuccessfulCheckAt)) / 1000;
    if (age < 0 || f.ageSeconds !== Math.floor(age)) add('$.freshness.ageSeconds', 'Must equal elapsed whole seconds since last successful check');
    if (payload.reason === 'AGE_EXCEEDED' && f.ageSeconds <= f.policy.maxAgeSeconds) {
      add('$.freshness.ageSeconds', 'AGE_EXCEEDED requires age strictly greater than policy maximum');
    }
    if (payload.lastKnownLivestream && payload.previousStatus !== 'LIVE') {
      add('$.previousStatus', 'Last known livestream requires previousStatus LIVE');
    }
  }
  return { valid: errors.length === 0, errors };
}
