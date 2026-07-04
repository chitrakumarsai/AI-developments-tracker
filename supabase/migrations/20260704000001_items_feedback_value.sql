-- Denormalized "current vote" on each item, so feed filtering and ranking can
-- read a plain column instead of joining the append-only `feedback` history log.
-- `feedback_value` is the enum already defined in the init migration ('up'|'down');
-- NULL means the user hasn't voted on this item.
--
-- The `feedback` table remains the source-of-truth history; this column is kept
-- in sync by the write path (lib/feedback/record.ts). Phase 1 is single-user, so
-- one current vote per item is unambiguous; per-user votes arrive with Phase 2 auth.
alter table items add column if not exists feedback_value feedback_value;

-- Partial index: filters like ?state=liked / ?state=hide-down only ever look at
-- the small subset of rows that actually carry a vote.
create index if not exists items_feedback_value_idx
  on items (feedback_value)
  where feedback_value is not null;
