import { column as c, createDatabase, table, sql } from 'remix/data-table'
import { createD1DataTableAdapter } from './d1-data-table-adapter.ts'

export const usersTable = table({
	name: 'users',
	columns: {
		id: c.integer(),
		username: c.text(),
		email: c.text(),
		password_hash: c.text(),
		created_at: c.text(),
		updated_at: c.text(),
	},
	primaryKey: 'id',
})

export const passwordResetsTable = table({
	name: 'password_resets',
	columns: {
		id: c.integer(),
		user_id: c.integer(),
		token_hash: c.text(),
		expires_at: c.integer(),
		created_at: c.text(),
	},
	primaryKey: 'id',
})

export const mockResendMessagesTable = table({
	name: 'mock_resend_messages',
	columns: {
		id: c.text(),
		token_hash: c.text(),
		received_at: c.integer(),
		from_email: c.text(),
		to_json: c.text(),
		subject: c.text(),
		html: c.text(),
		payload_json: c.text(),
	},
	primaryKey: 'id',
})

export const chatThreadsTable = table({
	name: 'chat_threads',
	columns: {
		id: c.text(),
		user_id: c.integer(),
		agent_id: c.text().nullable(),
		agent_ids_json: c.text(),
		title: c.text(),
		last_message_preview: c.text(),
		message_count: c.integer(),
		created_at: c.text(),
		updated_at: c.text(),
		deleted_at: c.text().nullable(),
	},
	primaryKey: 'id',
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at',
	},
})

export const agentsTable = table({
	name: 'agents',
	columns: {
		id: c.text(),
		name: c.text(),
		system_prompt: c.text(),
		model_preset: c.text(),
		custom_model: c.text().nullable(),
		is_active: c.integer(),
		is_default: c.integer(),
		created_at: c.text(),
		updated_at: c.text(),
		deleted_at: c.text().nullable(),
	},
	primaryKey: 'id',
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at',
	},
})

export const mockAiRequestsTable = table({
	name: 'mock_ai_requests',
	columns: {
		id: c.text(),
		token_hash: c.text(),
		received_at: c.integer(),
		scenario: c.text(),
		last_user_message: c.text(),
		tool_names_json: c.text(),
		request_json: c.text(),
		response_text: c.text(),
	},
	primaryKey: 'id',
})

export function createDb(db: D1Database) {
	return createDatabase(createD1DataTableAdapter(db), {
		now: () => new Date().toISOString(),
	})
}

export type AppDatabase = ReturnType<typeof createDb>
export { sql }
