// 데이터베이스 (Node.js 내장 SQLite 사용 — 별도 설치 불필요, Node 22.13+)
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'drawings'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'maeumgyeol.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
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
`);

// 마이그레이션: 상담자 해석 공개 여부
if (!db.prepare('PRAGMA table_info(drawings)').all().some((c) => c.name === 'note_shared')) db.exec('ALTER TABLE drawings ADD COLUMN note_shared INTEGER NOT NULL DEFAULT 0');

if (!db.prepare('PRAGMA table_info(chat_sessions)').all().some((c) => c.name === 'ai_active')) db.exec('ALTER TABLE chat_sessions ADD COLUMN ai_active INTEGER NOT NULL DEFAULT 1');

const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

module.exports = { db, q, DATA_DIR };
