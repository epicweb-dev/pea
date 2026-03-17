import { AIChatAgent } from '@cloudflare/ai-chat'
import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	type ToolSet,
	type UIMessage,
	type StreamTextOnFinishCallback,
} from 'ai'
import { type Connection, type ConnectionContext } from 'agents'
import { createMcpCallerContext } from '#mcp/context.ts'
import {
	type ChatAssistantMessageMetadata,
	envDefaultModelPreset,
	type ManagedChatAgent,
} from '#shared/chat.ts'
import {
	createAgentsStore,
	defaultManagedChatAgentId,
	defaultManagedChatAgentName,
	defaultManagedChatAgentSystemPrompt,
} from '#server/agents.ts'
import { readAuthenticatedAppUser } from '#server/authenticated-user.ts'
import { createChatThreadsStore } from '#server/chat-threads.ts'
import { createAiRuntime, type AiRuntimeResult } from './ai-runtime.ts'

function resolveAgentModel(agent: ManagedChatAgent) {
	if (agent.customModel?.trim()) return agent.customModel.trim()
	if (agent.modelPreset !== envDefaultModelPreset) {
		return agent.modelPreset
	}
	return null
}

type ThreadAgentConfig = {
	id: string
	name: string
	systemPrompt: string
	model: string | null
}

const noResponseToken = '[[NO_RESPONSE]]'

function createManagedAgentConfig(agent: ManagedChatAgent): ThreadAgentConfig {
	return {
		id: agent.id,
		name: agent.name,
		systemPrompt: agent.systemPrompt,
		model: resolveAgentModel(agent),
	}
}

function createFallbackAgentConfig() {
	return {
		id: defaultManagedChatAgentId,
		name: defaultManagedChatAgentName,
		systemPrompt: defaultManagedChatAgentSystemPrompt,
		model: null,
	}
}

function getTextParts(message: UIMessage) {
	return message.parts
		.filter(
			(
				part,
			): part is Extract<(typeof message.parts)[number], { type: 'text' }> =>
				part.type === 'text',
		)
		.map((part) => part.text)
}

function getLatestUserMessageText(messages: Array<UIMessage>) {
	const userMessages = messages.filter((message) => message.role === 'user')
	const latestMessage = userMessages.at(-1)
	if (!latestMessage) return ''
	return getTextParts(latestMessage).join('\n').trim()
}

function getAssistantMessageMetadata(message: UIMessage) {
	if (!message.metadata || typeof message.metadata !== 'object') {
		return null
	}
	const metadata = message.metadata as {
		agentId?: unknown
		agentName?: unknown
	}
	return {
		agentId:
			typeof metadata.agentId === 'string' ? metadata.agentId.trim() || null : null,
		agentName:
			typeof metadata.agentName === 'string'
				? metadata.agentName.trim() || null
				: null,
	} satisfies ChatAssistantMessageMetadata
}

function buildToolPartSummary(
	part: {
		type: string
		state?: unknown
		input?: unknown
		output?: unknown
		errorText?: unknown
	},
) {
	if (!part.type.startsWith('tool-')) return ''
	const lines = [part.type.replace(/^tool-/, '')]
	if ('state' in part && typeof part.state === 'string') {
		lines.push(`state: ${part.state}`)
	}
	if ('input' in part && part.input !== undefined) {
		lines.push(`input: ${JSON.stringify(part.input)}`)
	}
	if ('output' in part && part.output !== undefined) {
		lines.push(`output: ${JSON.stringify(part.output)}`)
	}
	if ('errorText' in part && typeof part.errorText === 'string') {
		lines.push(`error: ${part.errorText}`)
	}
	return lines.join('\n')
}

function buildMessageTextForAgentContext(message: UIMessage) {
	const textParts = getTextParts(message)
	const otherParts = message.parts
		.map((part) => buildToolPartSummary(part as { type: string }))
		.filter(Boolean)
	const combinedText = [...textParts, ...otherParts].join('\n').trim()
	if (message.role !== 'assistant') {
		return combinedText
	}
	const metadata = getAssistantMessageMetadata(message)
	const speakerName = metadata?.agentName ?? 'Assistant'
	if (!combinedText) return `${speakerName}:`
	return `${speakerName}: ${combinedText}`
}

