-- Notion-style workspace icons: an uploaded image (data URL) or https URL,
-- validated server-side like project icons. NULL falls back to the cube glyph.
ALTER TABLE workspaces ADD COLUMN icon TEXT;
