import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeSql} from './postgres-compat.ts';

test('converts positional question-mark parameters without changing quoted text', () => {
  assert.equal(
    normalizeSql("SELECT * FROM users WHERE id = ? AND username = '?' AND role = ?"),
    "SELECT * FROM users WHERE id = $1 AND username = '?' AND role = $2",
  );
});

test('converts SQLite INSERT OR IGNORE to PostgreSQL conflict handling', () => {
  assert.equal(
    normalizeSql('INSERT OR IGNORE INTO departments (id, name) VALUES (?, ?)'),
    'INSERT INTO departments (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
  );
});

test('handles multi-line SQL and nested parentheses', () => {
  assert.equal(
    normalizeSql("SELECT COALESCE(?, '') AS value FROM users WHERE id IN (?, ?)"),
    "SELECT COALESCE($1, '') AS value FROM users WHERE id IN ($2, $3)",
  );
});
