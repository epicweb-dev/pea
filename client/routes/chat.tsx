import { type Handle } from 'remix/component'
import { AgentMultiSelectCombobox } from '#client/agent-multi-select-combobox.tsx'
import { ChatClient, type ChatClientSnapshot } from '#client/chat-client.ts'
import { navigate, routerEvents } from '#client/client-router.tsx'
import { createDoubleCheck } from '#client/double-check.ts'
import { EditableText } from '#client/editable-text.tsx'
import {
	createInfiniteList,
	type InfiniteListSnapshot,
} from '#client/infinite-list.ts'
import {
	captureScrollAnchor,
	getScrollFades,
	isScrolledNearEdge,
	restoreScrollAnchorAfterPrepend,
	scrollToEdge,
} from '#client/scroll-container.ts'
import { fetchSessionInfo } from '#client/session.ts'
import { createSpinDelay } from '#client/spin-delay.ts'
import {
	breakpoints,
	colors,
	mq,
	radius,
	shadows,
	spacing,
	transitions,
	typography,
} from '#client/styles/tokens.ts'
import {
	type AvailableChatAgentListResponse,
	type ChatThreadLookupResponse,
	type ChatThreadListResponse,
	type ChatThreadSummary,
	type ChatThreadAgentsUpdateResponse,
	type ChatThreadUpdateResponse,
	type ManagedChatAgent,
} from '#shared/chat.ts'

type ThreadStatus = 'idle' | 'loading' | 'ready' | 'error'
type AvailableAgentsStatus = 'loading' | 'ready' | 'error'

function getSelectedThreadIdFromLocation() {
	if (typeof window === 'undefined') return null
	const prefix = '/chat/'
	if (!window.location.pathname.startsWith(prefix)) return null
	const rest = window.location.pathname.slice(prefix.length).replace(/\/+$/, '')
	const threadId = rest.split('/')[0]?.trim() ?? ''
	return threadId || null
}

function getRequestedAgentIdsFromLocation() {
	if (typeof window === 'undefined') return null
	const url = new URL(window.location.href)
	const requestedAgentIds = [
		...url.searchParams
			.getAll('agentIds')
			.flatMap((value) => value.split(','))
			.map((value) => value.trim())
			.filter(Boolean),
		url.searchParams.get('agentId')?.trim() ?? '',
	].filter(Boolean)
	const uniqueAgentIds = new Set(requestedAgentIds)
	return uniqueAgentIds.size > 0 ? [...uniqueAgentIds] : null
}

function buildThreadHref(threadId: string) {
	return `/chat/${threadId}`
}

const MESSAGES_SCROLL_CONTAINER_ID = 'chat-messages-scroll-container'
const THREAD_LIST_SCROLL_CONTAINER_ID = 'chat-thread-list-scroll-container'
const MESSAGES_SCROLL_THRESHOLD_PX = 96
const THREAD_LIST_SCROLL_THRESHOLD_PX = 96
const MESSAGE_SCROLL_FADE_HEIGHT = '2.5rem'
const THREADS_PAGE_LIMIT = 100
const THREAD_LIST_PREFETCH_MAX_PAGES = 100
const deletedThreadBroadcastStorageKey = 'pea.chat.deleted-thread'

function truncatePreview(text: string) {
	const normalized = text.trim()
	if (!normalized) return ''
	return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized
}

function broadcastDeletedThread(threadId: string) {
	if (typeof window === 'undefined') return
	window.localStorage.setItem(
		deletedThreadBroadcastStorageKey,
		JSON.stringify({
			threadId,
			timestamp: Date.now(),
		}),
	)
}

function normalizeSelectedAgentIds(agentIds?: ReadonlyArray<string> | null) {
	const uniqueAgentIds = new Set<string>()
	for (const agentId of agentIds ?? []) {
		const normalizedAgentId = agentId.trim()
		if (!normalizedAgentId) continue
		uniqueAgentIds.add(normalizedAgentId)
	}
	return [...uniqueAgentIds]
}

function createInitialSnapshot(): ChatClientSnapshot {
	return {
		messages: [],
		totalMessageCount: 0,
		streamingText: '',
		streamingMessageMetadata: null,
		isStreaming: false,
		hasOlderMessages: false,
		isLoadingMessages: false,
		isLoadingOlderMessages: false,
		error: null,
		connected: false,
	}
}

function buildThreadPreviewFromMessages(
	messages: ChatClientSnapshot['messages'],
) {
	const lastMessage = messages.at(-1)
	if (!lastMessage) return null
	const text = lastMessage.parts
		.filter(
			(
				part,
			): part is Extract<
				(typeof lastMessage.parts)[number],
				{ type: 'text'; text: string }
			> => part.type === 'text' && typeof part.text === 'string',
		)
		.map((part) => part.text)
		.join('\n')
		.trim()
	return text ? truncatePreview(text) : null
}

function getAssistantSpeakerName(
	message: ChatClientSnapshot['messages'][number],
) {
	if (message.role !== 'assistant') return 'You'
	if (!message.metadata || typeof message.metadata !== 'object') {
		return 'Assistant'
	}
	const agentName =
		'agentName' in message.metadata &&
		typeof message.metadata.agentName === 'string'
			? message.metadata.agentName.trim()
			: ''
	return agentName || 'Assistant'
}

function getStreamingSpeakerName(snapshot: ChatClientSnapshot) {
	return snapshot.streamingMessageMetadata?.agentName?.trim() || 'Assistant'
}

async function fetchThreads(input?: {
	cursor?: string | null
	signal?: AbortSignal
	search?: string
}) {
	const url = new URL('/chat-threads', window.location.href)
	if (input?.cursor) {
		url.searchParams.set('cursor', input.cursor)
	}
	url.searchParams.set('limit', String(THREADS_PAGE_LIMIT))
	const search = input?.search?.trim()
	if (search) {
		url.searchParams.set('q', search)
	}
	const response = await fetch(url.toString(), {
		credentials: 'include',
		headers: { Accept: 'application/json' },
		signal: input?.signal,
	})
	const payload = (await response.json().catch(() => null)) as
		| (ChatThreadListResponse & {
				error?: string
		  })
		| { ok?: false; error?: string }
		| null
	if (
		!response.ok ||
		!payload?.ok ||
		!('threads' in payload) ||
		!Array.isArray(payload.threads) ||
		typeof payload.totalCount !== 'number' ||
		typeof payload.hasMore !== 'boolean'
	) {
		throw new Error(payload?.error || 'Unable to load threads.')
	}
	return {
		items: payload.threads,
		hasMore: payload.hasMore,
		nextCursor: payload.nextCursor,
		totalCount: payload.totalCount,
	}
}

async function fetchThreadById(threadId: string, signal?: AbortSignal) {
	const url = new URL('/chat-threads', window.location.href)
	url.searchParams.set('threadId', threadId)
	const response = await fetch(url.toString(), {
		credentials: 'include',
		headers: { Accept: 'application/json' },
		signal,
	})
	const payload = (await response.json().catch(() => null)) as
		| (ChatThreadLookupResponse & {
				error?: string
		  })
		| { ok?: false; error?: string }
		| null
	if (
		!response.ok ||
		!payload?.ok ||
		!('thread' in payload) ||
		!payload.thread
	) {
		throw new Error(payload?.error || 'Unable to load the selected thread.')
	}
	return payload.thread
}

