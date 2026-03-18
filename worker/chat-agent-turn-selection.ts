import { type UIMessage } from 'ai'
import { type ChatAssistantMessageMetadata } from '#shared/chat.ts'

export type ThreadAgentConfig = {
	id: string
	name: string
	systemPrompt: string
	model: string | null
}

type AgentMentionMatch = {
	directMentionCount: number
	earliestMentionIndex: number | null
}

export type AgentResponseCandidate = {
	agent: ThreadAgentConfig
	score: number
	directMentionCount: number
	earliestMentionIndex: number | null
	originalIndex: number
	rationale: string
}

const thirdAgentReplyScoreThreshold = 140
const thirdAgentReplyScoreLeadThreshold = 15
const keywordStopWords = new Set([
	'a',
	'an',
	'and',
	'are',
	'assistant',
	'chat',
	'for',
	'from',
	'have',
	'help',
	'into',
	'that',
	'the',
	'they',
	'this',
	'user',
	'with',
	'you',
	'your',
	'agent',
])

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
			typeof metadata.agentId === 'string'
				? metadata.agentId.trim() || null
				: null,
		agentName:
			typeof metadata.agentName === 'string'
				? metadata.agentName.trim() || null
				: null,
	} satisfies ChatAssistantMessageMetadata
}

export function normalizeAgentMatchValue(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
}

export function getMessageText(message: UIMessage) {
	return getTextParts(message).join('\n').trim()
}

export function getAgentMentionMatch(
	text: string,
	agent: ThreadAgentConfig,
): AgentMentionMatch {
	const normalizedText = normalizeAgentMatchValue(text)
	if (!normalizedText) {
		return {
			directMentionCount: 0,
			earliestMentionIndex: null,
		}
	}
	const candidateValues = [
		normalizeAgentMatchValue(agent.name),
		normalizeAgentMatchValue(agent.id),
		...extractSearchTokens(agent.name),
	].filter(Boolean)
	let directMentionCount = 0
	let earliestMentionIndex: number | null = null
	for (const candidateValue of new Set(candidateValues)) {
		const mentionIndex = normalizedText.indexOf(candidateValue)
		if (mentionIndex === -1) continue
		directMentionCount += 1
		earliestMentionIndex =
			earliestMentionIndex === null
				? mentionIndex
				: Math.min(earliestMentionIndex, mentionIndex)
	}
	return {
		directMentionCount,
		earliestMentionIndex,
	}
}

function extractSearchTokens(value: string) {
	return [...new Set(
		normalizeAgentMatchValue(value)
			.split(' ')
			.filter(
				(token) => token.length >= 3 && !keywordStopWords.has(token),
			),
	)]
}

function getKeywordOverlapScore(text: string, agent: ThreadAgentConfig) {
	const messageTokens = new Set(extractSearchTokens(text))
	if (messageTokens.size === 0) return 0
	const agentTokens = extractSearchTokens(`${agent.name} ${agent.systemPrompt}`)
	let overlapCount = 0
	for (const agentToken of agentTokens) {
		if (messageTokens.has(agentToken)) {
			overlapCount += 1
		}
	}
	return overlapCount * 8
}

function getLastAssistantAgentId(messages: Array<UIMessage>) {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index]
		if (!message || message.role !== 'assistant') {
			continue
		}
		const metadata = getAssistantMessageMetadata(message)
		if (metadata?.agentId) {
			return metadata.agentId
		}
	}
	return null
}

export function getConsecutiveAgentMessageCount(messages: Array<UIMessage>) {
	let consecutiveAgentMessages = 0
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index]
		if (!message || message.role !== 'assistant') {
			break
		}
		consecutiveAgentMessages += 1
	}
	return consecutiveAgentMessages
}

export function isOneOnOneConversation(input: {
	selectedAgents: Array<ThreadAgentConfig>
	messages: Array<UIMessage>
}) {
	return (
		input.selectedAgents.length === 1 &&
		input.messages.at(-1)?.role === 'user'
	)
}

export function scoreAgentForMessage(input: {
	agent: ThreadAgentConfig
	originalIndex: number
	latestMessage: UIMessage
}) {
	if (
		input.latestMessage.role !== 'user' &&
		input.latestMessage.role !== 'assistant'
	) {
		return null
	}
	const latestMessageText = getMessageText(input.latestMessage)
	const mentionMatch = getAgentMentionMatch(latestMessageText, input.agent)
	const latestAssistantMetadata =
		input.latestMessage.role === 'assistant'
			? getAssistantMessageMetadata(input.latestMessage)
			: null
	if (latestAssistantMetadata?.agentId === input.agent.id) {
		return null
	}
	if (
		input.latestMessage.role === 'assistant' &&
		mentionMatch.directMentionCount === 0
	) {
		return null
	}
	const mentionScore = mentionMatch.directMentionCount * 100
	const mentionPositionScore =
		mentionMatch.earliestMentionIndex === null
			? 0
			: Math.max(0, 25 - Math.min(mentionMatch.earliestMentionIndex, 25))
	const keywordOverlapScore =
		input.latestMessage.role === 'user'
			? getKeywordOverlapScore(latestMessageText, input.agent)
			: 0
	const assistantFollowUpScore =
		input.latestMessage.role === 'assistant' &&
		mentionMatch.directMentionCount > 0
			? latestMessageText.includes('?')
				? 60
				: 40
			: 0
	const score =
		mentionScore +
		mentionPositionScore +
		keywordOverlapScore +
		assistantFollowUpScore
	if (score === 0) {
		return null
	}
	return {
		agent: input.agent,
		score,
		directMentionCount: mentionMatch.directMentionCount,
		earliestMentionIndex: mentionMatch.earliestMentionIndex,
		originalIndex: input.originalIndex,
		rationale:
			mentionMatch.directMentionCount > 0
				? 'direct-mention'
				: keywordOverlapScore > 0
					? 'keyword-overlap'
					: 'fallback',
	} satisfies AgentResponseCandidate
}

