-- Anonymous visit statistics: how many times any player entered each grid cell.
-- No user IDs, IP addresses or per-visit timestamps are stored.
CREATE TABLE IF NOT EXISTS hex_visits (
  -- Grid cell ID from the app: H3 res-7 cell, optionally followed by a triangle path ("-2", "-231").
  cell        text        PRIMARY KEY CHECK (cell ~ '^87[0-9a-f]{13}(-[0-9][0-3]{0,2})?$'),
  visits      bigint      NOT NULL DEFAULT 0 CHECK (visits >= 0),
  first_seen  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
