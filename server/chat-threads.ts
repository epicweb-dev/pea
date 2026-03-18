import { chatThreadsTable, createDb } from '#worker/db.ts'
import { type ChatThreadSummary } from '#shared/chat.ts'
import { createAgentsStore, defaultManagedChatAgentId } from './agents.ts'

function toIsoTimestamp(date = new Date()) {
	return date.toISOString()
}

function normalizePreview(value: string | null | undefined) {
	const trimmed = value?.trim() ?? ''
	return trimmed.length > 0 ? trimmed : ''
}

function buildThreadTitleFallback(threadId: string) {
	return `Thread ${threadId.slice(0, 8)}`
}

function parseThreadAgentIds(record: {
	agent_id?: string | null
	agent_ids_json?: string | null
}) {
	const idsFromJson = (() => {
		if (!record.agent_ids_json?.trim()) return []
		try {
			const parsed = JSON.parse(record.agent_ids_json) as Array<unknown>
			if (!Array.isArray(parsed)) return []
			return parsed
				.filter((value): value is string => typeof value === 'string')
				.map((value) => value.trim())
				.filter(Boolean)
		} catch {
			return []
		}
	})()
	const fallbackAgentId = record.agent_id?.trim() ?? ''
	const uniqueIds = new Set(idsFromJson)
	if (fallbackAgentId) {
		uniqueIds.add(fallbackAgentId)
	}
	return [...uniqueIds]
}

function toThreadSummary(record: {
	id: string
	agent_id?: string | null
	agent_ids_json?: string | null
	title: string
	last_message_preview: string
	message_count: number
	created_at: string
	updated_at: string
	deleted_at?: string | null
}): ChatThreadSummary {
	const title = record.title.trim()
	const agentIds = parseThreadAgentIds(record)
	return {
		id: record.id,
		agentId: agentIds[0] ?? record.agent_id ?? null,
		agentIds,
		title: title || buildThreadTitleFallback(record.id),
		lastMessagePreview: normalizePreview(record.last_message_preview) || null,
		messageCount: record.message_count,
		createdAt: record.created_at,
		updatedAt: record.updated_at,
		deletedAt: record.deleted_at ?? null,
	}
}

function normalizeThreadTitle(value: string) {
	const trimmed = value.trim()
	if (!trimmed) return ''
	return trimmed.slice(0, 120)
}

function buildInitialTitle() {
	return 'New chat'
}