function buildConversationMessagesForAgent(messages: Array<UIMessage>) {
	const conversationMessages: Array<UIMessage> = []
	for (const message of messages) {
		const text = buildMessageTextForAgentContext(message)
		if (!text) continue
		conversationMessages.push({
			id: message.id,
			role: message.role,
			parts: [{ type: 'text', text }],
		})
	}
	return conversationMessages
}

function buildThreadTitle(messages: Array<UIMessage>) {
	const firstUserMessage = messages.find((message) => message.role === 'user')
	if (!firstUserMessage) return ''
	const text = getTextParts(firstUserMessage).join('\n').trim()
	if (!text) return ''
	return text.slice(0, 120)
}

function buildLastPreview(input: { userText: string; assistantText?: string }) {
	const assistantPreview = input.assistantText?.trim() ?? ''
	if (assistantPreview) return assistantPreview.slice(0, 160)
	return input.userText.trim().slice(0, 160)
}

function createEmptyResponse() {
	return createUIMessageStreamResponse({
		stream: createUIMessageStream({
			execute() {},
		}),
	})
}

function createAssistantTextResponse(text: string) {
	return createUIMessageStreamResponse({
		stream: createUIMessageStream<UIMessage<ChatAssistantMessageMetadata>>({
			execute({ writer }) {
				const textPartId = crypto.randomUUID()
				const metadata = {
					agentId: null,
					agentName: 'Selected agents',
				} satisfies ChatAssistantMessageMetadata
				writer.write({
					type: 'start',
					messageMetadata: metadata,
				})
				writer.write({
					type: 'text-start',
					id: textPartId,
				})
				writer.write({
					type: 'text-delta',
					id: textPartId,
					delta: text,
				})
				writer.write({
					type: 'text-end',
					id: textPartId,
				})
				writer.write({
					type: 'finish',
					messageMetadata: metadata,
				})
			},
		}),
	})
}

function createErrorResponse(message: string) {
	return new Response(message, {
		status: 500,
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
		},
	})
}

type MockToolCallResult = {
	assistantText: string
}

const defaultMessageHistoryLimit = 40
const maxMessageHistoryLimit = 100

function normalizeMessageHistoryLimit(limit: number | undefined) {
	return Math.max(
		1,
		Math.min(limit ?? defaultMessageHistoryLimit, maxMessageHistoryLimit),
	)
}

function normalizeMessageHistoryIndex(
	index: number | null | undefined,
	totalCount: number,
) {
	if (typeof index !== 'number' || !Number.isFinite(index)) return totalCount
	return Math.max(0, Math.min(Math.trunc(index), totalCount))
}

function formatNumberForMockTool(value: number, precision: number) {
	if (Number.isInteger(value)) return String(value)
	const rounded = value.toFixed(precision)
	return rounded.includes('.') ? rounded.replace(/\.?0+$/, '') : rounded
}

function createKnownMockToolResult(
	result: Extract<AiRuntimeResult, { kind: 'tool-call' }>,
): MockToolCallResult | null {
	if (result.toolName === 'do_math') {
		const left = result.input.left
		const right = result.input.right
		const operator = result.input.operator
		const precision = result.input.precision

		const isValidOperator = (value: unknown): value is '+' | '-' | '*' | '/' =>
			value === '+' || value === '-' || value === '*' || value === '/'

		if (
			typeof left !== 'number' ||
			typeof right !== 'number' ||
			!isValidOperator(operator)
		) {
			return {
				assistantText:
					'Unable to execute `do_math` because the provided mock input was invalid.',
			}
		}

		if (operator === '/' && right === 0) {
			return {
				assistantText: [
					'## ❌ Result',
					'',
					'Division by zero is not allowed.',
					'',
					`Inputs: left=${left}, operator="${operator}", right=${right}`,
				].join('\n'),
			}
		}

		const operation = {
			'+': (l: number, r: number) => l + r,
			'-': (l: number, r: number) => l - r,
			'*': (l: number, r: number) => l * r,
			'/': (l: number, r: number) => l / r,
		}[operator]
		const numericResult = operation(left, right)
		const precisionUsed =
			typeof precision === 'number' &&
			Number.isInteger(precision) &&
			precision >= 0 &&
			precision <= 15
				? precision
				: 6
		const expression = `${left} ${operator} ${right}`

		return {
			assistantText: [
				'## ✅ Result',
				'',
				`**Expression**: \`${expression}\``,
				'',
				`**Result**: \`${formatNumberForMockTool(numericResult, precisionUsed)}\``,
			].join('\n'),
		}
	}

	if (result.toolName === 'open_calculator_ui') {
		return {
			assistantText: [
				'## Calculator widget ready',
				'',
				'The calculator UI is attached to this tool call in MCP-compatible hosts.',
			].join('\n'),
		}
	}

	return null
}

