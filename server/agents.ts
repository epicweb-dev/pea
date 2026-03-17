import { agentsTable, createDb } from '#worker/db.ts'
import { type ManagedChatAgent } from '#shared/chat.ts'

export const defaultManagedChatAgentId = 'default-agent'
export const defaultManagedChatAgentSystemPrompt = [
	'You are a helpful assistant inside pea.',
	'Use MCP tools when they provide a more reliable or interactive result than freeform text.',
	'When a tool is useful, call it instead of guessing.',
].join(' ')

function normalizeAgentName(value: string) {
	return value.trim().slice(0, 120)
}

function normalizeSystemPrompt(value: string) {
	return value.trim()
}

function normalizeModelPreset(value: string) {
	const trimmed = value.trim()
	return trimmed || 'env-default'
}

function normalizeCustomModel(value: string | null | undefined) {
	const trimmed = value?.trim() ?? ''
	return trimmed ? trimmed : null
}

function toManagedChatAgent(record: {
	id: string
	name: string
	system_prompt: string
	model_preset: string
	custom_model?: string | null
	is_active: number
	is_default: number
	created_at: string
	updated_at: string
	deleted_at?: string | null
}): ManagedChatAgent {
	return {
		id: record.id,
		name: record.name,
		systemPrompt: record.system_prompt,
		modelPreset: record.model_preset,
		customModel: record.custom_model ?? null,
		isActive: record.is_active === 1,
		isDefault: record.is_default === 1,
		createdAt: record.created_at,
		updatedAt: record.updated_at,
		deletedAt: record.deleted_at ?? null,
	}
}

function toDeletedAtTimestamp() {
	return new Date().toISOString()
}

