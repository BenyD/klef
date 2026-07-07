-- Optional per-project icon: an https URL (site favicon, GitHub avatar, or a
-- direct image link) or a small data: URL from an upload. Plaintext metadata
-- like names; rendered with a fallback to the framework icon.
ALTER TABLE projects ADD COLUMN icon TEXT;
