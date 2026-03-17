CREATE TABLE IF NOT EXISTS agents (
	id TEXT PRIMARY KEY NOT NULL,
	name TEXT NOT NULL,
	system_prompt TEXT NOT NULL,
	model_preset TEXT NOT NULL DEFAULT 'env-default',
	custom_model TEXT,
	is_active INTEGER NOT NULL DEFAULT 1,
	is_default INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	deleted_at TEXT
);

INSERT OR IGNORE INTO agents (
	id,
	name,
	system_prompt,
	model_preset,
	custom_model,
	is_active,
	is_default
) VALUES (
	'default-agent',
	'Default agent',
	'You are a helpful assistant inside pea. Use MCP tools when they provide a more reliable or interactive result than freeform text. When a tool is useful, call it instead of guessing.',
	'env-default',
	NULL,
	1,
	1
);

ALTER TABLE chat_threads ADD COLUMN agent_id TEXT;

UPDATE chat_threads
SET agent_id = 'default-agent'
WHERE agent_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_agents_default_active
	ON agents(is_default, is_active)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agents_active_name
	ON agents(is_active, name)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_threads_agent_id
	ON chat_threads(agent_id);
