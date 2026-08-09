-- Stores the RSS token's plaintext alongside its hash, so the admin UI can
-- display a Feed's RSS URL at any time instead of only once at
-- issue/rotation. This is a deliberate, explicit policy choice for this
-- personal single-user deployment (the admin panel itself is already
-- authenticated); the hash column remains the mechanism actually used to
-- authenticate /rss/:token.xml requests.
ALTER TABLE feeds ADD COLUMN rss_token_plaintext TEXT;
