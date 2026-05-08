-- Migration 003: add tool_name column to telemetry_events
--
-- Some legacy queries / external SDK clients reference
-- `telemetry_events.tool_name`.  The ORM canonical column is `model_name`,
-- but we expose `tool_name` as a mirrored column kept in sync at ingest time
-- so both names work.  This permanently fixes:
--
--   psycopg2.errors.UndefinedColumn: column telemetry_events.tool_name does not exist
--
-- Affected APIs (now safe):
--   GET /telemetry/logs
--   GET /tools/usage
--
-- Idempotent — safe to re-run.

ALTER TABLE telemetry_events
    ADD COLUMN IF NOT EXISTS tool_name VARCHAR(150);

-- Backfill historical rows from model_name
UPDATE telemetry_events
   SET tool_name = model_name
 WHERE tool_name IS NULL
   AND model_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telemetry_events_tool_name
    ON telemetry_events(tool_name);