async function createThread(input?: { agentIds?: Array<string> | null }) {
	const response = await fetch('/chat-threads', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			agentIds: input?.agentIds ?? [],
		}),
	})
	const payload = (await response.json().catch(() => null)) as {
		ok?: boolean
		thread?: ChatThreadSummary
		error?: string
	} | null
	if (!response.ok || !payload?.ok || !payload.thread) {
		throw new Error(payload?.error || 'Unable to create thread.')
	}
	return payload.thread
}

async function fetchAvailableAgents(signal?: AbortSignal) {
	const response = await fetch('/chat-agents', {
		credentials: 'include',
		headers: { Accept: 'application/json' },
		signal,
	})
	const payload = (await response.json().catch(() => null)) as
		| (AvailableChatAgentListResponse & { error?: string })
		| { ok?: false; error?: string }
		| null
	if (!response.ok || !payload?.ok || !('agents' in payload)) {
		throw new Error(payload?.error || 'Unable to load agents.')
	}
	return payload.agents
}

async function deleteThread(threadId: string) {
	const response = await fetch('/chat-threads/delete', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ threadId }),
	})
	const payload = (await response.json().catch(() => null)) as {
		ok?: boolean
		error?: string
	} | null
	if (!response.ok || !payload?.ok) {
		throw new Error(payload?.error || 'Unable to delete thread.')
	}
}

async function updateThreadTitle(threadId: string, title: string) {
	const response = await fetch('/chat-threads/update', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ threadId, title }),
	})
	const payload = (await response.json().catch(() => null)) as
		| (ChatThreadUpdateResponse & { error?: string })
		| { ok?: false; error?: string }
		| null
	if (
		!response.ok ||
		!payload?.ok ||
		!('thread' in payload) ||
		!payload.thread
	) {
		throw new Error(payload?.error || 'Unable to update thread title.')
	}
	return payload.thread
}

async function updateThreadAgents(threadId: string, agentIds: Array<string>) {
	const response = await fetch('/chat-threads/agents', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ threadId, agentIds }),
	})
	const payload = (await response.json().catch(() => null)) as
		| (ChatThreadAgentsUpdateResponse & { error?: string })
		| { ok?: false; error?: string }
		| null
	if (
		!response.ok ||
		!payload?.ok ||
		!('thread' in payload) ||
		!payload.thread
	) {
		throw new Error(payload?.error || 'Unable to update chat agents.')
	}
	return payload.thread
}

function renderMessageParts(
	parts: Array<{
		type: string
		text?: string
		state?: string
		input?: unknown
		output?: unknown
		errorText?: string
	}>,
) {
	return parts.map((part, index) => {
		if (part.type === 'text') {
			return (
				<p
					key={`${part.type}-${index}`}
					css={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
				>
					{part.text}
				</p>
			)
		}

		if (part.type.startsWith('tool-')) {
			return (
				<div
					key={`${part.type}-${index}`}
					css={{
						display: 'grid',
						gap: spacing.xs,
						padding: spacing.sm,
						borderRadius: radius.md,
						border: `1px solid ${colors.border}`,
						backgroundColor: colors.surface,
						fontSize: typography.fontSize.sm,
					}}
				>
					<strong>{part.type.replace(/^tool-/, '')}</strong>
					<span css={{ color: colors.textMuted }}>State: {part.state}</span>
					{part.input !== undefined ? (
						<code css={{ whiteSpace: 'pre-wrap' }}>
							Input: {JSON.stringify(part.input)}
						</code>
					) : null}
					{part.output !== undefined ? (
						<code css={{ whiteSpace: 'pre-wrap' }}>
							Output: {JSON.stringify(part.output)}
						</code>
					) : null}
					{part.errorText ? (
						<span css={{ color: colors.error }}>{part.errorText}</span>
					) : null}
				</div>
			)
		}

		return null
	})
}

function renderPaperAirplaneIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			css={{ width: '1.125rem', height: '1.125rem' }}
		>
			<path
				d="M21 3 10 14"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.75"
			/>
			<path
				d="m21 3-7 18-4-7-7-4 18-7Z"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.75"
			/>
		</svg>
	)
}

function renderTrashIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			css={{ width: '1rem', height: '1rem' }}
		>
			<path
				d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h2v8H7V9Zm4 0h2v8h-2V9Zm4 0h2v8h-2V9ZM6 7h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7Z"
				fill="currentColor"
			/>
		</svg>
	)
}

const SEND_BUTTON_SIZE_REM = 2.5
const SEND_BUTTON_INSET_REM = 0.375
const INPUT_MIN_HEIGHT_REM = SEND_BUTTON_SIZE_REM + SEND_BUTTON_INSET_REM * 2
const INPUT_MIN_HEIGHT_PX = INPUT_MIN_HEIGHT_REM * 16
const INPUT_MIN_HEIGHT = `${INPUT_MIN_HEIGHT_REM}rem`
const INPUT_RIGHT_PADDING = `${SEND_BUTTON_SIZE_REM + SEND_BUTTON_INSET_REM * 2}rem`
const SEND_BUTTON_SIZE = `${SEND_BUTTON_SIZE_REM}rem`
const SEND_BUTTON_INSET = `${SEND_BUTTON_INSET_REM}rem`
const CHAT_PANEL_HEIGHT = 'calc(100dvh - 7rem)'
const MOBILE_CHAT_PANEL_HEIGHT = 'calc(100dvh - 9rem)'
const MOBILE_LAYOUT_MEDIA_QUERY = `(max-width: ${breakpoints.mobile})`
const CHAT_HEADER_STACK_MEDIA_QUERY = '@media (max-width: 900px)'
/**
 * The outer border should follow the button's contour plus its inset from the edge.
 * radius = button radius + inset
 */
const SEND_BUTTON_RADIUS = `${SEND_BUTTON_SIZE_REM / 2 + SEND_BUTTON_INSET_REM}rem`

function resizeMessageInput(target: EventTarget | null) {
	if (!(target instanceof HTMLTextAreaElement)) return
	target.style.height = INPUT_MIN_HEIGHT
	const height = Math.max(target.scrollHeight, INPUT_MIN_HEIGHT_PX)
	target.style.height = `${height}px`
}

