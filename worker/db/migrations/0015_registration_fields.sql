ALTER TABLE registrations ADD COLUMN student_name TEXT;
ALTER TABLE registrations ADD COLUMN reg_number TEXT;
ALTER TABLE registrations ADD COLUMN user_type TEXT NOT NULL DEFAULT 'guest';
CREATE INDEX IF NOT EXISTS idx_registrations_event_reg_number ON registrations(event_id, reg_number);