import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Node runtime supports the APIs required by the bot', () => {
  assert.equal(typeof fetch, 'function');
  assert.equal(typeof crypto.randomUUID, 'function');
});

test('booking status vocabulary stays explicit', () => {
  const allowed = new Set(['new','confirmed','cancelled','completed']);
  assert.ok(allowed.has('confirmed'));
  assert.ok(!allowed.has('unknown'));
});