function buildManagedAgentSystemPrompt(input: {
	agent: ThreadAgentConfig
	selectedAgents: Array<ThreadAgentConfig>
}) {
	const otherSelectedAgents = input.selectedAgents
		.filter((agent) => agent.id !== input.agent.id)
		.map((agent) => agent.name)
	const instructions = [
		input.agent.systemPrompt.trim(),
		'',
		`You are ${input.agent.name}, one participant in a shared chat with the user.`,
		'Only respond when the latest message is from the user and you can add distinct, useful value.',
		'Do not respond to messages from other agents. Do not critique or answer another agent unless the user explicitly asks you to.',
		`If you should stay silent, reply with exactly ${noResponseToken} and nothing else.`,
	]
	if (otherSelectedAgents.length > 0) {
		instructions.push(
			`Other selected agents in this chat: ${otherSelectedAgents.join(', ')}.`,
		)
	}
	return instructions.join('\n')
}

function buildAssistantMessage(
	agent: ThreadAgentConfig,
	text: string,
): UIMessage<ChatAssistantMessageMetadata> {
	return {
		id: `assistant_${crypto.randomUUID()}`,
		role: 'assistant',
		metadata: {
			agentId: agent.id,
			agentName: agent.name,
		},
		parts: [{ type: 'text', text }],
	}
}

function normalizeAgentMatchValue(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
}

function buildCombinedAssistantText(
	messages: Array<UIMessage<ChatAssistantMessageMetadata>>,
) {
	return messages
		.map((message) => {
			const metadata = getAssistantMessageMetadata(message)
			const agentName = metadata?.agentName ?? 'Assistant'
			const text = getTextParts(message).join('\n').trim()
			return text ? `${agentName}:\n${text}` : agentName
		})
		.join('\n\n')
		.trim()
}

export class ChatAgent extends AIChatAgent<Env> {
	waitForMcpConnections = true
	private runtimeContext: {
		appUserId: number
		baseUrl: string
		user: ReturnType<typeof createMcpCallerContext>['user']
	} | null = null

	private getRuntimeContext() {
		if (!this.runtimeContext) {
			this.restoreRuntimeContext()
		}
		if (!this.runtimeContext) {
			throw new Error(
				'Chat agent runtime context has not been initialized yet.',
			)
		}
		return this.runtimeContext
	}

	private ensureRuntimeContextTable() {
		void this.sql`
			CREATE TABLE IF NOT EXISTS chat_agent_runtime_context (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)
		`
	}

	private restoreRuntimeContext() {
		this.ensureRuntimeContextTable()
		const rows =
			this.sql<{ value: string }>`
				SELECT value FROM chat_agent_runtime_context
				WHERE key = 'runtimeContext'
			` || []
		const row = rows[0]
		if (!row) return
		try {
			this.runtimeContext = JSON.parse(row.value) as NonNullable<
				typeof this.runtimeContext
			>
		} catch {
			this.runtimeContext = null
		}
	}

	private persistRuntimeContext() {
		if (!this.runtimeContext) return
		this.ensureRuntimeContextTable()
		void this.sql`
			INSERT OR REPLACE INTO chat_agent_runtime_context (key, value)
			VALUES ('runtimeContext', ${JSON.stringify(this.runtimeContext)})
		`
	}

	private getThreadStore() {
		return createChatThreadsStore(this.env.APP_DB)
	}

	private getAgentsStore() {
		return createAgentsStore(this.env.APP_DB)
	}

	private async getSelectedAgentsForCurrentThread() {
		const { appUserId } = this.getRuntimeContext()
		const thread = await this.getThreadStore().getForUser(appUserId, this.name)
		if (!thread) {
			throw new Error('Thread not found.')
		}
		const availableAgents = await this.getAgentsStore().listAvailable()
		const availableAgentsById = new Map(
			availableAgents.map((agent) => [agent.id, agent] as const),
		)
		const selectedAgents = thread.agentIds
			.map((agentId) => availableAgentsById.get(agentId))
			.filter((agent): agent is ManagedChatAgent => Boolean(agent))
			.map(createManagedAgentConfig)
		if (selectedAgents.length > 0) {
			return selectedAgents
		}

		const fallbackAgent = await this.getAgentsStore().getDefault()
		return [fallbackAgent ? createManagedAgentConfig(fallbackAgent) : createFallbackAgentConfig()]
	}

