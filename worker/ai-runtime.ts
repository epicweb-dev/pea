import {
	convertToModelMessages,
	generateObject,
	streamText,
	type ToolSet,
	type UIMessage,
} from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'
import { getLocalRemoteAiEnvError } from '#shared/local-remote-ai-env.ts'
import { fallbackRemoteChatModel, type AiMode } from '#shared/chat.ts'
import { buildMockAiScenario, type MockAiResponse } from '#shared/mock-ai.ts'
import {
	scoreAgentsForTurn,
	type ThreadAgentConfig,
} from './chat-agent-turn-selection.ts'

export type StreamChatReplyInput = {
	messages: Array<UIMessage>
	system: string
	model?: string | null
	tools: ToolSet
	toolNames: Array<string>
	abortSignal?: AbortSignal
	onTextChunk?: (chunk: string) => PromiseLike<void> | void
}

export type AiRuntimeResult = MockAiResponse

export type ResponderSelection = {
	agentId: string | null
	rationale: string
}

export type AiRuntime = {
	streamChatReply(input: StreamChatReplyInput): Promise<AiRuntimeResult>
	selectResponder(input: {
		messages: Array<UIMessage>
		agents: Array<ThreadAgentConfig>
		abortSignal?: AbortSignal
	}): Promise<ResponderSelection>
}

type AIEnabledEnv = Env & {
	AI: Ai
}

type WorkersAiCredentialsEnv = Env & {
	CLOUDFLARE_ACCOUNT_ID?: string
	CLOUDFLARE_API_TOKEN?: string
	WRANGLER_IS_LOCAL_DEV?: string
}

function resolveAiMode(env: Env): AiMode {
	if (env.AI_MODE) return env.AI_MODE
	return 'mock'
}

