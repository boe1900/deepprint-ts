ALTER TABLE templates ADD COLUMN files_json TEXT DEFAULT '{}';
ALTER TABLE template_versions ADD COLUMN files_json TEXT DEFAULT '{}';
