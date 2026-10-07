-- The placeholder archive event from 0003 is redundant now that three real
-- events exist. Remove it so the archive shows only real history.
DELETE FROM events WHERE id = 'sample-past-event';
