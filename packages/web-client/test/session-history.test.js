'use strict';
/**
 * Unit tests for session history functionality
 * Run: node packages/web-client/test/session-history.test.js
 */

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

console.log('\n📜 Session History Unit Tests\n');

// Mock localStorage
const mockStorage = new Map();
global.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

const RECENT_SESSIONS_STORAGE_KEY = 'bb_recent_sessions';
const MAX_RECENT_SESSIONS = 10;

function getRecentSessions() {
  try {
    const raw = localStorage.getItem(RECENT_SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map(function (item) {
        if (typeof item === 'string' && item.trim()) {
          return { id: item.trim(), timestamp: Date.now() };
        }
        if (item && typeof item.id === 'string' && item.id.trim()) {
          return {
            id: item.id.trim(),
            timestamp:
              typeof item.timestamp === 'number'
                ? item.timestamp
                : Date.now()
          };
        }
        return null;
      })
      .filter(Boolean);

    const seen = new Set();
    const unique = [];
    for (const entry of normalized) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        unique.push(entry);
      }
    }
    return unique.slice(0, MAX_RECENT_SESSIONS);
  } catch (_e) {
    return [];
  }
}

function saveRecentSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return;
  const trimmed = sessionId.trim();
  if (!trimmed) return;

  try {
    const existing = getRecentSessions();
    const filtered = existing.filter(function (s) {
      return s.id !== trimmed;
    });
    filtered.unshift({ id: trimmed, timestamp: Date.now() });
    const toStore = filtered.slice(0, MAX_RECENT_SESSIONS);
    localStorage.setItem(
      RECENT_SESSIONS_STORAGE_KEY,
      JSON.stringify(toStore)
    );
  } catch (_e) {
    // ignore
  }
}

function removeRecentSession(sessionId) {
  if (!sessionId) return;
  try {
    const existing = getRecentSessions();
    const filtered = existing.filter(function (s) {
      return s.id !== sessionId;
    });
    localStorage.setItem(
      RECENT_SESSIONS_STORAGE_KEY,
      JSON.stringify(filtered)
    );
  } catch (_e) {
    // ignore
  }
}

function clearRecentSessions() {
  try {
    localStorage.removeItem(RECENT_SESSIONS_STORAGE_KEY);
  } catch (_e) {
    // ignore
  }
}

function formatRelativeTime(timestamp, now = Date.now()) {
  if (!timestamp) return '';
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 60) {
    return 'just now';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d`;
  }
  return `${diffDays}d`;
}

// Tests
test('returns empty array when storage is empty', () => {
  mockStorage.clear();
  const res = getRecentSessions();
  assert.deepStrictEqual(res, []);
});

test('saves a session ID and retrieves it', () => {
  mockStorage.clear();
  saveRecentSession('session-123');
  const res = getRecentSessions();
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].id, 'session-123');
  assert(typeof res[0].timestamp === 'number');
});

test('deduplicates existing session ID and moves to top', () => {
  mockStorage.clear();
  saveRecentSession('session-1');
  saveRecentSession('session-2');
  saveRecentSession('session-1');
  const res = getRecentSessions();
  assert.strictEqual(res.length, 2);
  assert.strictEqual(res[0].id, 'session-1');
  assert.strictEqual(res[1].id, 'session-2');
});

test('limits history to max items', () => {
  mockStorage.clear();
  for (let i = 1; i <= 15; i++) {
    saveRecentSession(`session-${i}`);
  }
  const res = getRecentSessions();
  assert.strictEqual(res.length, 10);
  assert.strictEqual(res[0].id, 'session-15');
  assert.strictEqual(res[9].id, 'session-6');
});

test('ignores empty or non-string inputs', () => {
  mockStorage.clear();
  saveRecentSession('');
  saveRecentSession('   ');
  saveRecentSession(null);
  saveRecentSession(undefined);
  saveRecentSession(123);
  const res = getRecentSessions();
  assert.strictEqual(res.length, 0);
});

test('handles legacy array of strings', () => {
  mockStorage.clear();
  mockStorage.set(RECENT_SESSIONS_STORAGE_KEY, JSON.stringify(['legacy-1', 'legacy-2']));
  const res = getRecentSessions();
  assert.strictEqual(res.length, 2);
  assert.strictEqual(res[0].id, 'legacy-1');
  assert.strictEqual(res[1].id, 'legacy-2');
});

test('removes a specific session by ID', () => {
  mockStorage.clear();
  saveRecentSession('session-a');
  saveRecentSession('session-b');
  saveRecentSession('session-c');
  removeRecentSession('session-b');
  const res = getRecentSessions();
  assert.strictEqual(res.length, 2);
  assert.strictEqual(res.some(s => s.id === 'session-b'), false);
  assert.strictEqual(res[0].id, 'session-c');
  assert.strictEqual(res[1].id, 'session-a');
});

test('clears all sessions', () => {
  mockStorage.clear();
  saveRecentSession('session-x');
  saveRecentSession('session-y');
  clearRecentSessions();
  const res = getRecentSessions();
  assert.strictEqual(res.length, 0);
});

test('formats relative times correctly', () => {
  const now = 10000000;
  assert.strictEqual(formatRelativeTime(now - 30 * 1000, now), 'just now');
  assert.strictEqual(formatRelativeTime(now - 120 * 1000, now), '2m');
  assert.strictEqual(formatRelativeTime(now - 3600 * 1000 * 3, now), '3h');
  assert.strictEqual(formatRelativeTime(now - 86400 * 1000 * 4, now), '4d');
});

console.log(`========================================`);
console.log(`Passed: ${passed}/${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