export function ChatRoute(handle: Handle) {
	let threadListSnapshot: InfiniteListSnapshot<ChatThreadSummary> = {
		items: [],
		hasMore: false,
		totalCount: 0,
		error: null,
		isLoadingInitial: false,
		isLoadingMore: false,
	}
	let threadStatus: ThreadStatus = 'loading'
	let threadError: string | null = null
	let threadListCursor: string | null = null
	let activeThreadId: string | null = null
	let threadSearch = ''
	let chatSnapshot = createInitialSnapshot()
	let activeClient: ChatClient | null = null
	let actionError: string | null = null
	let availableAgents: Array<ManagedChatAgent> = []
	let availableAgentsStatus: AvailableAgentsStatus = 'loading'
	let availableAgentsError: string | null = null
	let draftAgentIds = normalizeSelectedAgentIds(
		getRequestedAgentIdsFromLocation(),
	)
	let syncInFlight = false
	/** False until loadInitial succeeds at least once (avoids stuck empty after didLoad false). */
	let threadsListHydrated = false
	let chatDataBootstrapPromise: Promise<void> | null = null
	let refreshThreadsController: AbortController | null = null
	let loadMoreThreadsController: AbortController | null = null
	let shouldAutoScrollMessages = true
	let showMessageScrollFadeTop = false
	let showMessageScrollFadeBottom = false
	let showThreadListScrollFadeTop = false
	let showThreadListScrollFadeBottom = false
	let isMobileViewport =
		typeof window !== 'undefined'
			? window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches
			: false
	const disconnectedIndicator = createSpinDelay(handle, { ssr: false })
	const agentMultiSelectCombobox = AgentMultiSelectCombobox(handle)
	const deleteThreadChecks = new Map<
		string,
		ReturnType<typeof createDoubleCheck>
	>()
	const threadList = createInfiniteList<ChatThreadSummary>({
		mergeDirection: 'append',
		getKey: (thread) => thread.id,
		onSnapshot(snapshot) {
			threadListSnapshot = snapshot
			if (deleteThreadChecks.size) {
				const activeThreadIds = new Set(
					snapshot.items.map((thread) => thread.id),
				)
				for (const threadId of deleteThreadChecks.keys()) {
					if (!activeThreadIds.has(threadId)) {
						deleteThreadChecks.delete(threadId)
					}
				}
			}
			threadError = snapshot.error
			if (snapshot.isLoadingInitial) {
				threadStatus = 'loading'
			} else if (snapshot.error) {
				threadStatus = 'error'
			} else {
				threadStatus = 'ready'
			}
			update()
		},
	})

	function update() {
		handle.update()
	}

	function createAbortController() {
		const controller = new AbortController()
		if (handle.signal.aborted) {
			controller.abort()
		} else {
			handle.signal.addEventListener('abort', () => controller.abort(), {
				once: true,
			})
		}
		return controller
	}

	function startRefreshThreads() {
		refreshThreadsController?.abort()
		const controller = createAbortController()
		refreshThreadsController = controller
		void refreshThreads(controller.signal).finally(() => {
			if (refreshThreadsController === controller) {
				refreshThreadsController = null
			}
		})
	}

	function startLoadMoreThreads() {
		if (loadMoreThreadsController) return
		const controller = createAbortController()
		loadMoreThreadsController = controller
		void loadMoreThreads(controller.signal).finally(() => {
			if (loadMoreThreadsController === controller) {
				loadMoreThreadsController = null
			}
		})
	}

	function setThreadState(
		nextStatus: ThreadStatus,
		nextError: string | null = null,
	) {
		threadStatus = nextStatus
		threadError = nextError
		update()
	}

	function resetChatSnapshot() {
		chatSnapshot = createInitialSnapshot()
	}

	function resetActiveThreadConnection() {
		activeClient?.close()
		activeClient = null
		activeThreadId = null
		resetChatSnapshot()
		disconnectedIndicator.reset()
		setMessageScrollFades(false, false)
	}

	function getThreads() {
		return threadListSnapshot.items
	}

	function getActiveThreadSummary() {
		if (!activeThreadId) return null
		return getThreads().find((thread) => thread.id === activeThreadId) ?? null
	}

	function getSelectedAgentIds() {
		return getActiveThreadSummary()?.agentIds ?? draftAgentIds
	}

	function syncDraftAgentIds() {
		const selectedAgentIds = normalizeSelectedAgentIds(draftAgentIds)
		const availableAgentIdSet = new Set(
			availableAgents.map((agent) => agent.id),
		)
		const nextDraftAgentIds = selectedAgentIds.filter((agentId) =>
			availableAgentIdSet.has(agentId),
		)
		if (nextDraftAgentIds.length > 0) {
			draftAgentIds = nextDraftAgentIds
			return
		}

		const requestedAgentIds = normalizeSelectedAgentIds(
			getRequestedAgentIdsFromLocation(),
		).filter((agentId) => availableAgentIdSet.has(agentId))
		if (requestedAgentIds.length > 0) {
			draftAgentIds = requestedAgentIds
			return
		}

		const defaultAgentId =
			availableAgents.find((agent) => agent.isDefault)?.id ??
			availableAgents[0]?.id ??
			null
		draftAgentIds = defaultAgentId ? [defaultAgentId] : []
	}

	function updateThreadListFromSnapshot(
		updater: (threads: Array<ChatThreadSummary>) => Array<ChatThreadSummary>,
	) {
		threadList.updateItems(updater)
	}

	function updateLocalThreadSummary(
		threadId: string,
		snapshot: ChatClientSnapshot,
	) {
		updateThreadListFromSnapshot((threads) => {
			const threadIndex = threads.findIndex((thread) => thread.id === threadId)
			if (threadIndex === -1) return threads
			const existingThread = threads[threadIndex]
			if (!existingThread) return threads
			const nextThread: ChatThreadSummary = {
				...existingThread,
				messageCount: snapshot.totalMessageCount,
				lastMessagePreview: buildThreadPreviewFromMessages(snapshot.messages),
			}
			if (threadSearch.trim()) {
				return threads.map((thread) =>
					thread.id === threadId ? nextThread : thread,
				)
			}
			const remainingThreads = threads.filter(
				(thread) => thread.id !== threadId,
			)
			return [nextThread, ...remainingThreads]
		})
	}

	function handleDeletedThread(threadId: string) {
		deleteThreadChecks.delete(threadId)
		updateThreadListFromSnapshot((threads) =>
			threads.filter((thread) => thread.id !== threadId),
		)
		scheduleThreadListScrollFadeSync()
		if (activeThreadId !== threadId) {
			update()
			return
		}
		resetActiveThreadConnection()
		const nextThread = getThreads()[0]
		if (nextThread) {
			navigate(buildThreadHref(nextThread.id))
			void connectThread(nextThread.id)
			return
		}
		navigate('/chat')
		update()
	}

	function syncDisconnectedIndicator() {
		disconnectedIndicator.setLoading(
			Boolean(activeThreadId) && !chatSnapshot.connected,
		)
	}

	function setMessageScrollFades(
		nextTopVisible: boolean,
		nextBottomVisible: boolean,
	) {
		if (
			showMessageScrollFadeTop === nextTopVisible &&
			showMessageScrollFadeBottom === nextBottomVisible
		) {
			return
		}

		showMessageScrollFadeTop = nextTopVisible
		showMessageScrollFadeBottom = nextBottomVisible
		update()
	}

	function syncMessageScrollFades(target?: HTMLDivElement | null) {
		const container =
			target ??
			(() => {
				const element = document.getElementById(MESSAGES_SCROLL_CONTAINER_ID)
				return element instanceof HTMLDivElement ? element : null
			})()
		const fades = getScrollFades(container)
		setMessageScrollFades(fades.top, fades.bottom)
	}

	function scheduleMessageScrollFadeSync() {
		void handle.queueTask(async () => {
			syncMessageScrollFades()
		})
	}

	function setThreadListScrollFades(
		nextTopVisible: boolean,
		nextBottomVisible: boolean,
	) {
		if (
			showThreadListScrollFadeTop === nextTopVisible &&
			showThreadListScrollFadeBottom === nextBottomVisible
		) {
			return
		}

		showThreadListScrollFadeTop = nextTopVisible
		showThreadListScrollFadeBottom = nextBottomVisible
		update()
	}

	function syncThreadListScrollFades(target?: HTMLDivElement | null) {
		const container =
			target ??
			(() => {
				const element = document.getElementById(THREAD_LIST_SCROLL_CONTAINER_ID)
				return element instanceof HTMLDivElement ? element : null
			})()
		const fades = getScrollFades(container)
		setThreadListScrollFades(fades.top, fades.bottom)
	}

	function scheduleThreadListScrollFadeSync() {
		void handle.queueTask(async () => {
			syncThreadListScrollFades()
		})
	}

	function syncMobileViewportState(matches: boolean) {
		const viewportChanged = isMobileViewport !== matches
		isMobileViewport = matches
		if (viewportChanged) {
			update()
			void syncActiveThreadFromLocation()
		}
	}

	function scheduleScrollToBottom(force = false) {
		void handle.queueTask(async () => {
			const container = document.getElementById(MESSAGES_SCROLL_CONTAINER_ID)
			if (!(container instanceof HTMLDivElement)) {
				setMessageScrollFades(false, false)
				return
			}
			if (
				!force &&
				!shouldAutoScrollMessages &&
				!isScrolledNearEdge(container, {
					edge: 'bottom',
					thresholdPx: MESSAGES_SCROLL_THRESHOLD_PX,
				})
			) {
				syncMessageScrollFades(container)
				return
			}
			scrollToEdge(container, 'bottom')
			shouldAutoScrollMessages = true
			syncMessageScrollFades(container)
		})
	}

	function handleMessagesScroll(event: Event) {
		if (!(event.currentTarget instanceof HTMLDivElement)) return
		shouldAutoScrollMessages = isScrolledNearEdge(event.currentTarget, {
			edge: 'bottom',
			thresholdPx: MESSAGES_SCROLL_THRESHOLD_PX,
		})
		syncMessageScrollFades(event.currentTarget)
		if (
			chatSnapshot.hasOlderMessages &&
			!chatSnapshot.isLoadingOlderMessages &&
			isScrolledNearEdge(event.currentTarget, {
				edge: 'top',
				thresholdPx: MESSAGES_SCROLL_THRESHOLD_PX,
			})
		) {
			const scrollAnchor = captureScrollAnchor(event.currentTarget)
			void handle.queueTask(async (signal) => {
				const didLoad = await activeClient?.loadOlderMessages(signal)
				if (!didLoad) return
				void handle.queueTask(async () => {
					const container = document.getElementById(
						MESSAGES_SCROLL_CONTAINER_ID,
					)
					if (!(container instanceof HTMLDivElement)) return
					restoreScrollAnchorAfterPrepend(container, scrollAnchor)
					syncMessageScrollFades(container)
				})
			})
		}
	}

	function handleThreadListScroll(event: Event) {
		if (!(event.currentTarget instanceof HTMLDivElement)) return
		syncThreadListScrollFades(event.currentTarget)
		if (
			threadListSnapshot.hasMore &&
			!threadListSnapshot.isLoadingMore &&
			isScrolledNearEdge(event.currentTarget, {
				edge: 'bottom',
				thresholdPx: THREAD_LIST_SCROLL_THRESHOLD_PX,
			})
		) {
			startLoadMoreThreads()
		}
	}

	function handleThreadSearchInput(event: Event) {
		if (!(event.currentTarget instanceof HTMLInputElement)) return
		threadSearch = event.currentTarget.value
		update()
		startRefreshThreads()
	}

	function handleComposerKeyDown(event: KeyboardEvent) {
		if (!(event.currentTarget instanceof HTMLTextAreaElement)) return
		if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
		event.preventDefault()
		event.currentTarget.form?.requestSubmit()
	}

	async function connectThread(threadId: string) {
		if (activeThreadId === threadId && activeClient) return

		activeClient?.close()
		shouldAutoScrollMessages = true
		activeClient = new ChatClient({
			threadId,
			onSnapshot(snapshot) {
				if (activeThreadId !== threadId) return
				chatSnapshot = snapshot
				updateLocalThreadSummary(threadId, snapshot)
				syncDisconnectedIndicator()
				update()
				scheduleMessageScrollFadeSync()
				scheduleThreadListScrollFadeSync()
				scheduleScrollToBottom()
			},
		})
		activeThreadId = threadId
		resetChatSnapshot()
		syncDisconnectedIndicator()
		setMessageScrollFades(false, false)
		update()

		try {
			await activeClient.initialize()
		} catch (error) {
			chatSnapshot = {
				...createInitialSnapshot(),
				error:
					error instanceof Error
						? error.message
						: 'Unable to connect to the selected thread.',
			}
			syncDisconnectedIndicator()
			update()
		}
	}

	async function syncActiveThreadFromLocation() {
		if (typeof window === 'undefined') return
		// Navigating to /, /account, etc. still dispatches while ChatRoute is mounted.
		// Without this guard we "fix" a missing thread id by navigating back to /chat/:id.
		const pathname = window.location.pathname
		if (pathname !== '/chat' && !pathname.startsWith('/chat/')) {
			return
		}
		if (threadStatus !== 'ready' || syncInFlight) return
		syncInFlight = true
		try {
			const locationThreadId = getSelectedThreadIdFromLocation()
			const requestedAgentIds = getRequestedAgentIdsFromLocation()
			if (!locationThreadId && requestedAgentIds?.length) {
				activeClient?.close()
				activeClient = null
				activeThreadId = null
				resetChatSnapshot()
				disconnectedIndicator.reset()
				setMessageScrollFades(false, false)
				update()
				return
			}

			// Resolve deep links before treating an empty list as "no chats": the list
			// can be empty (search, first page timing) while the URL thread still exists.
			if (
				locationThreadId &&
				!getThreads().some((thread) => thread.id === locationThreadId)
			) {
				try {
					const selectedThread = await fetchThreadById(locationThreadId)
					updateThreadListFromSnapshot((currentThreads) => [
						selectedThread,
						...currentThreads.filter((t) => t.id !== selectedThread.id),
					])
				} catch {
					// Missing thread or error — fall through to empty state / first thread.
				}
			}

			const threads = getThreads()
			if (threads.length === 0) {
				activeClient?.close()
				activeClient = null
				activeThreadId = null
				resetChatSnapshot()
				disconnectedIndicator.reset()
				setMessageScrollFades(false, false)
				update()
				if (locationThreadId) {
					navigate('/chat')
				}
				return
			}

			const selectedThread =
				locationThreadId &&
				threads.some((thread) => thread.id === locationThreadId)
					? locationThreadId
					: null
			if (isMobileViewport && !selectedThread) {
				activeClient?.close()
				activeClient = null
				activeThreadId = null
				resetChatSnapshot()
				disconnectedIndicator.reset()
				setMessageScrollFades(false, false)
				update()
				return
			}
			const resolvedThreadId = selectedThread ?? threads[0]?.id ?? null
			if (!resolvedThreadId) return

			if (locationThreadId !== resolvedThreadId) {
				navigate(buildThreadHref(resolvedThreadId))
				return
			}

			await connectThread(resolvedThreadId)
		} finally {
			syncInFlight = false
		}
	}

	async function loadMoreThreads(signal?: AbortSignal) {
		if (!threadListCursor) return false
		let nextCursor: string | null = null
		const didLoad = await threadList.loadMore(async ({ signal }) => {
			const page = await fetchThreads({
				cursor: threadListCursor,
				search: threadSearch,
				signal,
			})
			nextCursor = page.nextCursor ?? null
			return {
				items: page.items,
				hasMore: page.hasMore,
				totalCount: page.totalCount,
			}
		}, signal)
		if (didLoad) {
			threadListCursor = nextCursor
		}
		return didLoad
	}

	async function prefetchRemainingThreadPages(signal?: AbortSignal) {
		for (let i = 0; i < THREAD_LIST_PREFETCH_MAX_PAGES; i++) {
			if (signal?.aborted) return
			if (!threadList.getSnapshot().hasMore) return
			const loaded = await loadMoreThreads(signal)
			if (!loaded) return
		}
	}

	async function refreshThreads(signal?: AbortSignal) {
		try {
			threadListCursor = null
			let nextCursor: string | null = null
			const didLoad = await threadList.loadInitial(async ({ signal }) => {
				const page = await fetchThreads({ search: threadSearch, signal })
				nextCursor = page.nextCursor ?? null
				return {
					items: page.items,
					hasMore: page.hasMore,
					totalCount: page.totalCount,
				}
			}, signal)
			if (!didLoad) {
				setThreadState('loading')
				update()
				return
			}
			threadsListHydrated = true
			threadListCursor = nextCursor
			setThreadState('ready')
			scheduleThreadListScrollFadeSync()
			await syncActiveThreadFromLocation()
			await prefetchRemainingThreadPages(signal)
		} catch (error) {
			if (signal?.aborted) return
			setThreadState(
				'error',
				error instanceof Error ? error.message : 'Unable to load threads.',
			)
		}
	}

	async function bootstrapChatData(signal?: AbortSignal) {
		let session = await fetchSessionInfo(signal)
		if (signal?.aborted) return
		if (!session?.email) {
			await new Promise((r) => setTimeout(r, 120))
			if (signal?.aborted) return
			session = await fetchSessionInfo(signal)
		}
		if (!session?.email) {
			threadsListHydrated = true
			setThreadState('ready')
			availableAgentsStatus = 'ready'
			availableAgents = []
			availableAgentsError = null
			update()
			return
		}

		if (
			!threadsListHydrated &&
			(threadStatus === 'loading' ||
				threadStatus === 'error' ||
				(threadStatus === 'ready' && threadListSnapshot.items.length === 0))
		) {
			for (let attempt = 0; attempt < 12 && !threadsListHydrated; attempt++) {
				if (signal?.aborted) return
				if (attempt > 0) {
					await new Promise((r) => setTimeout(r, Math.min(80 * attempt, 400)))
				}
				await refreshThreads(signal)
			}
			if (!threadsListHydrated && !signal?.aborted) {
				setThreadState(
					'error',
					'Unable to load chats. Try refreshing the page.',
				)
				update()
			}
		}

		if (
			availableAgentsStatus === 'loading' ||
			(availableAgentsStatus === 'error' && availableAgents.length === 0)
		) {
			await loadAvailableAgents(signal)
		}
	}

	async function loadAvailableAgents(signal?: AbortSignal) {
		try {
			const nextAvailableAgents = await fetchAvailableAgents(signal)
			availableAgents = nextAvailableAgents
			availableAgentsStatus = 'ready'
			availableAgentsError = null
			if (!getActiveThreadSummary()) {
				syncDraftAgentIds()
			}
			update()
		} catch (error) {
			if (signal?.aborted) return
			availableAgents = []
			availableAgentsStatus = 'error'
			availableAgentsError =
				error instanceof Error ? error.message : 'Unable to load agents.'
			update()
		}
	}

	handle.on(routerEvents, {
		navigate: () => {
			void syncActiveThreadFromLocation()
		},
	})

	handle.queueTask(() => {
		if (typeof window === 'undefined') return
		const mediaQueryList = window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY)
		const handleMediaQueryChange = (event?: MediaQueryListEvent) => {
			syncMobileViewportState(event?.matches ?? mediaQueryList.matches)
		}
		handleMediaQueryChange()
		mediaQueryList.addEventListener('change', handleMediaQueryChange)
		handle.signal.addEventListener(
			'abort',
			() => {
				mediaQueryList.removeEventListener('change', handleMediaQueryChange)
			},
			{ once: true },
		)
	})

	handle.queueTask(() => {
		if (typeof window === 'undefined') return
		const handleStorage = (event: StorageEvent) => {
			if (
				event.key !== deletedThreadBroadcastStorageKey ||
				typeof event.newValue !== 'string'
			) {
				return
			}
			try {
				const payload = JSON.parse(event.newValue) as { threadId?: unknown }
				const threadId =
					typeof payload.threadId === 'string' ? payload.threadId.trim() : ''
				if (!threadId) return
				handleDeletedThread(threadId)
			} catch {
				// Ignore malformed cross-tab storage events.
			}
		}
		window.addEventListener('storage', handleStorage)
		handle.signal.addEventListener(
			'abort',
			() => {
				window.removeEventListener('storage', handleStorage)
			},
			{ once: true },
		)
	})

	function ensureChatDataBootstrap() {
		if (chatDataBootstrapPromise) return
		chatDataBootstrapPromise = bootstrapChatData(handle.signal).finally(() => {
			chatDataBootstrapPromise = null
		})
	}

	async function createAndSelectThread(input?: { agentIds?: Array<string> }) {
		const thread = await createThread({
			agentIds: input?.agentIds ?? getSelectedAgentIds(),
		})
		navigate(buildThreadHref(thread.id))
		await refreshThreads()
		await connectThread(thread.id)
		return thread
	}

	async function handleCreateThread() {
		actionError = null
		update()
		try {
			await createAndSelectThread({ agentIds: getSelectedAgentIds() })
			await activeClient?.waitUntilConnected()
		} catch (error) {
			actionError =
				error instanceof Error ? error.message : 'Unable to create thread.'
			update()
		}
	}

	async function handleDeleteThread(threadId: string) {
		actionError = null
		update()
		try {
			await deleteThread(threadId)
			broadcastDeletedThread(threadId)
			handleDeletedThread(threadId)
			await refreshThreads()
		} catch (error) {
			actionError =
				error instanceof Error ? error.message : 'Unable to delete thread.'
			update()
		}
	}

	async function handleRenameThread(threadId: string, title: string) {
		actionError = null
		update()
		try {
			const updatedThread = await updateThreadTitle(threadId, title)
			updateThreadListFromSnapshot((threads) =>
				threads.map((thread) =>
					thread.id === updatedThread.id ? updatedThread : thread,
				),
			)
			update()
			return true
		} catch (error) {
			actionError =
				error instanceof Error
					? error.message
					: 'Unable to update thread title.'
			update()
			return false
		}
	}

	async function handleAgentSelectionChange(nextAgentIds: Array<string>) {
		const normalizedAgentIds = normalizeSelectedAgentIds(nextAgentIds)
		const activeThread = getActiveThreadSummary()
		if (!activeThread) {
			draftAgentIds = normalizedAgentIds
			update()
			return
		}

		const previousAgentIds = activeThread.agentIds
		updateThreadListFromSnapshot((threads) =>
			threads.map((thread) =>
				thread.id === activeThread.id
					? {
							...thread,
							agentId: normalizedAgentIds[0] ?? null,
							agentIds: normalizedAgentIds,
						}
					: thread,
			),
		)
		update()

		try {
			const updatedThread = await updateThreadAgents(
				activeThread.id,
				normalizedAgentIds,
			)
			updateThreadListFromSnapshot((threads) =>
				threads.map((thread) =>
					thread.id === updatedThread.id ? updatedThread : thread,
				),
			)
			update()
		} catch (error) {
			updateThreadListFromSnapshot((threads) =>
				threads.map((thread) =>
					thread.id === activeThread.id
						? {
								...thread,
								agentId: previousAgentIds[0] ?? null,
								agentIds: previousAgentIds,
							}
						: thread,
				),
			)
			actionError =
				error instanceof Error ? error.message : 'Unable to update chat agents.'
			update()
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault()
		actionError = null
		if (!(event.currentTarget instanceof HTMLFormElement)) return
		const form = event.currentTarget
		const formData = new FormData(form)
		const text = String(formData.get('message') ?? '').trim()
		if (!text) return

		try {
			let client = activeClient

			if (!client) {
				await createAndSelectThread({ agentIds: getSelectedAgentIds() })
				client = activeClient
			}

			if (!client) {
				throw new Error('Unable to start a chat thread.')
			}

			await client.waitUntilConnected()
			client.sendMessage(text)
			form.reset()
			const messageInput = form.elements.namedItem('message')
			resizeMessageInput(
				messageInput instanceof HTMLTextAreaElement ? messageInput : null,
			)
		} catch (error) {
			actionError =
				error instanceof Error ? error.message : 'Unable to send message.'
			update()
		}
	}

	ensureChatDataBootstrap()

	return () => {
		const threads = getThreads()
		const activeThread = getActiveThreadSummary()
		const requestedAgentIds = getRequestedAgentIdsFromLocation()
		const showEmptyStateComposer =
			!activeThread &&
			threadStatus !== 'error' &&
			(threads.length === 0 || Boolean(requestedAgentIds?.length))
		const selectedAgentIds = getSelectedAgentIds()
		const showThreadSidebar = !isMobileViewport || !activeThread
		const showChatPanel =
			!isMobileViewport || Boolean(activeThread) || showEmptyStateComposer
		const agentSelectionControl = agentMultiSelectCombobox({
			id: activeThread
				? `thread-agents-${activeThread.id}`
				: 'draft-thread-agents',
			agents: availableAgents,
			selectedAgentIds,
			error: availableAgentsError,
			isLoading: availableAgentsStatus === 'loading',
			onSelectionChange: handleAgentSelectionChange,
		})

		return (
			<section
				css={{
					display: 'grid',
					gap: spacing.lg,
					minHeight: showEmptyStateComposer ? 'calc(100vh - 7rem)' : undefined,
				}}
			>
				{actionError ? (
					<p css={{ margin: 0, color: colors.error }}>{actionError}</p>
				) : null}

				<div
					css={{
						display: 'grid',
						gap: spacing.lg,
						gridTemplateColumns: '18rem minmax(0, 1fr)',
						alignItems: 'stretch',
						minHeight: CHAT_PANEL_HEIGHT,
						[mq.mobile]: {
							gridTemplateColumns: '1fr',
							minHeight: undefined,
						},
					}}
				>
					<aside
						css={{
							display: showThreadSidebar ? 'flex' : 'none',
							flexDirection: 'column',
							gap: spacing.md,
							padding: spacing.md,
							borderRadius: radius.lg,
							border: `1px solid ${colors.border}`,
							backgroundColor: colors.surface,
							boxShadow: shadows.sm,
							position: 'sticky',
							top: spacing.lg,
							height: CHAT_PANEL_HEIGHT,
							overflow: 'hidden',
							[mq.mobile]: {
								position: 'static',
								top: 'auto',
								height: 'auto',
								maxHeight: MOBILE_CHAT_PANEL_HEIGHT,
								order: 1,
							},
						}}
					>
						<h2
							css={{
								margin: 0,
								color: colors.text,
								fontSize: typography.fontSize.lg,
								fontWeight: typography.fontWeight.semibold,
							}}
						>
							Chats
						</h2>
						<button
							type="button"
							on={{ click: handleCreateThread }}
							css={{
								width: '100%',
								padding: `${spacing.sm} ${spacing.md}`,
								borderRadius: radius.full,
								border: 'none',
								backgroundColor: colors.primary,
								color: colors.onPrimary,
								fontWeight: typography.fontWeight.semibold,
								cursor: 'pointer',
								transition: `background-color ${transitions.normal}`,
								'&:hover': {
									backgroundColor: colors.primaryHover,
								},
							}}
						>
							New thread
						</button>
						<input
							type="search"
							value={threadSearch}
							placeholder="Search chats"
							aria-label="Search chats"
							on={{ input: handleThreadSearchInput }}
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
						{threadStatus === 'error' ? (
							<p css={{ margin: 0, color: colors.error }}>{threadError}</p>
						) : null}
						<div
							css={{
								flex: 1,
								minHeight: 0,
								position: 'relative',
							}}
						>
							<div
								id={THREAD_LIST_SCROLL_CONTAINER_ID}
								on={{ scroll: handleThreadListScroll }}
								css={{
									height: '100%',
									overflowY: 'auto',
									display: 'grid',
									gap: spacing.md,
									alignContent: 'start',
								}}
							>
								{threadListSnapshot.isLoadingInitial ? (
									<p
										css={{
											margin: 0,
											color: colors.textMuted,
											fontSize: typography.fontSize.sm,
										}}
									>
										Loading chats...
									</p>
								) : null}
								{threads.map((thread) => {
									let deleteThreadCheck = deleteThreadChecks.get(thread.id)
									if (!deleteThreadCheck) {
										deleteThreadCheck = createDoubleCheck(handle)
										deleteThreadChecks.set(thread.id, deleteThreadCheck)
									}
									const isActive = thread.id === activeThreadId
									return (
										<div
											key={thread.id}
											css={{
												position: 'relative',
												'&:hover [data-thread-delete-button="true"], &:focus-within [data-thread-delete-button="true"]':
													{
														opacity: 1,
														pointerEvents: 'auto',
													},
											}}
										>
											<button
												type="button"
												on={{
													click: () => navigate(buildThreadHref(thread.id)),
												}}
												css={{
													display: 'grid',
													gap: spacing.xs,
													width: '100%',
													padding: spacing.sm,
													borderRadius: radius.md,
													border: `1px solid ${
														isActive ? colors.primary : colors.border
													}`,
													backgroundColor: isActive
														? colors.primarySoftest
														: colors.surface,
													color: colors.text,
													textAlign: 'left',
													cursor: 'pointer',
													transition: `background-color ${transitions.normal}, border-color ${transitions.normal}`,
												}}
											>
												<strong
													css={{
														display: 'block',
														width: '100%',
														fontWeight: typography.fontWeight.semibold,
														fontSize: typography.fontSize.sm,
														lineHeight: 1.4,
													}}
												>
													{thread.title}
												</strong>
												{thread.lastMessagePreview ? (
													<p
														css={{
															margin: 0,
															display: 'block',
															width: '100%',
															color: colors.textMuted,
															fontSize: typography.fontSize.sm,
															whiteSpace: 'nowrap',
															overflow: 'hidden',
															textOverflow: 'ellipsis',
														}}
													>
														{thread.lastMessagePreview}
													</p>
												) : null}
												<span
													css={{
														display: 'block',
														width: '100%',
														paddingRight: `calc(${spacing.sm} + 4.5rem)`,
														color: colors.textMuted,
														fontSize: typography.fontSize.sm,
													}}
												>
													{thread.messageCount} message
													{thread.messageCount === 1 ? '' : 's'}
												</span>
											</button>
											<button
												type="button"
												data-thread-delete-button="true"
												{...deleteThreadCheck.getButtonProps({
													on: {
														click: () => handleDeleteThread(thread.id),
													},
												})}
												aria-label={
													deleteThreadCheck.doubleCheck
														? `Confirm delete chat "${thread.title}"`
														: `Delete chat "${thread.title}"`
												}
												title={
													deleteThreadCheck.doubleCheck
														? `Click again to delete "${thread.title}"`
														: `Delete chat "${thread.title}"`
												}
												css={{
													position: 'absolute',
													right: spacing.sm,
													bottom: spacing.sm,
													display: 'inline-flex',
													alignItems: 'center',
													justifyContent: 'center',
													minWidth: '2rem',
													height: '2rem',
													padding: deleteThreadCheck.doubleCheck
														? `0 ${spacing.sm}`
														: 0,
													borderRadius: deleteThreadCheck.doubleCheck
														? radius.md
														: radius.full,
													border: `1px solid ${
														deleteThreadCheck.doubleCheck
															? colors.dangerHover
															: colors.border
													}`,
													backgroundColor: deleteThreadCheck.doubleCheck
														? colors.danger
														: colors.surface,
													color: deleteThreadCheck.doubleCheck
														? colors.onDanger
														: colors.textMuted,
													cursor: 'pointer',
													opacity: 0,
													pointerEvents: 'none',
													transition: `opacity ${transitions.normal}, background-color ${transitions.normal}, border-color ${transitions.normal}, color ${transitions.normal}`,
													[mq.mobile]: {
														opacity: 1,
														pointerEvents: 'auto',
													},
													'&:hover': {
														backgroundColor: colors.danger,
														borderColor: colors.dangerHover,
														color: colors.onDanger,
													},
													'&:focus-visible': {
														backgroundColor: colors.danger,
														borderColor: colors.dangerHover,
														color: colors.onDanger,
														outline: `2px solid ${colors.danger}`,
														outlineOffset: '2px',
													},
													fontSize: typography.fontSize.sm,
													fontWeight: typography.fontWeight.semibold,
													whiteSpace: 'nowrap',
												}}
											>
												{deleteThreadCheck.doubleCheck
													? 'Confirm'
													: renderTrashIcon()}
											</button>
										</div>
									)
								})}
								{threadStatus === 'ready' &&
								threads.length === 0 &&
								threadSearch.trim() ? (
									<p
										css={{
											margin: 0,
											color: colors.textMuted,
											fontSize: typography.fontSize.sm,
										}}
									>
										No chats match your search.
									</p>
								) : null}
								{threadListSnapshot.isLoadingMore ? (
									<p
										css={{
											margin: 0,
											color: colors.textMuted,
											fontSize: typography.fontSize.sm,
										}}
									>
										Loading more chats...
									</p>
								) : null}
							</div>
							{showThreadListScrollFadeTop ? (
								<div
									aria-hidden="true"
									css={{
										position: 'absolute',
										top: 0,
										left: 0,
										right: 0,
										height: MESSAGE_SCROLL_FADE_HEIGHT,
										background: `linear-gradient(to bottom, ${colors.surface}, color-mix(in srgb, ${colors.surface} 0%, transparent))`,
										pointerEvents: 'none',
									}}
								/>
							) : null}
							{showThreadListScrollFadeBottom ? (
								<div
									aria-hidden="true"
									css={{
										position: 'absolute',
										left: 0,
										right: 0,
										bottom: 0,
										height: MESSAGE_SCROLL_FADE_HEIGHT,
										background: `linear-gradient(to top, ${colors.surface}, color-mix(in srgb, ${colors.surface} 0%, transparent))`,
										pointerEvents: 'none',
									}}
								/>
							) : null}
						</div>
					</aside>

					<div
						css={{
							display: showChatPanel ? 'flex' : 'none',
							flexDirection: 'column',
							gap: spacing.md,
							padding: spacing.xl,
							borderRadius: radius.lg,
							border: `1px solid ${colors.border}`,
							backgroundColor: colors.surface,
							boxShadow: shadows.sm,
							height: CHAT_PANEL_HEIGHT,
							overflow: 'visible',
							[mq.mobile]: {
								order: 2,
								padding: spacing.md,
								height: activeThread ? MOBILE_CHAT_PANEL_HEIGHT : 'auto',
								minHeight: activeThread ? MOBILE_CHAT_PANEL_HEIGHT : undefined,
							},
						}}
					>
						{activeThread ? (
							<>
								<div
									css={{
										flexShrink: 0,
										display: 'flex',
										justifyContent: 'space-between',
										alignItems: 'center',
										gap: spacing.md,
										[CHAT_HEADER_STACK_MEDIA_QUERY]: {
											flexDirection: 'column',
											alignItems: 'stretch',
										},
										[mq.mobile]: {
											flexDirection: 'column',
											alignItems: 'stretch',
										},
									}}
								>
									<div
										css={{
											display: 'flex',
											alignItems: 'center',
											gap: spacing.sm,
											position: 'relative',
											minWidth: 0,
											flex: 1,
										}}
									>
										{isMobileViewport ? (
											<a
												href="/chat"
												css={{
													display: 'inline-flex',
													alignItems: 'center',
													justifyContent: 'center',
													padding: `${spacing.xs} ${spacing.sm}`,
													borderRadius: radius.full,
													border: `1px solid ${colors.border}`,
													backgroundColor: colors.background,
													color: colors.text,
													fontSize: typography.fontSize.sm,
													fontWeight: typography.fontWeight.medium,
													flexShrink: 0,
													textDecoration: 'none',
												}}
											>
												Chats
											</a>
										) : null}
										<span
											aria-hidden={!disconnectedIndicator.isShowing}
											aria-label={
												disconnectedIndicator.isShowing
													? 'Not connected'
													: undefined
											}
											title={
												disconnectedIndicator.isShowing
													? 'Chat is not connected'
													: undefined
											}
											css={{
												position: 'absolute',
												left: `calc(-1 * ${spacing.md})`,
												top: '50%',
												width: '0.5rem',
												height: '0.5rem',
												borderRadius: radius.full,
												backgroundColor: colors.danger,
												transform: disconnectedIndicator.isShowing
													? 'translateY(-50%) scale(1)'
													: 'translateY(-50%) scale(0.85)',
												boxShadow: `0 0 0 2px ${colors.surface}`,
												opacity: disconnectedIndicator.isShowing ? 1 : 0,
												pointerEvents: disconnectedIndicator.isShowing
													? 'auto'
													: 'none',
												transition: `opacity ${transitions.normal}, transform ${transitions.normal}`,
											}}
										/>
										<h3
											css={{
												margin: 0,
												color: colors.text,
												minWidth: 0,
												flex: 1,
											}}
										>
											<EditableText
												id={`thread-title-${activeThread.id}`}
												ariaLabel="Chat title"
												value={activeThread.title}
												onSave={(value) =>
													handleRenameThread(activeThread.id, value)
												}
												buttonCss={{
													whiteSpace: 'nowrap',
													overflow: 'hidden',
													textOverflow: 'ellipsis',
												}}
											/>
										</h3>
									</div>
									<div
										css={{
											width: '18rem',
											maxWidth: '100%',
											flexShrink: 0,
											[CHAT_HEADER_STACK_MEDIA_QUERY]: {
												width: '100%',
											},
											[mq.mobile]: {
												width: '100%',
											},
										}}
									>
										{agentSelectionControl}
									</div>
								</div>

								<div
									css={{
										position: 'relative',
										flex: 1,
										minHeight: 0,
										maxWidth: '56rem',
										width: '100%',
										margin: '0 auto',
									}}
								>
									<div
										id={MESSAGES_SCROLL_CONTAINER_ID}
										on={{ scroll: handleMessagesScroll }}
										css={{
											overflowY: 'auto',
											height: '100%',
											minHeight: 0,
											display: 'grid',
											gap: spacing.md,
											alignContent: 'start',
										}}
									>
										{chatSnapshot.isLoadingOlderMessages ? (
											<p
												css={{
													margin: 0,
													padding: `${spacing.xs} 0`,
													color: colors.textMuted,
													fontSize: typography.fontSize.sm,
													textAlign: 'center',
												}}
											>
												Loading earlier messages...
											</p>
										) : null}
										{chatSnapshot.isLoadingMessages ? (
											<p
												css={{
													margin: 0,
													padding: `${spacing.xs} 0`,
													color: colors.textMuted,
													fontSize: typography.fontSize.sm,
													textAlign: 'center',
												}}
											>
												Loading messages...
											</p>
										) : null}
										{chatSnapshot.messages.map((message) => (
											<article
												key={message.id}
												css={{
													display: 'grid',
													gap: spacing.xs,
													padding: spacing.md,
													borderRadius: radius.md,
													backgroundColor:
														message.role === 'user'
															? colors.primarySoftest
															: colors.surface,
													border: `1px solid ${colors.border}`,
												}}
											>
												<strong css={{ color: colors.text }}>
													{getAssistantSpeakerName(message)}
												</strong>
												<div css={{ display: 'grid', gap: spacing.sm }}>
													{renderMessageParts(
														message.parts as Array<{
															type: string
															text?: string
															state?: string
															input?: unknown
															output?: unknown
															errorText?: string
														}>,
													)}
												</div>
											</article>
										))}
										{chatSnapshot.isStreaming || chatSnapshot.streamingText ? (
											<article
												css={{
													display: 'grid',
													gap: spacing.xs,
													padding: spacing.md,
													borderRadius: radius.md,
													border: `1px solid ${colors.border}`,
													backgroundColor: colors.surface,
												}}
											>
												<strong css={{ color: colors.text }}>
													{getStreamingSpeakerName(chatSnapshot)}
												</strong>
												<p
													css={{
														margin: 0,
														whiteSpace: 'pre-wrap',
														color: colors.text,
													}}
												>
													{chatSnapshot.streamingText || 'Thinking…'}
												</p>
											</article>
										) : null}
									</div>
									{showMessageScrollFadeTop ? (
										<div
											aria-hidden="true"
											css={{
												position: 'absolute',
												top: 0,
												left: 0,
												right: 0,
												height: MESSAGE_SCROLL_FADE_HEIGHT,
												background: `linear-gradient(to bottom, ${colors.surface}, color-mix(in srgb, ${colors.surface} 0%, transparent))`,
												pointerEvents: 'none',
											}}
										/>
									) : null}
									{showMessageScrollFadeBottom ? (
										<div
											aria-hidden="true"
											css={{
												position: 'absolute',
												left: 0,
												right: 0,
												bottom: 0,
												height: MESSAGE_SCROLL_FADE_HEIGHT,
												background: `linear-gradient(to top, ${colors.surface}, color-mix(in srgb, ${colors.surface} 0%, transparent))`,
												pointerEvents: 'none',
											}}
										/>
									) : null}
								</div>

								{chatSnapshot.error ? (
									<p css={{ margin: 0, color: colors.error }}>
										{chatSnapshot.error}
									</p>
								) : null}

								<form
									on={{ submit: handleSubmit }}
									css={{
										display: 'grid',
										gap: spacing.sm,
										maxWidth: '56rem',
										width: '100%',
										margin: '0 auto',
										[mq.mobile]: {
											maxWidth: '100%',
										},
									}}
								>
									<label css={{ display: 'grid', gap: spacing.xs }}>
										<span
											css={{
												color: colors.text,
												fontWeight: typography.fontWeight.medium,
											}}
										>
											Message
										</span>
										<div
											css={{
												position: 'relative',
											}}
										>
											<textarea
												name="message"
												rows={1}
												on={{
													input: (event) =>
														resizeMessageInput(event.currentTarget),
													keydown: handleComposerKeyDown,
												}}
												placeholder="Ask a question"
												css={{
													display: 'block',
													width: '100%',
													height: INPUT_MIN_HEIGHT,
													minHeight: INPUT_MIN_HEIGHT,
													padding: '0.75rem',
													paddingRight: INPUT_RIGHT_PADDING,
													borderRadius: SEND_BUTTON_RADIUS,
													border: `1px solid ${colors.border}`,
													fontFamily: typography.fontFamily,
													fontSize: typography.fontSize.base,
													lineHeight: 1.4,
													overflow: 'hidden',
													resize: 'none',
												}}
											/>
											<button
												type="submit"
												disabled={chatSnapshot.isStreaming}
												aria-label={
													chatSnapshot.isStreaming
														? 'Streaming'
														: 'Send message'
												}
												title={
													chatSnapshot.isStreaming
														? 'Streaming'
														: 'Send message'
												}
												css={{
													display: 'inline-flex',
													alignItems: 'center',
													justifyContent: 'center',
													position: 'absolute',
													right: SEND_BUTTON_INSET,
													bottom: SEND_BUTTON_INSET,
													width: SEND_BUTTON_SIZE,
													height: SEND_BUTTON_SIZE,
													padding: 0,
													borderRadius: radius.full,
													border: 'none',
													backgroundColor: colors.primary,
													color: colors.onPrimary,
													cursor: chatSnapshot.isStreaming
														? 'not-allowed'
														: 'pointer',
													opacity: chatSnapshot.isStreaming ? 0.7 : 1,
												}}
											>
												{renderPaperAirplaneIcon()}
											</button>
										</div>
									</label>
								</form>
							</>
						) : showEmptyStateComposer ? (
							<div
								css={{
									flex: 1,
									minHeight: 0,
									display: 'flex',
									flexDirection: 'column',
									justifyContent: 'flex-end',
									maxWidth: '56rem',
									margin: '0 auto',
									width: '100%',
									paddingBottom: spacing.sm,
								}}
							>
								<div
									css={{
										display: 'grid',
										gap: spacing.sm,
										marginBottom: spacing.md,
									}}
								>
									<span
										css={{
											color: colors.text,
											fontSize: typography.fontSize.sm,
											fontWeight: typography.fontWeight.medium,
										}}
									>
										Agents
									</span>
									{agentSelectionControl}
								</div>
								<form
									on={{ submit: handleSubmit }}
									css={{
										display: 'grid',
										gap: spacing.sm,
										width: '100%',
									}}
								>
									<div
										css={{
											position: 'relative',
										}}
									>
										<textarea
											name="message"
											rows={1}
											aria-label="Message"
											on={{
												input: (event) =>
													resizeMessageInput(event.currentTarget),
												keydown: handleComposerKeyDown,
											}}
											placeholder="Ask a question"
											css={{
												display: 'block',
												width: '100%',
												height: INPUT_MIN_HEIGHT,
												minHeight: INPUT_MIN_HEIGHT,
												padding: '0.75rem',
												paddingRight: INPUT_RIGHT_PADDING,
												borderRadius: SEND_BUTTON_RADIUS,
												border: `1px solid ${colors.border}`,
												fontFamily: typography.fontFamily,
												fontSize: typography.fontSize.base,
												lineHeight: 1.4,
												overflow: 'hidden',
												resize: 'none',
											}}
										/>
										<button
											type="submit"
											aria-label="Send message"
											title="Send message"
											css={{
												display: 'inline-flex',
												alignItems: 'center',
												justifyContent: 'center',
												position: 'absolute',
												right: SEND_BUTTON_INSET,
												bottom: SEND_BUTTON_INSET,
												width: SEND_BUTTON_SIZE,
												height: SEND_BUTTON_SIZE,
												padding: 0,
												borderRadius: radius.full,
												border: 'none',
												backgroundColor: colors.primary,
												color: colors.onPrimary,
												cursor: 'pointer',
											}}
										>
											{renderPaperAirplaneIcon()}
										</button>
									</div>
								</form>
							</div>
						) : null}
					</div>
				</div>
			</section>
		)
	}
}