	private shouldMockAgentRespond(input: {
		agent: ThreadAgentConfig
		selectedAgents: Array<ThreadAgentConfig>
		latestUserText: string
	}) {
		const normalizedUserText = normalizeAgentMatchValue(input.latestUserText)
		if (!normalizedUserText) return true
		const mentionedAgents = input.selectedAgents.filter((agent) => {
			const normalizedName = normalizeAgentMatchValue(agent.name)
			const normalizedId = normalizeAgentMatchValue(agent.id)
			return (
				(normalizedName && normalizedUserText.includes(normalizedName)) ||
				(normalizedId && normalizedUserText.includes(normalizedId))
			)
		})
		if (mentionedAgents.length === 0) return true
		return mentionedAgents.some((agent) => agent.id === input.agent.id)
	}

	private async resolveMockToolCallAssistantText(
		result: Extract<AiRuntimeResult, { kind: 'tool-call' }>,
	) {
		const knownMockToolResult = createKnownMockToolResult(result)
		if (knownMockToolResult) {
			return knownMockToolResult.assistantText
		}

		const tool = this.mcp
			.listTools()
			.find((entry) => entry.name === result.toolName)
		if (!tool) {
			return `Mock tool "${result.toolName}" is not available.`
		}

		let toolResult: Awaited<ReturnType<typeof this.mcp.callTool>>
		try {
			toolResult = await this.mcp.callTool({
				serverId: tool.serverId,
				name: result.toolName,
				arguments: result.input,
			})
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unknown mock tool error.'
			return `Mock tool "${result.toolName}" failed to execute: ${message}`
		}
		const output =
			'structuredContent' in toolResult && toolResult.structuredContent
				? toolResult.structuredContent
				: toolResult.content
		const toolContents = Array.isArray(toolResult.content)
			? (toolResult.content as Array<{ type: string; text?: string }>)
			: []

		const assistantText =
			result.text?.trim() ||
			toolContents
				.filter((part) => part.type === 'text')
				.map((part) => part.text)
				.join('\n')
				.trim()

		return (
			assistantText ||
			(typeof output === 'string' ? output : JSON.stringify(output, null, 2))
		)
	}

	getMessagePage(input?: {
		before?: number | null
		limit?: number
		start?: number | null
	}) {
		const totalCount = this.messages.length
		const limit = normalizeMessageHistoryLimit(input?.limit)
		const startIndex =
			input?.start !== undefined && input.start !== null
				? normalizeMessageHistoryIndex(input.start, totalCount)
				: Math.max(
						normalizeMessageHistoryIndex(input?.before, totalCount) - limit,
						0,
					)
		const endIndex =
			input?.start !== undefined && input.start !== null
				? totalCount
				: normalizeMessageHistoryIndex(input?.before, totalCount)
		const messages = this.messages.slice(startIndex, endIndex)

		return {
			messages,
			hasMore: startIndex > 0,
			nextBefore: startIndex > 0 ? String(startIndex) : null,
			startIndex,
			totalCount,
		}
	}

	private async syncThreadMetadata(input: {
		assistantText?: string
		messageCountOffset?: number
	}) {
		const { appUserId } = this.getRuntimeContext()
		const threadId = this.name
		const threadStore = this.getThreadStore()
		const currentThread = await threadStore.getForUser(appUserId, threadId)
		if (!currentThread) {
			throw new Error('Thread not found.')
		}
		const autoTitle = buildThreadTitle(this.messages)
		const title =
			currentThread.title.trim() === 'New chat' ||
			currentThread.title.trim() === autoTitle
				? autoTitle
				: undefined
		const userText = getLatestUserMessageText(this.messages)
		const messageCount = this.messages.length + (input.messageCountOffset ?? 0)
		const updatedThread = await threadStore.syncMetadataForUser({
			userId: appUserId,
			threadId,
			title,
			lastMessagePreview: buildLastPreview({
				userText,
				assistantText: input.assistantText,
			}),
			messageCount,
		})
		if (!updatedThread) {
			throw new Error('Thread not found.')
		}
		return updatedThread
	}

