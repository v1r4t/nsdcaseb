-- Phase 1 auth schema for the NSDC club site.
-- Apply with: wrangler d1 execute <db> --file=worker/db/migrations/0001_auth.sql

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  is_executive INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