function escapeLikePattern(value: string) {
	return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

const defaultThreadListLimit = 40
const maxThreadListLimit = 100

function normalizeListLimit(limit: number | undefined) {
	return Math.max(
		1,
		Math.min(limit ?? defaultThreadListLimit, maxThreadListLimit),
	)
}

function normalizeCursor(cursor: string | null | undefined) {
	const parsedCursor = Number.parseInt(cursor ?? '', 10)
	if (!Number.isFinite(parsedCursor) || parsedCursor < 0) return 0
	return parsedCursor
}

function normalizeRequestedAgentIds(agentIds?: ReadonlyArray<string> | null) {
	const uniqueAgentIds = new Set<string>()
	for (const agentId of agentIds ?? []) {
		const normalizedAgentId = agentId.trim()
		if (!normalizedAgentId) continue
		uniqueAgentIds.add(normalizedAgentId)
	}
	return [...uniqueAgentIds]
}

export function createChatThreadsStore(db: D1Database) {
	const database = createDb(db)
	const agentsStore = createAgentsStore(db)

	async function resolveThreadAgentIds(
		agentIds?: ReadonlyArray<string> | null,
	) {
		const requestedAgentIds = normalizeRequestedAgentIds(agentIds)
		if (requestedAgentIds.length > 0) {
			const availableAgents = await agentsStore.listAvailable()
			const availableAgentIds = new Set(
				availableAgents.map((agent) => agent.id),
			)
			const matchingAgentIds = requestedAgentIds.filter((agentId) =>
				availableAgentIds.has(agentId),
			)
			if (matchingAgentIds.length > 0) {
				return matchingAgentIds
			}
		}

		const fallbackAgent = await agentsStore.getDefault()
		return [fallbackAgent?.id ?? defaultManagedChatAgentId]
	}

	return {
		async listForUser(
			userId: number,
			options?: {
				cursor?: string | null
				limit?: number
				search?: string
			},
		) {
			const limit = normalizeListLimit(options?.limit)
			const cursor = normalizeCursor(options?.cursor)
			const search = options?.search?.trim() ?? ''
			const escapedSearch = search ? escapeLikePattern(search) : ''
			const queryBindings = search
				? [userId, `%${escapedSearch}%`, `%${escapedSearch}%`]
				: [userId]
			const baseWhere = search
				? `
					user_id = ?
					AND deleted_at IS NULL
					AND (
						lower(title) LIKE lower(?) ESCAPE '\\'
						OR lower(last_message_preview) LIKE lower(?) ESCAPE '\\'
					)
				`
				: `
					user_id = ?
					AND deleted_at IS NULL
				`
			const totalCountRow = await db
				.prepare(
					`
						SELECT COUNT(*) as count
						FROM chat_threads
						WHERE ${baseWhere}
					`,
				)
				.bind(...queryBindings)
				.first<{ count: number | string }>()
			const totalCount = Number(totalCountRow?.count ?? 0)
			const records = await db
				.prepare(
					`
						SELECT
							id,
							agent_id,
							agent_ids_json,
							title,
							last_message_preview,
							message_count,
							created_at,
							updated_at,
							deleted_at
						FROM chat_threads
						WHERE ${baseWhere}
						ORDER BY updated_at DESC
						LIMIT ?
						OFFSET ?
					`,
				)
				.bind(...queryBindings, limit, cursor)
				.all()
				.then(
					(result) =>
						result.results as Array<{
							id: string
							agent_id?: string | null
							agent_ids_json?: string | null
							title: string
							last_message_preview: string
							message_count: number
							created_at: string
							updated_at: string
							deleted_at?: string | null
						}>,
				)
			const threads = records.map(toThreadSummary)
			const nextCursorValue = cursor + threads.length
			return {
				threads,
				hasMore: nextCursorValue < totalCount,
				nextCursor:
					nextCursorValue < totalCount ? String(nextCursorValue) : null,
				totalCount,
			}
		},
		async createForUser(
			userId: number,
			agentIds?: ReadonlyArray<string> | null,
		) {
			const resolvedAgentIds = await resolveThreadAgentIds(agentIds)
			const record = await database.create(
				chatThreadsTable,
				{
					id: crypto.randomUUID(),
					user_id: userId,
					agent_id: resolvedAgentIds[0] ?? defaultManagedChatAgentId,
					agent_ids_json: JSON.stringify(resolvedAgentIds),
					title: buildInitialTitle(),
					last_message_preview: '',
					message_count: 0,
				},
				{ returnRow: true },
			)
			return toThreadSummary(record)
		},
		async getForUser(userId: number, threadId: string) {
			const record = await database.findOne(chatThreadsTable, {
				where: { id: threadId, user_id: userId, deleted_at: null },
			})
			return record ? toThreadSummary(record) : null
		},
		async updateAgentsForUser(
			userId: number,
			threadId: string,
			agentIds: ReadonlyArray<string>,
		) {
			const record = await database.findOne(chatThreadsTable, {
				where: { id: threadId, user_id: userId, deleted_at: null },
			})
			if (!record) return null

			const resolvedAgentIds = await resolveThreadAgentIds(agentIds)
			const updated = await database.update(
				chatThreadsTable,
				threadId,
				{
					agent_id: resolvedAgentIds[0] ?? defaultManagedChatAgentId,
					agent_ids_json: JSON.stringify(resolvedAgentIds),
				},
				{ touch: true },
			)
			return toThreadSummary(updated)
		},
		async renameForUser(userId: number, threadId: string, title: string) {
			const record = await database.findOne(chatThreadsTable, {
				where: { id: threadId, user_id: userId, deleted_at: null },
			})
			if (!record) return null

			const updated = await database.update(
				chatThreadsTable,
				threadId,
				{ title: normalizeThreadTitle(title) },
				{ touch: true },
			)
			return toThreadSummary(updated)
		},
		async markDeletedForUser(userId: number, threadId: string) {
			const record = await database.findOne(chatThreadsTable, {
				where: { id: threadId, user_id: userId, deleted_at: null },
			})
			if (!record) return false
			await database.update(
				chatThreadsTable,
				threadId,
				{ deleted_at: toIsoTimestamp() },
				{ touch: true },
			)
			return true
		},
		async syncMetadataForUser(input: {
			userId: number
			threadId: string
			title?: string
			lastMessagePreview?: string | null
			messageCount?: number
		}) {
			const record = await database.findOne(chatThreadsTable, {
				where: {
					id: input.threadId,
					user_id: input.userId,
					deleted_at: null,
				},
			})
			if (!record) return null

			const nextTitle =
				typeof input.title === 'string'
					? normalizeThreadTitle(input.title)
					: record.title
			const nextPreview =
				input.lastMessagePreview !== undefined
					? normalizePreview(input.lastMessagePreview)
					: record.last_message_preview
			const nextMessageCount =
				typeof input.messageCount === 'number'
					? input.messageCount
					: record.message_count

			const updated = await database.update(
				chatThreadsTable,
				input.threadId,
				{
					title: nextTitle,
					last_message_preview: nextPreview,
					message_count: nextMessageCount,
				},
				{ touch: true },
			)
			return toThreadSummary(updated)
		},
	}
}