export function createAgentsStore(db: D1Database) {
	const database = createDb(db)

	async function getRecordById(id: string) {
		return database.findOne(agentsTable, {
			where: { id },
		})
	}

	async function getNextDefaultCandidate(excludingId: string) {
		const result = await db
			.prepare(
				`
					SELECT
						id,
						name,
						system_prompt,
						model_preset,
						custom_model,
						is_active,
						is_default,
						created_at,
						updated_at,
						deleted_at
					FROM agents
					WHERE deleted_at IS NULL
						AND is_active = 1
						AND id != ?
					ORDER BY updated_at DESC
					LIMIT 1
				`,
			)
			.bind(excludingId)
			.first<{
				id: string
				name: string
				system_prompt: string
				model_preset: string
				custom_model?: string | null
				is_active: number
				is_default: number
				created_at: string
				updated_at: string
				deleted_at?: string | null
			}>()
		return result ?? null
	}

	return {
		async list() {
			const result = await db
				.prepare(
					`
						SELECT
							id,
							name,
							system_prompt,
							model_preset,
							custom_model,
							is_active,
							is_default,
							created_at,
							updated_at,
							deleted_at
						FROM agents
						WHERE deleted_at IS NULL
						ORDER BY is_default DESC, updated_at DESC, name COLLATE NOCASE ASC
					`,
				)
				.all()
			const rows = result.results as Array<{
				id: string
				name: string
				system_prompt: string
				model_preset: string
				custom_model?: string | null
				is_active: number
				is_default: number
				created_at: string
				updated_at: string
				deleted_at?: string | null
			}>
			return rows.map(toManagedChatAgent)
		},
		async getById(id: string) {
			const record = await getRecordById(id)
			return record ? toManagedChatAgent(record) : null
		},
		async getAvailableById(id: string) {
			const record = await database.findOne(agentsTable, {
				where: { id, deleted_at: null, is_active: 1 },
			})
			return record ? toManagedChatAgent(record) : null
		},
		async getDefault() {
			const defaultRecord = await db
				.prepare(
					`
						SELECT
							id,
							name,
							system_prompt,
							model_preset,
							custom_model,
							is_active,
							is_default,
							created_at,
							updated_at,
							deleted_at
						FROM agents
						WHERE deleted_at IS NULL
							AND is_active = 1
							AND is_default = 1
						ORDER BY updated_at DESC
						LIMIT 1
					`,
				)
				.first<{
					id: string
					name: string
					system_prompt: string
					model_preset: string
					custom_model?: string | null
					is_active: number
					is_default: number
					created_at: string
					updated_at: string
					deleted_at?: string | null
				}>()
			if (defaultRecord) return toManagedChatAgent(defaultRecord)

			const fallbackRecord = await db
				.prepare(
					`
						SELECT
							id,
							name,
							system_prompt,
							model_preset,
							custom_model,
							is_active,
							is_default,
							created_at,
							updated_at,
							deleted_at
						FROM agents
						WHERE deleted_at IS NULL
							AND is_active = 1
						ORDER BY updated_at DESC
						LIMIT 1
					`,
				)
				.first<{
					id: string
					name: string
					system_prompt: string
					model_preset: string
					custom_model?: string | null
					is_active: number
					is_default: number
					created_at: string
					updated_at: string
					deleted_at?: string | null
				}>()
			return fallbackRecord ? toManagedChatAgent(fallbackRecord) : null
		},
		async create(input: {
			name: string
			systemPrompt: string
			modelPreset: string
			customModel?: string | null
			isActive?: boolean
			makeDefault?: boolean
		}) {
			const record = await database.create(
				agentsTable,
				{
					id: crypto.randomUUID(),
					name: normalizeAgentName(input.name),
					system_prompt: normalizeSystemPrompt(input.systemPrompt),
					model_preset: normalizeModelPreset(input.modelPreset),
					custom_model: normalizeCustomModel(input.customModel),
					is_active: input.isActive === false ? 0 : 1,
					is_default: input.makeDefault ? 1 : 0,
					deleted_at: null,
				},
				{ returnRow: true },
			)

			if (input.makeDefault) {
				await db
					.prepare(
						`
							UPDATE agents
							SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END
							WHERE deleted_at IS NULL
						`,
					)
					.bind(record.id)
					.run()
				const refreshedRecord = await getRecordById(record.id)
				return toManagedChatAgent(refreshedRecord ?? record)
			}

			return toManagedChatAgent(record)
		},
		async update(
			id: string,
			input: {
				name: string
				systemPrompt: string
				modelPreset: string
				customModel?: string | null
				isActive: boolean
			},
		) {
			const record = await database.findOne(agentsTable, {
				where: { id, deleted_at: null },
			})
			if (!record) return null

			const updated = await database.update(
				agentsTable,
				id,
				{
					name: normalizeAgentName(input.name),
					system_prompt: normalizeSystemPrompt(input.systemPrompt),
					model_preset: normalizeModelPreset(input.modelPreset),
					custom_model: normalizeCustomModel(input.customModel),
					is_active: input.isActive ? 1 : 0,
				},
				{ touch: true },
			)

			if (updated.is_default === 1 && updated.is_active !== 1) {
				const fallbackCandidate = await getNextDefaultCandidate(id)
				if (fallbackCandidate) {
					await db
						.prepare(
							`
								UPDATE agents
								SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END
								WHERE deleted_at IS NULL
							`,
						)
						.bind(fallbackCandidate.id)
						.run()
				}
			}

			const refreshedRecord = await getRecordById(id)
			return refreshedRecord ? toManagedChatAgent(refreshedRecord) : null
		},
		async setDefault(id: string) {
			const record = await database.findOne(agentsTable, {
				where: { id, deleted_at: null },
			})
			if (!record) return null

			await db
				.prepare(
					`
						UPDATE agents
						SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END,
							is_active = CASE WHEN id = ? THEN 1 ELSE is_active END
						WHERE deleted_at IS NULL
					`,
				)
				.bind(id, id)
				.run()

			const refreshedRecord = await getRecordById(id)
			return refreshedRecord ? toManagedChatAgent(refreshedRecord) : null
		},
		async archive(id: string) {
			const record = await database.findOne(agentsTable, {
				where: { id, deleted_at: null },
			})
			if (!record) return null

			await database.update(
				agentsTable,
				id,
				{
					deleted_at: toDeletedAtTimestamp(),
					is_active: 0,
					is_default: 0,
				},
				{ touch: true },
			)

			if (record.is_default === 1) {
				const fallbackCandidate = await getNextDefaultCandidate(id)
				if (fallbackCandidate) {
					await db
						.prepare(
							`
								UPDATE agents
								SET is_default = CASE WHEN id = ? THEN 1 ELSE is_default END
								WHERE deleted_at IS NULL
							`,
						)
						.bind(fallbackCandidate.id)
						.run()
				}
			}

			return true
		},
	}
}
