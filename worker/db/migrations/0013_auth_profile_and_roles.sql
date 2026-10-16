-- Accounts: add profile fields required for registration capture + role rename.
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN mobile TEXT;
ALTER TABLE users ADD COLUMN reg_number TEXT;
UPDATE users SET name = COALESCE(NULLIF(name, ''), 'Unknown'), mobile = COALESCE(mobile, ''), role = CASE WHEN role = 'admin' THEN 'ob' ELSE role END;
CREATE INDEX IF NOT EXISTS idx_users_reg_number ON users(reg_number);