function compareAgentResponseCandidates(
	left: AgentResponseCandidate,
	right: AgentResponseCandidate,
) {
	if (left.score !== right.score) {
		return right.score - left.score
	}
	const leftMentionIndex = left.earliestMentionIndex ?? Number.POSITIVE_INFINITY
	const rightMentionIndex =
		right.earliestMentionIndex ?? Number.POSITIVE_INFINITY
	if (leftMentionIndex !== rightMentionIndex) {
		return leftMentionIndex - rightMentionIndex
	}
	if (left.directMentionCount !== right.directMentionCount) {
		return right.directMentionCount - left.directMentionCount
	}
	return left.originalIndex - right.originalIndex
}

export function scoreAgentsForTurn(input: {
	selectedAgents: Array<ThreadAgentConfig>
	messages: Array<UIMessage>
}) {
	const latestMessage = input.messages.at(-1)
	if (!latestMessage) return []
	const scoredCandidates = input.selectedAgents
		.map((agent, originalIndex) =>
			scoreAgentForMessage({
				agent,
				originalIndex,
				latestMessage,
			}),
		)
		.filter(
			(candidate): candidate is AgentResponseCandidate => Boolean(candidate),
		)
		.sort(compareAgentResponseCandidates)
	if (scoredCandidates.length > 0) {
		return scoredCandidates
	}
	if (latestMessage.role !== 'user') {
		return []
	}
	const lastAssistantAgentId = getLastAssistantAgentId(input.messages)
	const lastAssistantAgentIndex = lastAssistantAgentId
		? input.selectedAgents.findIndex((agent) => agent.id === lastAssistantAgentId)
		: -1
	const fallbackAgent =
		lastAssistantAgentIndex >= 0
			? input.selectedAgents[
					(lastAssistantAgentIndex + 1) % input.selectedAgents.length
				]
			: input.selectedAgents[0]
	if (!fallbackAgent) return []
	return [
		{
			agent: fallbackAgent,
			score: lastAssistantAgentIndex >= 0 ? 2 : 1,
			directMentionCount: 0,
			earliestMentionIndex: null,
			originalIndex:
				lastAssistantAgentIndex >= 0
					? (lastAssistantAgentIndex + 1) % input.selectedAgents.length
					: 0,
			rationale: 'fallback',
		},
	]
}

export function canAllowThirdAgentException(input: {
	messages: Array<UIMessage>
	scoredCandidates: Array<AgentResponseCandidate>
}) {
	const consecutiveAgentMessages = getConsecutiveAgentMessageCount(input.messages)
	if (consecutiveAgentMessages < 2) {
		return true
	}
	if (consecutiveAgentMessages >= 3) {
		return false
	}
	const latestMessage = input.messages.at(-1)
	if (!latestMessage || latestMessage.role !== 'assistant') {
		return false
	}
	const bestCandidate = input.scoredCandidates[0]
	const secondBestCandidate = input.scoredCandidates[1]
	if (!bestCandidate) {
		return false
	}
	if (
		bestCandidate.directMentionCount === 0 ||
		!getMessageText(latestMessage).includes('?')
	) {
		return false
	}
	if (bestCandidate.score < thirdAgentReplyScoreThreshold) {
		return false
	}
	if (
		secondBestCandidate &&
		bestCandidate.score - secondBestCandidate.score <
			thirdAgentReplyScoreLeadThreshold
	) {
		return false
	}
	return true
}

export function selectAgentForTurn(input: {
	selectedAgents: Array<ThreadAgentConfig>
	messages: Array<UIMessage>
}) {
	if (isOneOnOneConversation(input)) {
		return input.selectedAgents[0] ?? null
	}

	const scoredCandidates = scoreAgentsForTurn(input)
	const selectedCandidate = scoredCandidates[0]
	if (!selectedCandidate) return null

	if (
		input.messages.at(-1)?.role === 'assistant' &&
		!canAllowThirdAgentException({
			messages: input.messages,
			scoredCandidates,
		})
	) {
		return null
	}

	return selectedCandidate.agent
}

function normalizeResponseText(text: string) {
	return normalizeAgentMatchValue(text).replace(/\s+/g, ' ').trim()
}

export function isNearDuplicateAssistantReply(input: {
	nextText: string
	previousText: string
}) {
	const nextText = normalizeResponseText(input.nextText)
	const previousText = normalizeResponseText(input.previousText)
	if (!nextText || !previousText) return false
	return (
		nextText === previousText ||
		nextText.includes(previousText) ||
		previousText.includes(nextText)
	)
}
