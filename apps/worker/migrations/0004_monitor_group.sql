-- Optional free-text grouping/category for organizing the Watchlist beyond
-- search (e.g. "医薬品系", "釣果情報"). NULL means ungrouped.
ALTER TABLE monitors ADD COLUMN group_name TEXT;
