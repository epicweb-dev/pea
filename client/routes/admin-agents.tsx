import { type Handle } from 'remix/component'
import { createNotifications } from '#client/notifications.tsx'
import {
	colors,
	radius,
	shadows,
	spacing,
	typography,
} from '#client/styles/tokens.ts'
import {
	chatAgentModelPresets,
	chatAgentModelDividerValue,
	envDefaultModelPreset,
	recommendedChatAgentModelPresetValues,
	type ManagedChatAgent,
	type ManagedChatAgentListResponse,
	type ManagedChatAgentMutationResponse,
} from '#shared/chat.ts'

type AdminAgentsStatus = 'loading' | 'ready' | 'saving' | 'error'

type AgentMutationResponse =
	| (ManagedChatAgentMutationResponse & { error?: string })
	| { ok?: false; error?: string }
	| null

async function fetchAgents(signal: AbortSignal) {
	const response = await fetch('/admin-agents', {
		headers: { Accept: 'application/json' },
		credentials: 'include',
		signal,
	})
	const payload = (await response.json().catch(() => null)) as
		| (ManagedChatAgentListResponse & { error?: string })
		| { ok?: false; error?: string }
		| null
	if (!response.ok || !payload?.ok || !('agents' in payload)) {
		throw new Error(payload?.error || 'Unable to load agents.')
	}
	return {
		agents: payload.agents,
		environmentDefaultModel: payload.environmentDefaultModel,
	}
}

async function createAgent(input: {
	name: string
	systemPrompt: string
	modelPreset: string
	customModel: string
	isActive: boolean
	makeDefault: boolean
}) {
	const response = await fetch('/admin-agents', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(input),
	})
	const payload = (await response
		.json()
		.catch(() => null)) as AgentMutationResponse
	if (!response.ok || !payload?.ok || !('agent' in payload) || !payload.agent) {
		throw new Error(payload?.error || 'Unable to create agent.')
	}
	return payload.agent
}

async function updateAgent(input: {
	agentId: string
	name: string
	systemPrompt: string
	modelPreset: string
	customModel: string
	isActive: boolean
}) {
	const response = await fetch('/admin-agents/update', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(input),
	})
	const payload = (await response
		.json()
		.catch(() => null)) as AgentMutationResponse
	if (!response.ok || !payload?.ok || !('agent' in payload) || !payload.agent) {
		throw new Error(payload?.error || 'Unable to update agent.')
	}
	return payload.agent
}

async function archiveAgent(agentId: string) {
	const response = await fetch('/admin-agents/delete', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify({ agentId }),
	})
	const payload = (await response.json().catch(() => null)) as
		| { ok?: true; error?: string }
		| { ok?: false; error?: string }
		| null
	if (!response.ok || !payload?.ok) {
		throw new Error(payload?.error || 'Unable to archive agent.')
	}
}

async function setDefaultAgent(agentId: string) {
	const response = await fetch('/admin-agents/default', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify({ agentId }),
	})
	const payload = (await response
		.json()
		.catch(() => null)) as AgentMutationResponse
	if (!response.ok || !payload?.ok || !('agent' in payload) || !payload.agent) {
		throw new Error(payload?.error || 'Unable to update the default agent.')
	}
	return payload.agent
}

function createEmptyDraft() {
	return {
		name: '',
		systemPrompt: '',
		modelPreset: envDefaultModelPreset,
		customModel: '',
		isActive: true,
		makeDefault: false,
	}
}

function getTestChatHref(agentId: string) {
	return `/chat?agentId=${encodeURIComponent(agentId)}`
}

const recommendedChatAgentModelPresetValueSet = new Set<string>(
	recommendedChatAgentModelPresetValues,
)

const recommendedChatAgentModelPresets = chatAgentModelPresets.filter(
	(preset) => recommendedChatAgentModelPresetValueSet.has(preset.value),
)

const additionalChatAgentModelPresets = chatAgentModelPresets.filter(
	(preset) => !recommendedChatAgentModelPresetValueSet.has(preset.value),
)