function createWorkersAiProvider(env: WorkersAiCredentialsEnv) {
	const gatewayId = env.AI_GATEWAY_ID?.trim()
	const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim()
	const apiKey = env.CLOUDFLARE_API_TOKEN?.trim()
	const isLocalWranglerDev = env.WRANGLER_IS_LOCAL_DEV === 'true'
	const localRemoteAiEnvError = getLocalRemoteAiEnvError({
		aiMode: env.AI_MODE,
		isLocalDev: isLocalWranglerDev,
		gatewayId,
		accountId,
		apiToken: apiKey,
	})
	if (localRemoteAiEnvError) {
		throw new Error(localRemoteAiEnvError)
	}
	if (!gatewayId) {
		throw new Error(
			'AI_GATEWAY_ID is required when AI_MODE is "remote". Configure it in local env or GitHub Actions secrets.',
		)
	}
	const gateway = { gateway: { id: gatewayId } }

	if (isLocalWranglerDev && accountId && apiKey) {
		return createWorkersAI({
			accountId,
			apiKey,
			...gateway,
		})
	}

	return createWorkersAI({
		binding: (env as AIEnabledEnv).AI,
		...gateway,
	})
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

function formatConversationForArbitration(messages: Array<UIMessage>) {
	return messages
		.slice(-10)
		.map((message) => {
			const text = getTextParts(message).join('\n').trim()
			if (!text) return null
			if (message.role === 'user') {
				return `User: ${text}`
			}
			const metadata =
				message.metadata && typeof message.metadata === 'object'
					? (message.metadata as { agentName?: unknown })
					: null
			const speakerName =
				metadata && typeof metadata.agentName === 'string'
					? metadata.agentName.trim() || 'Assistant'
					: 'Assistant'
			return `${speakerName}: ${text}`
		})
		.filter(Boolean)
		.join('\n')
}

function buildResponderArbitrationPrompt(input: {
	messages: Array<UIMessage>
	agents: Array<ThreadAgentConfig>
}) {
	const latestMessage = input.messages.at(-1)
	const formattedMessages = formatConversationForArbitration(input.messages)
	const agentRoster = input.agents
		.map(
			(agent) =>
				`- ${agent.id}: ${agent.name}\n  Focus: ${agent.systemPrompt.trim()}`,
		)
		.join('\n')
	return [
		'Pick which single agent, if any, should respond next in this shared conversation.',
		'Return null if no agent should reply.',
		'The UI already labels agent messages, so do not choose based on who should prepend their name.',
		'Prefer the agent who is most clearly addressed or can add the most useful distinct value.',
		'When the user is inviting another participant into the conversation, prefer someone other than the agent who just spoke when appropriate.',
		'Choose at most one agent.',
		'',
		`Latest message role: ${latestMessage?.role ?? 'unknown'}`,
		'',
		'Available agents:',
		agentRoster,
		'',
		'Recent conversation:',
		formattedMessages || '(empty conversation)',
	].join('\n')
}

const responderSelectionSchema = z.object({
	agentId: z.string().nullable(),
	rationale: z.string().default(''),
})

function createRemoteAiRuntime(env: WorkersAiCredentialsEnv): AiRuntime {
	return {
		async streamChatReply(input) {
			try {
				const workersai = createWorkersAiProvider(env)
				const model =
					input.model?.trim() || env.AI_MODEL || fallbackRemoteChatModel
				const result = streamText({
					model: workersai(model),
					system: input.system,
					messages: await convertToModelMessages(input.messages),
					tools: input.tools,
					abortSignal: input.abortSignal,
					onChunk: async ({ chunk }) => {
						if (chunk.type === 'text-delta') {
							await input.onTextChunk?.(chunk.text)
						}
					},
				})
				return {
					kind: 'text',
					text: await result.text,
				}
			} catch (error) {
				return {
					kind: 'error',
					message:
						error instanceof Error
							? error.message
							: 'Remote AI generation failed.',
				}
			}
		},
		async selectResponder(input) {
			try {
				const workersai = createWorkersAiProvider(env)
				const model = env.AI_MODEL || fallbackRemoteChatModel
				const result = await generateObject({
					model: workersai(model),
					schema: responderSelectionSchema,
					system:
						'You are a conversation orchestrator for a multi-agent chat. Output only the structured result.',
					prompt: buildResponderArbitrationPrompt(input),
					abortSignal: input.abortSignal,
				})
				const validAgentIds = new Set(input.agents.map((agent) => agent.id))
				const agentId =
					result.object.agentId && validAgentIds.has(result.object.agentId)
						? result.object.agentId
						: null
				return {
					agentId,
					rationale: result.object.rationale.trim(),
				}
			} catch (error) {
				return {
					agentId: null,
					rationale:
						error instanceof Error
							? error.message
							: 'Responder arbitration failed.',
				}
			}
		},
	}
}

function createMockAiRuntime(env: Env): AiRuntime {
	const baseUrl = env.AI_MOCK_BASE_URL?.trim()

	return {
		async streamChatReply(input) {
			if (!baseUrl) {
				const userMessages = input.messages.filter(
					(message) => message.role === 'user',
				)
				const latestUserMessage = userMessages.at(-1)
				const lastUserMessage =
					latestUserMessage?.parts
						.filter(
							(
								part,
							): part is Extract<
								(typeof latestUserMessage.parts)[number],
								{ type: 'text' }
							> => part.type === 'text',
						)
						.map((part) => part.text)
						.join('\n')
						.trim() ?? ''
				const response = buildMockAiScenario({
					lastUserMessage,
					toolNames: input.toolNames,
				}).response
				if (response.kind === 'text') {
					const chunks =
						response.chunks && response.chunks.length > 0
							? response.chunks
							: [response.text]
					for (const chunk of chunks) {
						await input.onTextChunk?.(chunk)
					}
				}
				return response
			}

			const url = new URL('/chat', baseUrl)
			const response = await fetch(url.toString(), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(env.AI_MOCK_API_KEY
						? {
								Authorization: `Bearer ${env.AI_MOCK_API_KEY}`,
							}
						: {}),
				},
				body: JSON.stringify({
					system: input.system,
					messages: input.messages,
					toolNames: input.toolNames,
				}),
				signal: input.abortSignal,
			})

			if (!response.ok) {
				const body = await response.text().catch(() => '')
				throw new Error(
					`Mock AI worker failed (${response.status} ${response.statusText}): ${body}`,
				)
			}

			const result = (await response.json()) as MockAiResponse
			if (result.kind === 'text') {
				const chunks =
					result.chunks && result.chunks.length > 0
						? result.chunks
						: [result.text]
				for (const chunk of chunks) {
					await input.onTextChunk?.(chunk)
				}
			}
			return result
		},
		async selectResponder(input) {
			const scoredCandidates = scoreAgentsForTurn({
				selectedAgents: input.agents,
				messages: input.messages,
			})
			const selectedCandidate = scoredCandidates[0]
			return {
				agentId: selectedCandidate?.agent.id ?? null,
				rationale: selectedCandidate?.rationale ?? 'mock-fallback',
			}
		},
	}
}

export function createAiRuntime(env: Env): AiRuntime {
	const mode = resolveAiMode(env)
	if (mode === 'remote') return createRemoteAiRuntime(env as AIEnabledEnv)
	return createMockAiRuntime(env)
}