	private async initializeRuntimeContextFromRequest(request: Request) {
		const user = await readAuthenticatedAppUser(request, this.env)
		if (!user) {
			throw new Error('Unauthorized chat agent connection.')
		}
		const thread = await this.getThreadStore().getForUser(
			user.userId,
			this.name,
		)
		if (!thread) {
			throw new Error('Thread not found for authenticated user.')
		}
		const baseUrl = new URL(request.url).origin
		this.runtimeContext = {
			appUserId: user.userId,
			baseUrl,
			user: user.mcpUser,
		}
		this.persistRuntimeContext()
		await this.addMcpServer('pea', this.env.MCP_OBJECT, {
			props: createMcpCallerContext({
				baseUrl,
				user: user.mcpUser,
			}),
		})
	}

	async onConnect(
		connection: Connection,
		ctx: ConnectionContext,
	): Promise<void> {
		await this.initializeRuntimeContextFromRequest(ctx.request)
		void connection
	}

	async onRequest(request: Request): Promise<Response> {
		try {
			await this.initializeRuntimeContextFromRequest(request)
		} catch (error) {
			if (
				error instanceof Error &&
				(error.message === 'Thread not found.' ||
					error.message === 'Thread not found for authenticated user.')
			) {
				return new Response('Thread not found.', { status: 404 })
			}
			if (error instanceof Error && error.message.includes('Unauthorized')) {
				return new Response('Unauthorized', { status: 401 })
			}
			return createErrorResponse('Failed to initialize chat agent.')
		}
		return new Response('Not implemented', { status: 404 })
	}

	async onChatMessage(
		onFinish: StreamTextOnFinishCallback<ToolSet>,
		options?: { abortSignal?: AbortSignal },
	): Promise<Response | undefined> {
		void onFinish
		const aiRuntime = createAiRuntime(this.env)
		const tools = this.mcp.getAITools()
		const toolNames = this.mcp.listTools().map((tool) => tool.name)
		const selectedAgents = await this.getSelectedAgentsForCurrentThread()
		const latestUserText = getLatestUserMessageText(this.messages)
		const conversationMessages = buildConversationMessagesForAgent(this.messages)
		const assistantMessages: Array<UIMessage<ChatAssistantMessageMetadata>> = []
		const generationErrors: Array<string> = []

		for (const agent of selectedAgents) {
			if (
				this.env.AI_MODE !== 'remote' &&
				!this.shouldMockAgentRespond({
					agent,
					selectedAgents,
					latestUserText,
				})
			) {
				continue
			}

			const runtimeResult = await aiRuntime.generateChatReply({
				messages: conversationMessages,
				system: buildManagedAgentSystemPrompt({
					agent,
					selectedAgents,
				}),
				model: agent.model,
				tools,
				toolNames,
				abortSignal: options?.abortSignal,
			})

			if (runtimeResult.kind === 'error') {
				generationErrors.push(runtimeResult.message)
				continue
			}

			const assistantText =
				runtimeResult.kind === 'tool-call'
					? await this.resolveMockToolCallAssistantText(runtimeResult)
					: runtimeResult.text.trim()
			if (!assistantText || assistantText === noResponseToken) {
				continue
			}

			assistantMessages.push(buildAssistantMessage(agent, assistantText))
		}

		const combinedAssistantText = buildCombinedAssistantText(assistantMessages)
		await this.syncThreadMetadata({
			assistantText: assistantMessages.at(-1)
				? getTextParts(assistantMessages.at(-1)!).join('\n').trim()
				: undefined,
			messageCountOffset: combinedAssistantText ? 1 : 0,
		})
		if (combinedAssistantText) {
			return createAssistantTextResponse(combinedAssistantText)
		}
		if (generationErrors.length > 0) {
			return createErrorResponse(generationErrors[0] ?? 'Chat generation failed.')
		}
		return createEmptyResponse()
	}

	async clearThread() {
		await this.getThreadStore().syncMetadataForUser({
			userId: this.getRuntimeContext().appUserId,
			threadId: this.name,
			lastMessagePreview: null,
			messageCount: 0,
			title: 'New chat',
		})
	}
}
