-- Phase 6: tag outbox rows with the kind of mail they carry.
--
-- Existing rows are backfilled by subject so the admin console can filter
-- history. Pending rows for kinds we have stopped sending are deleted: they
-- would otherwise be delivered by the next sweep after deploy, breaking the
-- "we no longer send these" promise. Additive otherwise.

ALTER TABLE email_outbox ADD COLUMN kind TEXT NOT NULL DEFAULT 'other';

UPDATE email_outbox SET kind = 'verification'
  WHERE subject = 'Verify your NSDC account';
UPDATE email_outbox SET kind = 'waitlist'
  WHERE subject LIKE 'Waitlisted:%';
UPDATE email_outbox SET kind = 'registration_confirmation'
  WHERE subject LIKE 'Registered:%';
UPDATE email_outbox SET kind = 'event_reminder'
  WHERE subject LIKE 'Reminder:%';
UPDATE email_outbox SET kind = 'recruitment_decision'
  WHERE subject LIKE 'NSDC recruitment:%';
UPDATE email_outbox SET kind = 'test'
  WHERE subject = 'NSDC email test';

DELETE FROM email_outbox
  WHERE status = 'pending'
    AND kind IN ('registration_confirmation', 'event_reminder');
