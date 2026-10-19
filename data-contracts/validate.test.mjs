import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from './validate.mjs';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const schema = read('./schemas/contracts.schema.json');
const fixtures = read('./fixtures/test-only.json');

for (const fixture of fixtures.cases) {
  test(fixture.name, () => {
    const result = validate(fixture.kind, fixture.payload, schema);
    assert.equal(result.valid, fixture.valid, JSON.stringify(result.errors));
    if (fixture.error) assert.ok(result.errors.some(e => e.path.includes(fixture.error)));
  });
}

test('schema references and keyword coverage remain supported', () => {
  const supported = new Set(['$schema', '$id', '$defs', '$ref', 'oneOf', 'type', 'properties',
    'required', 'additionalProperties', 'const', 'enum', 'format', 'pattern', 'minLength',
    'maxLength', 'minimum', 'maxItems', 'items']);
  function check(rule) {
    for (const key of Object.keys(rule)) assert.ok(supported.has(key), `Unsupported keyword ${key}`);
    if (rule.$ref) assert.ok(schema.$defs[rule.$ref.replace('#/$defs/', '')]);
    if (rule.type) assert.ok(['object', 'array', 'string', 'integer'].includes(rule.type));
    if (rule.format) assert.ok(['date-time', 'uri'].includes(rule.format));
    if (rule.pattern) new RegExp(rule.pattern, 'u');
    if (rule.required) for (const key of rule.required) assert.ok(rule.properties[key]);
    for (const child of Object.values(rule.$defs || rule.properties || {})) check(child);
    for (const child of rule.oneOf || []) check(child);
    if (rule.items) check(rule.items);
  }
  check(schema);
  assert.deepEqual(schema.oneOf.map(x => x.$ref),
    ['live', 'offline', 'stale', 'archiveEntry', 'archiveCollection'].map(x => `#/$defs/${x}`));
});

test('states are mutually exclusive and dispatch consistently', () => {
  for (const kind of ['live', 'offline', 'stale']) {
    const payload = fixtures.cases.find(x => x.kind === kind && x.valid).payload;
    assert.equal(validate('state', payload, schema).valid, true);
    for (const other of ['live', 'offline', 'stale'].filter(x => x !== kind)) {
      assert.equal(validate(other, payload, schema).valid, false);
    }
  }
});

test('freshness boundaries and inconsistent metadata', () => {
  const source = fixtures.cases.find(x => x.kind === 'stale' && x.valid).payload;
  for (const age of [59, 60, 61]) {
    const payload = structuredClone(source);
    payload.freshness.ageSeconds = age;
    payload.freshness.evaluatedAt = new Date(Date.parse(payload.lastSuccessfulCheckAt) + age * 1000).toISOString();
    assert.equal(validate('stale', payload, schema).valid, age > 60);
  }
  const payload = structuredClone(source);
  payload.freshness.ageSeconds++;
  assert.equal(validate('stale', payload, schema).valid, false);
  payload.reason = 'API_ERROR';
  payload.freshness.ageSeconds = 0;
  payload.freshness.evaluatedAt = payload.lastSuccessfulCheckAt;
  assert.equal(validate('stale', payload, schema).valid, true);
});

test('malformed and inherited property statuses return errors without throwing', () => {
  for (const status of ['toString', 'constructor', '__proto__', null, 1, [], { toString: null }]) {
    const result = validate('state', { status }, schema);
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].path, '$.status');
  }
});

test('integer validation follows the schema without an undocumented safe integer limit', () => {
  const entry = structuredClone(fixtures.cases.find(x => x.kind === 'archiveEntry').payload);
  entry.durationSeconds = 1e20;
  assert.equal(validate('archiveEntry', entry, schema).valid, true);
  entry.durationSeconds = 1.5;
  assert.equal(validate('archiveEntry', entry, schema).valid, false);
});
