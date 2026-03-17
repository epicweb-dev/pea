import { type Handle } from 'remix/component'
import {
	colors,
	radius,
	shadows,
	spacing,
	transitions,
	typography,
} from '#client/styles/tokens.ts'
import { type ManagedChatAgent } from '#shared/chat.ts'

type AgentMultiSelectComboboxProps = {
	id: string
	agents: Array<ManagedChatAgent>
	selectedAgentIds: Array<string>
	disabled?: boolean
	error?: string | null
	isLoading?: boolean
	onSelectionChange: (agentIds: Array<string>) => void | Promise<void>
}

function normalizeSearchValue(value: string) {
	return value.trim().toLowerCase()
}

function buildSelectedAgentNames(
	agents: Array<ManagedChatAgent>,
	selectedAgentIds: Array<string>,
) {
	const agentsById = new Map(agents.map((agent) => [agent.id, agent] as const))
	return selectedAgentIds
		.map((agentId) => agentsById.get(agentId)?.name ?? null)
		.filter((agentName): agentName is string => Boolean(agentName))
}

function resolveNextSelectedAgentIds(input: {
	selectedAgentIds: Array<string>
	toggledAgentId: string
}) {
	const selectedAgentIds = [...input.selectedAgentIds]
	const selectedAgentIdSet = new Set(selectedAgentIds)
	if (selectedAgentIdSet.has(input.toggledAgentId)) {
		if (selectedAgentIds.length <= 1) {
			return selectedAgentIds
		}
		return selectedAgentIds.filter((agentId) => agentId !== input.toggledAgentId)
	}
	return [...selectedAgentIds, input.toggledAgentId]
}

