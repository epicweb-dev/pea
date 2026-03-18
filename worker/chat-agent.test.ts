/// <reference types="bun" />
import { expect, test } from 'bun:test'
import { type UIMessage } from 'ai'
import * as chatAgentTurnSelection from './chat-agent-turn-selection.ts'

function createUserMessage(text: string): UIMessage {
	return {
		id: `user_${crypto.randomUUID()}`,
		role: 'user',
		parts: [{ type: 'text', text }],
	}
}

function createAssistantMessage(input: {
	text: string
	agentId: string
	agentName: string
}): UIMessage {
	return {
		id: `assistant_${crypto.randomUUID()}`,
		role: 'assistant',
		metadata: {
			agentId: input.agentId,
			agentName: input.agentName,
		},
		parts: [{ type: 'text', text: input.text }],
	}
}

const alphaAgent = {
	id: 'alpha-agent',
	name: 'alpha agent',
	systemPrompt: 'You help with alpha planning and architecture.',
	model: null,
}

const betaAgent = {
	id: 'beta-agent',
	name: 'beta agent',
	systemPrompt: 'You help with beta implementation and debugging.',
	model: null,
}

test('detects the one-on-one fast path', () => {
	expect(
		chatAgentTurnSelection.isOneOnOneConversation({
			selectedAgents: [alphaAgent],
			messages: [createUserMessage('hello there')],
		}),
	).toBe(true)

	expect(
		chatAgentTurnSelection.isOneOnOneConversation({
			selectedAgents: [alphaAgent, betaAgent],
			messages: [createUserMessage('hello there')],
		}),
	).toBe(false)
})

test('prefers the earliest directly mentioned agent', () => {
	const scoredCandidates = chatAgentTurnSelection.scoreAgentsForTurn({
		selectedAgents: [alphaAgent, betaAgent],
		messages: [createUserMessage('hello alpha agent and beta agent')],
	})

	expect(scoredCandidates.map((candidate) => candidate.agent.id)).toEqual([
		'alpha-agent',
		'beta-agent',
	])
	expect(scoredCandidates[0]?.rationale).toBe('direct-mention')
})

test('matches a partial direct agent name mention', () => {
	const unaAgent = {
		id: 'una-agent',
		name: 'Una the User',
		systemPrompt: 'You help as Una.',
		model: null,
	}
	const brettAgent = {
		id: 'brett-agent',
		name: 'Brett the Business Owner',
		systemPrompt: 'You help as Brett.',
		model: null,
	}
	const scoredCandidates = chatAgentTurnSelection.scoreAgentsForTurn({
		selectedAgents: [unaAgent, brettAgent],
		messages: [createUserMessage('Brett, how are you doing?')],
	})

	expect(scoredCandidates[0]?.agent.id).toBe('brett-agent')
	expect(scoredCandidates[0]?.rationale).toBe('direct-mention')
})

test('falls back to the first selected agent for ambiguous user messages', () => {
	const scoredCandidates = chatAgentTurnSelection.scoreAgentsForTurn({
		selectedAgents: [betaAgent, alphaAgent],
		messages: [createUserMessage('hello again')],
	})

	expect(scoredCandidates).toHaveLength(1)
	expect(scoredCandidates[0]?.agent.id).toBe('beta-agent')
	expect(scoredCandidates[0]?.rationale).toBe('fallback')
})

test('rotates the fallback agent after the last assistant reply', () => {
	const scoredCandidates = chatAgentTurnSelection.scoreAgentsForTurn({
		selectedAgents: [alphaAgent, betaAgent],
		messages: [
			createUserMessage('hello team'),
			createAssistantMessage({
				agentId: 'beta-agent',
				agentName: 'beta agent',
				text: 'I can take the implementation side.',
			}),
			createUserMessage('sounds good, keep going'),
		],
	})

	expect(scoredCandidates).toHaveLength(1)
	expect(scoredCandidates[0]?.agent.id).toBe('alpha-agent')
	expect(scoredCandidates[0]?.rationale).toBe('fallback')
})

test('blocks a third agent reply without a high-confidence follow-up', () => {
	const messages = [
		createUserMessage('hello team'),
		createAssistantMessage({
			agentId: 'alpha-agent',
			agentName: 'alpha agent',
			text: 'I think we should ship it.',
		}),
		createAssistantMessage({
			agentId: 'beta-agent',
			agentName: 'beta agent',
			text: 'I agree with alpha.',
		}),
	]
	const scoredCandidates = chatAgentTurnSelection.scoreAgentsForTurn({
		selectedAgents: [alphaAgent, betaAgent],
		messages,
	})

	expect(
		chatAgentTurnSelection.canAllowThirdAgentException({
			messages,
			scoredCandidates,
		}),
	).toBe(false)
})

test('allows a third reply when the latest agent explicitly asks another agent', () => {
	const messages = [
		createUserMessage('hello team'),
		createAssistantMessage({
			agentId: 'alpha-agent',
			agentName: 'alpha agent',
			text: 'I think we should ship it.',
		}),
		createAssistantMessage({
			agentId: 'beta-agent',
			agentName: 'beta agent',
			text: 'alpha agent makes a good point. beta agent, what do you think?',
		}),
	]
	const scoredCandidates = chatAgentTurnSelection.scoreAgentsForTurn({
		selectedAgents: [alphaAgent, betaAgent],
		messages,
	})

	expect(scoredCandidates[0]?.agent.id).toBe('alpha-agent')
	expect(
		chatAgentTurnSelection.canAllowThirdAgentException({
			messages,
			scoredCandidates,
		}),
	).toBe(true)
})

test('selects the locally scored responder for multi-agent user turns', () => {
	const selectedAgent = chatAgentTurnSelection.selectAgentForTurn({
		selectedAgents: [alphaAgent, betaAgent],
		messages: [createUserMessage('beta agent, can you debug this issue?')],
	})

	expect(selectedAgent?.id).toBe('beta-agent')
})

test('does not select a responder for a blocked third consecutive agent turn', () => {
	const selectedAgent = chatAgentTurnSelection.selectAgentForTurn({
		selectedAgents: [alphaAgent, betaAgent],
		messages: [
			createUserMessage('hello team'),
			createAssistantMessage({
				agentId: 'alpha-agent',
				agentName: 'alpha agent',
				text: 'I think we should ship it.',
			}),
			createAssistantMessage({
				agentId: 'beta-agent',
				agentName: 'beta agent',
				text: 'I agree with alpha.',
			}),
		],
	})

	expect(selectedAgent).toBeNull()
})

test('allows a locally selected third agent when the follow-up is explicit', () => {
	const gammaAgent = {
		id: 'gamma-agent',
		name: 'gamma agent',
		systemPrompt: 'You help with risk review and QA.',
		model: null,
	}
	const selectedAgent = chatAgentTurnSelection.selectAgentForTurn({
		selectedAgents: [alphaAgent, betaAgent, gammaAgent],
		messages: [
			createUserMessage('hello team'),
			createAssistantMessage({
				agentId: 'alpha-agent',
				agentName: 'alpha agent',
				text: 'I think we should ship it.',
			}),
			createAssistantMessage({
				agentId: 'beta-agent',
				agentName: 'beta agent',
				text: 'gamma agent, can you review the QA risk here?',
			}),
		],
	})

	expect(selectedAgent?.id).toBe('gamma-agent')
})

test('treats repeated assistant text as near-duplicate', () => {
	expect(
		chatAgentTurnSelection.isNearDuplicateAssistantReply({
			nextText: 'Beta agent can take it from here.',
			previousText: 'beta agent can take it from here',
		}),
	).toBe(true)
})
