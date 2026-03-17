import { type Handle } from 'remix/component'
import { colors, radius, shadows, spacing, transitions, typography } from './styles/tokens.ts'

type NotificationTone = 'success' | 'error' | 'info'

type NotificationItem = {
	id: string
	message: string
	tone: NotificationTone
}

type NotificationOptions = {
	durationMs?: number
}

function createNotificationDuration(
	tone: NotificationTone,
	options?: NotificationOptions,
) {
	if (typeof options?.durationMs === 'number') {
		return options.durationMs
	}
	return tone === 'error' ? 5000 : 3000
}

function getNotificationColors(tone: NotificationTone) {
	switch (tone) {
		case 'success':
			return {
				border: colors.primary,
				background: colors.surface,
				text: colors.text,
			}
		case 'error':
			return {
				border: colors.error,
				background: colors.surface,
				text: colors.text,
			}
		case 'info':
			return {
				border: colors.border,
				background: colors.surface,
				text: colors.text,
			}
	}
}

export function createNotifications(handle: Handle) {
	let items: Array<NotificationItem> = []
	const timeoutIds = new Map<string, ReturnType<typeof globalThis.setTimeout>>()

	function clearTimer(id: string) {
		const timeoutId = timeoutIds.get(id)
		if (!timeoutId) return
		globalThis.clearTimeout(timeoutId)
		timeoutIds.delete(id)
	}

	function dismiss(id: string) {
		clearTimer(id)
		const nextItems = items.filter((item) => item.id !== id)
		if (nextItems.length === items.length) return
		items = nextItems
		handle.update()
	}

	function show(
		tone: NotificationTone,
		message: string,
		options?: NotificationOptions,
	) {
		const id = crypto.randomUUID()
		items = [...items, { id, message, tone }]
		handle.update()
		timeoutIds.set(
			id,
			globalThis.setTimeout(() => {
				dismiss(id)
			}, createNotificationDuration(tone, options)),
		)
	}

	return {
		get items() {
			return items
		},
		showSuccess(message: string, options?: NotificationOptions) {
			show('success', message, options)
		},
		showError(message: string, options?: NotificationOptions) {
			show('error', message, options)
		},
		showInfo(message: string, options?: NotificationOptions) {
			show('info', message, options)
		},
		dismiss,
		render() {
			if (items.length === 0) return null
			return (
				<div
					aria-live="polite"
					aria-atomic="true"
					css={{
						position: 'fixed',
						top: spacing.xl,
						right: spacing.xl,
						zIndex: 1000,
						display: 'grid',
						gap: spacing.sm,
						maxWidth: '24rem',
						pointerEvents: 'none',
					}}
				>
					{items.map((item) => {
						const toneColors = getNotificationColors(item.tone)
						return (
							<div
								key={item.id}
								role={item.tone === 'error' ? 'alert' : 'status'}
								css={{
									display: 'grid',
									gridTemplateColumns: '1fr auto',
									gap: spacing.sm,
									alignItems: 'start',
									padding: spacing.md,
									borderRadius: radius.lg,
									border: `1px solid ${toneColors.border}`,
									backgroundColor: toneColors.background,
									boxShadow: shadows.md,
									color: toneColors.text,
									pointerEvents: 'auto',
									transition: `opacity ${transitions.normal}`,
								}}
							>
								<p
									css={{
										margin: 0,
										fontSize: typography.fontSize.sm,
										lineHeight: 1.5,
									}}
								>
									{item.message}
								</p>
								<button
									type="button"
									aria-label="Dismiss notification"
									on={{ click: () => dismiss(item.id) }}
									css={{
										padding: 0,
										border: 'none',
										background: 'transparent',
										color: colors.textMuted,
										cursor: 'pointer',
										fontSize: typography.fontSize.base,
										lineHeight: 1,
									}}
								>
									×
								</button>
							</div>
						)
					})}
				</div>
			)
		},
	}
}