export function AgentMultiSelectCombobox(handle: Handle) {
	let isOpen = false
	let search = ''
	let highlightedAgentId: string | null = null

	function update() {
		handle.update()
	}

	function focusInput(inputId: string) {
		void handle.queueTask(async () => {
			const input = document.getElementById(inputId)
			if (!(input instanceof HTMLInputElement)) return
			input.focus()
			input.select()
		})
	}

	function focusButton(buttonId: string) {
		void handle.queueTask(async () => {
			const button = document.getElementById(buttonId)
			if (!(button instanceof HTMLButtonElement)) return
			button.focus()
		})
	}

	function getPopover(popoverId: string) {
		const popover = document.getElementById(popoverId)
		return popover instanceof HTMLElement ? popover : null
	}

	function openPopover(popoverId: string) {
		const popover = getPopover(popoverId)
		if (!popover || popover.matches(':popover-open')) return
		popover.showPopover()
	}

	function closePopover(popoverId: string) {
		const popover = getPopover(popoverId)
		if (!popover || !popover.matches(':popover-open')) return
		popover.hidePopover()
	}

	return (props: AgentMultiSelectComboboxProps) => {
		const buttonId = `${props.id}-button`
		const inputId = `${props.id}-search`
		const listboxId = `${props.id}-listbox`
		const popoverId = `${props.id}-popover`
		const anchorName = `--${props.id}-anchor`
		const selectedAgentCount = props.selectedAgentIds.length
		const normalizedSearch = normalizeSearchValue(search)
		const filteredAgents = props.agents.filter((agent) => {
			if (!normalizedSearch) return true
			return normalizeSearchValue(agent.name).includes(normalizedSearch)
		})
		const selectedAgentNameList = buildSelectedAgentNames(
			props.agents,
			props.selectedAgentIds,
		)
		const selectedAgentSummary =
			selectedAgentNameList.length > 0
				? selectedAgentNameList.join(', ')
				: 'No agents selected'
		const resolvedHighlightedAgentId =
			filteredAgents.some((agent) => agent.id === highlightedAgentId)
				? highlightedAgentId
				: filteredAgents[0]?.id ?? null

		function handlePopoverToggle(event: Event) {
			if (!(event.currentTarget instanceof HTMLElement)) return
			isOpen = event.currentTarget.matches(':popover-open')
			if (isOpen) {
				highlightedAgentId = filteredAgents[0]?.id ?? null
				update()
				focusInput(inputId)
				return
			}
			search = ''
			highlightedAgentId = null
			update()
		}

		function handleButtonKeyDown(event: KeyboardEvent) {
			if (props.disabled) return
			if (
				event.key !== 'ArrowDown' &&
				event.key !== 'ArrowUp' &&
				event.key !== 'Enter' &&
				event.key !== ' '
			) {
				return
			}
			event.preventDefault()
			openPopover(popoverId)
		}

		function handleSearchInput(event: Event) {
			if (!(event.currentTarget instanceof HTMLInputElement)) return
			search = event.currentTarget.value
			const nextFilteredAgents = props.agents.filter((agent) =>
				normalizeSearchValue(agent.name).includes(normalizeSearchValue(search)),
			)
			highlightedAgentId = nextFilteredAgents[0]?.id ?? null
			update()
		}

		function moveHighlight(direction: 1 | -1) {
			if (filteredAgents.length === 0) return
			const currentIndex = filteredAgents.findIndex(
				(agent) => agent.id === resolvedHighlightedAgentId,
			)
			const startIndex = currentIndex === -1 ? 0 : currentIndex
			const nextIndex =
				(startIndex + direction + filteredAgents.length) % filteredAgents.length
			highlightedAgentId = filteredAgents[nextIndex]?.id ?? null
			update()
		}

		function commitToggle(agentId: string) {
			const nextSelectedAgentIds = resolveNextSelectedAgentIds({
				selectedAgentIds: props.selectedAgentIds,
				toggledAgentId: agentId,
			})
			highlightedAgentId = agentId
			props.onSelectionChange(nextSelectedAgentIds)
			update()
		}

		function handleSearchKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				event.preventDefault()
				closePopover(popoverId)
				focusButton(buttonId)
				return
			}
			if (event.key === 'ArrowDown') {
				event.preventDefault()
				moveHighlight(1)
				return
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault()
				moveHighlight(-1)
				return
			}
			if (event.key === 'Enter' || event.key === ' ') {
				if (!resolvedHighlightedAgentId) return
				event.preventDefault()
				commitToggle(resolvedHighlightedAgentId)
			}
		}

		return (
			<div
				css={{
					display: 'grid',
					gap: spacing.xs,
				}}
			>
				<button
					id={buttonId}
					type="button"
					disabled={props.disabled}
					popovertarget={popoverId}
					popovertargetaction="toggle"
					aria-haspopup="listbox"
					aria-expanded={isOpen}
					aria-controls={isOpen ? listboxId : undefined}
					on={{
						keydown: handleButtonKeyDown,
					}}
					css={{
						anchorName,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: spacing.md,
						width: '100%',
						padding: `${spacing.sm} ${spacing.md}`,
						borderRadius: radius.full,
						border: `1px solid ${colors.border}`,
						backgroundColor: colors.background,
						color: colors.text,
						cursor: props.disabled ? 'not-allowed' : 'pointer',
						fontSize: typography.fontSize.sm,
						transition: `border-color ${transitions.normal}, box-shadow ${transitions.normal}`,
					}}
				>
					<span>{selectedAgentCount} agents in this chat</span>
					<span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
				</button>
				<div
					id={popoverId}
					popover="auto"
					on={{ toggle: handlePopoverToggle }}
					css={{
						position: 'fixed',
						positionAnchor: anchorName,
						inset: 'auto',
						positionArea: 'block-end span-inline-start',
						positionTryFallbacks:
							'flip-block, flip-inline, flip-block flip-inline',
						minWidth: 'anchor-size(width)',
						maxWidth: 'min(24rem, calc(100vw - 2rem))',
						maxHeight: 'calc(100dvh - 2rem)',
						margin: 0,
						gap: spacing.sm,
						padding: spacing.md,
						borderRadius: radius.lg,
						border: `1px solid ${colors.border}`,
						backgroundColor: colors.surface,
						boxShadow: shadows.md,
						overflow: 'auto',
						'&:not(:popover-open)': {
							display: 'none',
						},
						'&:popover-open': {
							display: 'grid',
						},
					}}
				>
					<div css={{ display: 'grid', gap: spacing.xs }}>
						<strong css={{ color: colors.text, fontSize: typography.fontSize.sm }}>
							Included agents
						</strong>
						<p
							css={{
								margin: 0,
								color: colors.textMuted,
								fontSize: typography.fontSize.sm,
								lineHeight: 1.5,
							}}
						>
							{selectedAgentSummary}
						</p>
					</div>
					<input
						id={inputId}
						type="search"
						autocomplete="off"
						value={search}
						placeholder="Search agents"
						aria-label="Search agents"
						on={{
							input: handleSearchInput,
							keydown: handleSearchKeyDown,
						}}
						css={{
							width: '100%',
							padding: `${spacing.xs} ${spacing.sm}`,
							borderRadius: radius.md,
							border: `1px solid ${colors.border}`,
							backgroundColor: colors.background,
							color: colors.text,
							fontFamily: typography.fontFamily,
							fontSize: typography.fontSize.sm,
						}}
					/>
					{props.error ? (
						<p css={{ margin: 0, color: colors.error, fontSize: typography.fontSize.sm }}>
							{props.error}
						</p>
					) : null}
					<div
						id={listboxId}
						role="listbox"
						aria-multiselectable="true"
						css={{
							display: 'grid',
							gap: spacing.xs,
							maxHeight: '16rem',
							overflowY: 'auto',
						}}
					>
						{props.isLoading ? (
							<p
								css={{
									margin: 0,
									color: colors.textMuted,
									fontSize: typography.fontSize.sm,
								}}
							>
								Loading agents...
							</p>
						) : filteredAgents.length === 0 ? (
							<p
								css={{
									margin: 0,
									color: colors.textMuted,
									fontSize: typography.fontSize.sm,
								}}
							>
								No agents match your search.
							</p>
						) : (
							filteredAgents.map((agent) => {
								const isSelected = props.selectedAgentIds.includes(agent.id)
								const isHighlighted = agent.id === resolvedHighlightedAgentId
								return (
									<button
										key={agent.id}
										type="button"
										role="option"
										aria-selected={isSelected}
										on={{
											click: () => commitToggle(agent.id),
											mouseenter: () => {
												highlightedAgentId = agent.id
												update()
											},
										}}
										css={{
											display: 'grid',
											gridTemplateColumns: 'auto 1fr',
											gap: spacing.sm,
											alignItems: 'start',
											width: '100%',
											padding: spacing.sm,
											borderRadius: radius.md,
											border: `1px solid ${
												isHighlighted ? colors.primary : colors.border
											}`,
											backgroundColor: isHighlighted
												? colors.primarySoftest
												: colors.surface,
											color: colors.text,
											textAlign: 'left',
											cursor: 'pointer',
										}}
									>
										<span
											aria-hidden="true"
											css={{
												display: 'inline-flex',
												alignItems: 'center',
												justifyContent: 'center',
												width: '1.25rem',
												height: '1.25rem',
												borderRadius: radius.sm,
												border: `1px solid ${
													isSelected ? colors.primary : colors.border
												}`,
												backgroundColor: isSelected
													? colors.primary
													: colors.background,
												color: isSelected
													? colors.onPrimary
													: colors.textMuted,
												fontSize: typography.fontSize.xs,
												fontWeight: typography.fontWeight.semibold,
											}}
										>
											{isSelected ? '✓' : ''}
										</span>
										<span
											css={{
												display: 'grid',
												gap: spacing.xs,
												minWidth: 0,
											}}
										>
											<span>{agent.name}</span>
											{agent.isDefault ? (
												<span
													css={{
														color: colors.textMuted,
														fontSize: typography.fontSize.xs,
													}}
												>
													Default agent
												</span>
											) : null}
										</span>
									</button>
								)
							})
						)}
					</div>
				</div>
			</div>
		)
	}
}
