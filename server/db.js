// 데이터베이스
// - TURSO_DATABASE_URL 이 있으면 Turso(클라우드 SQLite, 무료)에 저장 → 무료 서버(Render)에서도 데이터 유지
// - 없으면 data/maeumgyeol.db 파일에 저장 (내 컴퓨터, Codespaces)
const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'drawings'), { recursive: true });

const REMOTE = !!process.env.TURSO_DATABASE_URL;
const client = REMOTE
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: 'file:' + path.join(DATA_DIR, 'maeumgyeol.db') });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  grp TEXT NOT NULL DEFAULT 'adult',          -- elem | middle | high | adult | teacher
  birth_year INTEGER,
  role TEXT NOT NULL DEFAULT 'client',        -- client | counselor | admin
  guardian_name TEXT, guardian_phone TEXT,
  email_results INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id TEXT NOT NULL, answers TEXT NOT NULL, score INTEGER NOT NULL,
  level TEXT NOT NULL, level_label TEXT NOT NULL, risk INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL, emailed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS drawings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL, title TEXT,
  file TEXT NOT NULL,            -- 암호화된 PNG 파일명
  meta TEXT NOT NULL,            -- 그리기 과정 지표(JSON)
  pdi_enc TEXT,                  -- 사후질문 답변(암호화)
  auto_analysis TEXT,            -- 규칙 기반 분석(JSON)
  ai_analysis TEXT,              -- AI 해석(JSON, 선택)
  counselor_note_enc TEXT, counselor_id INTEGER, client_message TEXT,
  risk INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted',  -- saved | submitted | interpreted
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  interpreted_at TEXT
);
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counselor_id INTEGER REFERENCES users(id),
  topic TEXT, status TEXT NOT NULL DEFAULT 'waiting',  -- waiting | active | closed
  risk INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL, sender_role TEXT NOT NULL,
  body_enc TEXT NOT NULL, risk INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,           -- test | chat | drawing | sos | mood
  source_id INTEGER, level INTEGER NOT NULL,   -- 1 관심 | 2 위험 | 3 긴급
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',  -- new | ack | resolved
  handled_by INTEGER, note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  target TEXT NOT NULL, reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS moods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL, note_enc TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS missions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL, mission TEXT NOT NULL,
  PRIMARY KEY (user_id, day, mission)
);
CREATE TABLE IF NOT EXISTS safety_plans (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_enc TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS staff_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL, body_enc TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL, subject TEXT NOT NULL, html TEXT NOT NULL,
  status TEXT NOT NULL, error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_results_user ON test_results(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_msgs_session ON messages(session_id);
`;

const norm = (v) => (typeof v === 'bigint' ? Number(v) : v === undefined ? null : v);
const plain = (r) => (r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, norm(v)])) : undefined);
const exec = (sql, p) => client.execute({ sql, args: p.map(norm) });

const q = {
  get: async (sql, ...p) => plain((await exec(sql, p)).rows[0]),
  all: async (sql, ...p) => (await exec(sql, p)).rows.map(plain),
  run: async (sql, ...p) => { const r = await exec(sql, p); return { changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid ?? 0) }; },
};

async function addColumn(table, col, def) {
  const cols = await q.all(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === col)) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

const ready = (async () => {
  if (!REMOTE) await client.execute('PRAGMA journal_mode = WAL');
  await client.executeMultiple(SCHEMA);
  await addColumn('drawings', 'note_shared', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn('drawings', 'image_enc', 'TEXT');
  await addColumn('chat_sessions', 'ai_active', 'INTEGER NOT NULL DEFAULT 1');
  console.log(`[DB] ${REMOTE ? 'Turso 클라우드 데이터베이스 연결' : '로컬 파일 데이터베이스 사용 (' + DATA_DIR + ')'}`);
  if (!REMOTE && process.env.RENDER) console.warn('[DB 경고] Render에서 TURSO_DATABASE_URL 없이 실행 중입니다. 서버가 재시작되면 데이터가 사라집니다!');
})();

module.exports = { q, ready, DATA_DIR, REMOTE };
