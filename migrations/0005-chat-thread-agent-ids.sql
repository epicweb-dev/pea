ALTER TABLE chat_threads ADD COLUMN agent_ids_json TEXT NOT NULL DEFAULT '[]';

UPDATE chat_threads
SET agent_ids_json = CASE
	WHEN agent_id IS NOT NULL AND trim(agent_id) != '' THEN json_array(agent_id)
	ELSE '[]'
END
WHERE agent_ids_json = '[]';