export function AdminAgentsRoute(handle: Handle) {
	let status: AdminAgentsStatus = 'loading'
	let agents: Array<ManagedChatAgent> = []
	let environmentDefaultModel = ''
	let selectedAgentId: string | null = null
	let draft = createEmptyDraft()
	const notifications = createNotifications(handle)

	function getSelectedAgent() {
		return selectedAgentId
			? (agents.find((agent) => agent.id === selectedAgentId) ?? null)
			: null
	}

	function syncDraftFromSelectedAgent() {
		const agent = getSelectedAgent()
		draft = agent
			? {
					name: agent.name,
					systemPrompt: agent.systemPrompt,
					modelPreset: agent.modelPreset,
					customModel: agent.customModel ?? '',
					isActive: agent.isActive,
					makeDefault: false,
				}
			: createEmptyDraft()
	}

	function update() {
		handle.update()
	}

	async function loadAgents(
		signal: AbortSignal,
		preferredAgentId?: string | null,
	) {
		try {
			const payload = await fetchAgents(signal)
			const nextAgents = payload.agents
			agents = nextAgents
			environmentDefaultModel = payload.environmentDefaultModel
			const nextSelectedAgentId =
				preferredAgentId &&
				nextAgents.some((agent) => agent.id === preferredAgentId)
					? preferredAgentId
					: selectedAgentId &&
						  nextAgents.some((agent) => agent.id === selectedAgentId)
						? selectedAgentId
						: (nextAgents[0]?.id ?? null)
			selectedAgentId = nextSelectedAgentId
			syncDraftFromSelectedAgent()
			status = 'ready'
			update()
		} catch (error) {
			if (signal.aborted) return
			status = 'error'
			notifications.showError(
				error instanceof Error ? error.message : 'Unable to load agents.',
				{ durationMs: 6000 },
			)
			update()
		}
	}

	function handleCreateNewAgent() {
		selectedAgentId = null
		draft = createEmptyDraft()
		update()
	}

	function handleSelectAgent(agentId: string) {
		selectedAgentId = agentId
		syncDraftFromSelectedAgent()
		update()
	}

	async function handleArchiveAgent(agent: ManagedChatAgent) {
		if (!window.confirm(`Archive "${agent.name}"?`)) {
			return
		}
		status = 'saving'
		update()
		try {
			await archiveAgent(agent.id)
			await loadAgents(new AbortController().signal)
			notifications.showSuccess(`Archived "${agent.name}".`)
			status = 'ready'
			update()
		} catch (error) {
			status = 'ready'
			const message =
				error instanceof Error ? error.message : 'Unable to archive agent.'
			notifications.showError(message)
			update()
		}
	}

	async function handleSetDefaultAgent(agent: ManagedChatAgent) {
		status = 'saving'
		update()
		try {
			const updatedAgent = await setDefaultAgent(agent.id)
			await loadAgents(new AbortController().signal, updatedAgent.id)
			notifications.showSuccess(`Default agent set to "${updatedAgent.name}".`)
			status = 'ready'
			update()
		} catch (error) {
			status = 'ready'
			const message =
				error instanceof Error
					? error.message
					: 'Unable to change the default agent.'
			notifications.showError(message)
			update()
		}
	}

	function handleTextInput(
		key: 'name' | 'systemPrompt' | 'customModel',
		event: Event,
	) {
		const target = event.currentTarget
		if (
			!(target instanceof HTMLInputElement) &&
			!(target instanceof HTMLTextAreaElement)
		) {
			return
		}
		draft = { ...draft, [key]: target.value }
		update()
	}

	function handleModelPresetInput(event: Event) {
		if (!(event.currentTarget instanceof HTMLSelectElement)) return
		draft = { ...draft, modelPreset: event.currentTarget.value }
		update()
	}

	function handleCheckboxInput(key: 'isActive' | 'makeDefault', event: Event) {
		if (!(event.currentTarget instanceof HTMLInputElement)) return
		draft = { ...draft, [key]: event.currentTarget.checked }
		update()
	}

	function getModelPresetLabel(input: { value: string; label: string }) {
		if (input.value !== envDefaultModelPreset) {
			return input.label
		}
		return environmentDefaultModel
			? `${input.label} (${environmentDefaultModel})`
			: input.label
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault()
		status = 'saving'
		update()

		try {
			const selectedAgent = getSelectedAgent()
			const savedAgent = selectedAgent
				? await updateAgent({
						agentId: selectedAgent.id,
						name: draft.name,
						systemPrompt: draft.systemPrompt,
						modelPreset: draft.modelPreset,
						customModel: draft.customModel,
						isActive: draft.isActive,
					})
				: await createAgent({
						name: draft.name,
						systemPrompt: draft.systemPrompt,
						modelPreset: draft.modelPreset,
						customModel: draft.customModel,
						isActive: draft.isActive,
						makeDefault: draft.makeDefault,
					})

			await loadAgents(new AbortController().signal, savedAgent.id)
			notifications.showSuccess(
				selectedAgent
					? `Saved "${savedAgent.name}".`
					: `Created "${savedAgent.name}".`,
			)
			status = 'ready'
			update()
		} catch (error) {
			status = 'ready'
			const message =
				error instanceof Error ? error.message : 'Unable to save the agent.'
			notifications.showError(message)
			update()
		}
	}

	return () => {
		if (status === 'loading') {
			handle.queueTask(loadAgents)
		}

		const selectedAgent = getSelectedAgent()
		const isSaving = status === 'saving'

		return (
			<section
				css={{
					display: 'grid',
					gap: spacing.lg,
				}}
			>
				<header css={{ display: 'grid', gap: spacing.xs }}>
					<h1
						css={{
							margin: 0,
							fontSize: typography.fontSize.xl,
							fontWeight: typography.fontWeight.semibold,
							color: colors.text,
						}}
					>
						Admin agents
					</h1>
					<p css={{ margin: 0, color: colors.textMuted }}>
						Manage the available chat agents and test them through direct chat
						links.
					</p>
				</header>

				{notifications.render()}

				<div
					css={{
						display: 'grid',
						gap: spacing.lg,
						gridTemplateColumns: '20rem minmax(0, 1fr)',
						alignItems: 'start',
					}}
				>
					<aside
						css={{
							display: 'grid',
							gap: spacing.md,
							padding: spacing.md,
							borderRadius: radius.lg,
							border: `1px solid ${colors.border}`,
							backgroundColor: colors.surface,
							boxShadow: shadows.sm,
						}}
					>
						<button
							type="button"
							on={{ click: handleCreateNewAgent }}
							css={{
								padding: `${spacing.sm} ${spacing.md}`,
								borderRadius: radius.full,
								border: 'none',
								backgroundColor: colors.primary,
								color: colors.onPrimary,
								cursor: 'pointer',
								fontWeight: typography.fontWeight.semibold,
							}}
						>
							Create new agent
						</button>
						{status === 'loading' ? (
							<p css={{ margin: 0, color: colors.textMuted }}>
								Loading agents…
							</p>
						) : null}
						{agents.map((agent) => {
							const isSelected = agent.id === selectedAgentId
							return (
								<div
									key={agent.id}
									css={{
										display: 'grid',
										gap: spacing.sm,
										padding: spacing.sm,
										borderRadius: radius.md,
										border: `1px solid ${
											isSelected ? colors.primary : colors.border
										}`,
										backgroundColor: isSelected
											? colors.primarySoftest
											: colors.background,
									}}
								>
									<button
										type="button"
										on={{ click: () => handleSelectAgent(agent.id) }}
										css={{
											display: 'grid',
											gap: spacing.xs,
											padding: 0,
											background: 'transparent',
											border: 'none',
											color: colors.text,
											cursor: 'pointer',
											textAlign: 'left',
										}}
									>
										<strong>{agent.name}</strong>
										<span css={{ color: colors.textMuted }}>
											{agent.isDefault ? 'Default' : 'Secondary'} ·{' '}
											{agent.isActive ? 'Active' : 'Inactive'}
										</span>
									</button>
									<div
										css={{
											display: 'flex',
											flexWrap: 'wrap',
											gap: spacing.xs,
										}}
									>
										<a
											href={getTestChatHref(agent.id)}
											css={{
												color: colors.primary,
												fontSize: typography.fontSize.sm,
											}}
										>
											Test in chat
										</a>
										{agent.isDefault ? null : (
											<button
												type="button"
												on={{ click: () => handleSetDefaultAgent(agent) }}
												disabled={isSaving}
												css={{
													padding: 0,
													background: 'transparent',
													border: 'none',
													color: colors.primary,
													cursor: 'pointer',
													fontSize: typography.fontSize.sm,
												}}
											>
												Set default
											</button>
										)}
										<button
											type="button"
											on={{ click: () => handleArchiveAgent(agent) }}
											disabled={isSaving}
											css={{
												padding: 0,
												background: 'transparent',
												border: 'none',
												color: colors.error,
												cursor: 'pointer',
												fontSize: typography.fontSize.sm,
											}}
										>
											Archive
										</button>
									</div>
								</div>
							)
						})}
					</aside>

					<form
						on={{ submit: handleSubmit }}
						css={{
							display: 'grid',
							gap: spacing.md,
							padding: spacing.lg,
							borderRadius: radius.lg,
							border: `1px solid ${colors.border}`,
							backgroundColor: colors.surface,
							boxShadow: shadows.sm,
						}}
					>
						<h2
							css={{
								margin: 0,
								fontSize: typography.fontSize.lg,
								fontWeight: typography.fontWeight.semibold,
								color: colors.text,
							}}
						>
							{selectedAgent ? `Edit ${selectedAgent.name}` : 'Create agent'}
						</h2>
						<label css={{ display: 'grid', gap: spacing.xs }}>
							<span css={{ color: colors.text }}>Name</span>
							<input
								type="text"
								value={draft.name}
								on={{ input: (event) => handleTextInput('name', event) }}
								css={{
									padding: `${spacing.xs} ${spacing.sm}`,
									borderRadius: radius.md,
									border: `1px solid ${colors.border}`,
								}}
							/>
						</label>
						<label css={{ display: 'grid', gap: spacing.xs }}>
							<span css={{ color: colors.text }}>Model preset</span>
							<select
								value={draft.modelPreset}
								on={{ change: handleModelPresetInput }}
								css={{
									padding: `${spacing.xs} ${spacing.sm}`,
									borderRadius: radius.md,
									border: `1px solid ${colors.border}`,
								}}
							>
								{recommendedChatAgentModelPresets.map((preset) => (
									<option key={preset.value} value={preset.value}>
										{getModelPresetLabel(preset)}
									</option>
								))}
								<option
									disabled
									value={chatAgentModelDividerValue}
									aria-hidden="true"
								>
									──────── More Workers AI models ────────
								</option>
								{additionalChatAgentModelPresets.map((preset) => (
									<option key={preset.value} value={preset.value}>
										{getModelPresetLabel(preset)}
									</option>
								))}
							</select>
						</label>
						<label css={{ display: 'grid', gap: spacing.xs }}>
							<span css={{ color: colors.text }}>Custom model override</span>
							<input
								type="text"
								value={draft.customModel}
								placeholder="@cf/..."
								on={{ input: (event) => handleTextInput('customModel', event) }}
								css={{
									padding: `${spacing.xs} ${spacing.sm}`,
									borderRadius: radius.md,
									border: `1px solid ${colors.border}`,
								}}
							/>
						</label>
						<label css={{ display: 'grid', gap: spacing.xs }}>
							<span css={{ color: colors.text }}>System prompt</span>
							<textarea
								value={draft.systemPrompt}
								rows={12}
								on={{
									input: (event) => handleTextInput('systemPrompt', event),
								}}
								css={{
									padding: spacing.sm,
									borderRadius: radius.md,
									border: `1px solid ${colors.border}`,
									fontFamily: typography.fontFamily,
									fontSize: typography.fontSize.sm,
									lineHeight: 1.5,
								}}
							/>
						</label>
						<label
							css={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}
						>
							<input
								type="checkbox"
								checked={draft.isActive}
								on={{
									change: (event) => handleCheckboxInput('isActive', event),
								}}
							/>
							<span css={{ color: colors.text }}>Agent is active</span>
						</label>
						{selectedAgent ? null : (
							<label
								css={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}
							>
								<input
									type="checkbox"
									checked={draft.makeDefault}
									on={{
										change: (event) =>
											handleCheckboxInput('makeDefault', event),
									}}
								/>
								<span css={{ color: colors.text }}>
									Make this the default agent
								</span>
							</label>
						)}
						<div css={{ display: 'flex', gap: spacing.sm }}>
							<button
								type="submit"
								disabled={isSaving}
								css={{
									padding: `${spacing.sm} ${spacing.md}`,
									borderRadius: radius.full,
									border: 'none',
									backgroundColor: colors.primary,
									color: colors.onPrimary,
									cursor: isSaving ? 'not-allowed' : 'pointer',
									fontWeight: typography.fontWeight.semibold,
								}}
							>
								{isSaving
									? 'Saving…'
									: selectedAgent
										? 'Save changes'
										: 'Create agent'}
							</button>
							{selectedAgent ? (
								<button
									type="button"
									on={{ click: handleCreateNewAgent }}
									css={{
										padding: `${spacing.sm} ${spacing.md}`,
										borderRadius: radius.full,
										border: `1px solid ${colors.border}`,
										backgroundColor: colors.background,
										color: colors.text,
										cursor: 'pointer',
									}}
								>
									Create another
								</button>
							) : null}
						</div>
					</form>
				</div>
			</section>
		)
	}
}
