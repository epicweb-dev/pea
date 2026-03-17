import {
	nullable,
	number,
	object,
	optional,
	string,
	type InferOutput,
} from 'remix/data-schema'

export const aiModeValues = ['mock', 'remote'] as const
export type AiMode = (typeof aiModeValues)[number]

export const envDefaultModelPreset = 'env-default'
export const chatAgentModelDividerValue = '__more-workers-ai-models__'
export const fallbackRemoteChatModel = '@cf/zai-org/glm-4.7-flash'

export const chatAgentModelPresets = [
	{
		value: envDefaultModelPreset,
		label: 'Environment default',
	},
	{
		value: '@cf/openai/gpt-oss-120b',
		label: 'OpenAI GPT OSS 120B',
	},
	{
		value: '@cf/meta/llama-4-scout-17b-16e-instruct',
		label: 'Meta Llama 4 Scout 17B',
	},
	{
		value: '@cf/mistralai/mistral-small-3.1-24b-instruct',
		label: 'Mistral Small 3.1 24B',
	},
	{
		value: '@cf/zai-org/glm-4.7-flash',
		label: 'GLM 4.7 Flash',
	},
	{
		value: '@cf/openai/gpt-oss-20b',
		label: 'OpenAI GPT OSS 20B',
	},
	{
		value: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
		label: 'Meta Llama 3.3 70B Fast',
	},
	{
		value: '@cf/meta/llama-3.1-70b-instruct',
		label: 'Meta Llama 3.1 70B',
	},
	{
		value: '@cf/meta/llama-3.1-8b-instruct-fast',
		label: 'Meta Llama 3.1 8B Fast',
	},
	{
		value: '@cf/meta/llama-3.1-8b-instruct',
		label: 'Meta Llama 3.1 8B',
	},
	{
		value: '@cf/meta/llama-3.1-8b-instruct-fp8',
		label: 'Meta Llama 3.1 8B FP8',
	},
	{
		value: '@cf/meta/llama-3.1-8b-instruct-awq',
		label: 'Meta Llama 3.1 8B AWQ',
	},
	{
		value: '@cf/meta/llama-3.2-1b-instruct',
		label: 'Meta Llama 3.2 1B',
	},
	{
		value: '@cf/meta/llama-3.2-3b-instruct',
		label: 'Meta Llama 3.2 3B',
	},
	{
		value: '@cf/meta/llama-3.2-11b-vision-instruct',
		label: 'Meta Llama 3.2 11B Vision',
	},
	{
		value: '@cf/google/gemma-3-12b-it',
		label: 'Google Gemma 3 12B',
	},
	{
		value: '@cf/ibm/granite-4.0-h-micro',
		label: 'IBM Granite 4.0 H Micro',
	},
	{
		value: '@cf/nvidia/nemotron-3-120b-a12b',
		label: 'NVIDIA Nemotron 3 120B',
	},
	{
		value: '@cf/qwen/qwen3-30b-a3b-fp8',
		label: 'Qwen 3 30B A3B FP8',
	},
	{
		value: '@cf/qwen/qwq-32b',
		label: 'Qwen QwQ 32B',
	},
	{
		value: '@cf/qwen/qwen2.5-coder-32b-instruct',
		label: 'Qwen 2.5 Coder 32B',
	},
	{
		value: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
		label: 'DeepSeek R1 Distill Qwen 32B',
	},
	{
		value: '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
		label: 'SEA-LION Gemma 27B',
	},
] as const

export const recommendedChatAgentModelPresetValues = [
	envDefaultModelPreset,
	'@cf/openai/gpt-oss-120b',
	'@cf/meta/llama-4-scout-17b-16e-instruct',
	'@cf/mistralai/mistral-small-3.1-24b-instruct',
	'@cf/zai-org/glm-4.7-flash',
] as const

export const mcpUserContextSchema = object({
	userId: string(),
	email: string(),
	displayName: string(),
})

export const mcpCallerContextSchema = object({
	baseUrl: string(),
	user: optional(nullable(mcpUserContextSchema)),
})

export type McpUserContext = InferOutput<typeof mcpUserContextSchema>
export type McpCallerContext = InferOutput<typeof mcpCallerContextSchema>

export const chatAgentPropsSchema = object({
	threadId: string(),
	appUserId: number(),
	baseUrl: string(),
	user: mcpUserContextSchema,
})

export type ChatAgentProps = InferOutput<typeof chatAgentPropsSchema>

export const chatThreadRecordSchema = object({
	id: string(),
	user_id: number(),
	agent_id: optional(nullable(string())),
	agent_ids_json: optional(string()),
	title: string(),
	last_message_preview: string(),
	message_count: number(),
	created_at: string(),
	updated_at: string(),
	deleted_at: optional(nullable(string())),
})

export type ChatThreadRecord = InferOutput<typeof chatThreadRecordSchema>

export type ChatThreadSummary = {
	id: string
	agentId: string | null
	agentIds: Array<string>
	title: string
	lastMessagePreview: string | null
	messageCount: number
	createdAt: string
	updatedAt: string
	deletedAt: string | null
}

export type ChatThreadListResponse = {
	ok: true
	threads: Array<ChatThreadSummary>
	hasMore: boolean
	nextCursor: string | null
	totalCount: number
}

export type ChatThreadLookupResponse = {
	ok: true
	thread: ChatThreadSummary
}

export type ChatThreadCreateResponse = {
	ok: true
	thread: ChatThreadSummary
}

export type ChatThreadUpdateResponse = {
	ok: true
	thread: ChatThreadSummary
}

export type ChatThreadAgentsUpdateResponse = {
	ok: true
	thread: ChatThreadSummary
}

export const managedChatAgentRecordSchema = object({
	id: string(),
	name: string(),
	system_prompt: string(),
	model_preset: string(),
	custom_model: optional(nullable(string())),
	is_active: number(),
	is_default: number(),
	created_at: string(),
	updated_at: string(),
	deleted_at: optional(nullable(string())),
})

export type ManagedChatAgentRecord = InferOutput<
	typeof managedChatAgentRecordSchema
>

export type ManagedChatAgent = {
	id: string
	name: string
	systemPrompt: string
	modelPreset: string
	customModel: string | null
	isActive: boolean
	isDefault: boolean
	createdAt: string
	updatedAt: string
	deletedAt: string | null
}

export type ManagedChatAgentListResponse = {
	ok: true
	agents: Array<ManagedChatAgent>
	environmentDefaultModel: string
}

export type AvailableChatAgentListResponse = {
	ok: true
	agents: Array<ManagedChatAgent>
}

export type ManagedChatAgentMutationResponse = {
	ok: true
	agent: ManagedChatAgent
}

export type ChatAssistantMessageMetadata = {
	agentId: string | null
	agentName: string | null
}
