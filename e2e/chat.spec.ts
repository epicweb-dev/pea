import { type Page } from '@playwright/test'
import { expect, test } from './playwright-utils.ts'

async function createManagedAgent(
	page: Page,
	input: {
		name: string
		systemPrompt: string
	},
) {
	const response = await page.request.post('/admin-agents', {
		data: {
			name: input.name,
			systemPrompt: input.systemPrompt,
			modelPreset: 'env-default',
			customModel: '',
			isActive: true,
			makeDefault: false,
		},
		headers: { 'Content-Type': 'application/json' },
	})
	expect(response.ok()).toBeTruthy()
}

test('redirects to login when unauthenticated', async ({ page }) => {
	await page.goto('/chat')
	await expect(page).toHaveURL(/\/login/)
})

test('loads chat page when authenticated', async ({ page, login }) => {
	await login()
	await page.goto('/chat')
	await expect(
		page.getByRole('heading', { name: 'Chats', exact: true }),
	).toBeVisible()
	await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
	await expect(
		page.getByRole('button', { name: 'Create your first thread' }),
	).toHaveCount(0)
})

test('creates and deletes chat threads when authenticated', async ({
	page,
	login,
}) => {
	await login()
	await page.goto('/chat')

	await page.getByRole('textbox', { name: 'Message' }).fill('Hello there')
	await page.getByRole('button', { name: 'Send message' }).click()
	await expect(page).toHaveURL(/\/chat\/.+/)
	await expect(page.getByRole('heading', { name: 'New chat' })).toBeVisible()
	await expect(
		page
			.getByRole('complementary')
			.getByText('This is a mock completion', { exact: false }),
	).toBeVisible()
	await expect(
		page.locator('#chat-messages-scroll-container').getByText('Hello there'),
	).toBeVisible()

	const firstThread = page
		.getByRole('complementary')
		.getByRole('button', {
			name: /New chat.*This is a mock completion.*2 messages/s,
		})
		.first()
	await firstThread.hover()
	await page
		.getByRole('complementary')
		.getByRole('button', { name: /delete chat/i })
		.first()
		.click()
	await page.getByRole('button', { name: /confirm delete chat/i }).click()
	await expect(page).toHaveURL(/\/chat$/)
	await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
	await expect(page.getByRole('heading', { name: 'New chat' })).toHaveCount(0)
})

test('responds to mock tool commands in chat', async ({ page, login }) => {
	await login()
	await page.goto('/chat')

	await page
		.getByRole('textbox', { name: 'Message' })
		.fill('tool:do_math;left=1;right=2;operator=+')
	await page.getByRole('button', { name: 'Send message' }).click()

	await expect(page).toHaveURL(/\/chat\/.+/)
	await expect(
		page
			.locator('#chat-messages-scroll-container')
			.getByText('tool:do_math;left=1;right=2;operator=+'),
	).toBeVisible()
	await expect(
		page
			.locator('#chat-messages-scroll-container')
			.getByText('## ✅ Result', { exact: false }),
	).toBeVisible()
	await expect(
		page
			.locator('#chat-messages-scroll-container')
			.getByText('**Result**: `3`', { exact: false }),
	).toBeVisible()
})

test('supports selecting multiple agents before and during a chat', async ({
	page,
	login,
}) => {
	await login({
		email: 'me@kentcdodds.com',
		password: 'password123',
	})
	const agentSuffix = crypto.randomUUID().slice(0, 8)
	const alphaAgentName = `alpha agent ${agentSuffix}`
	const betaAgentName = `beta agent ${agentSuffix}`
	await createManagedAgent(page, {
		name: alphaAgentName,
		systemPrompt: 'You are alpha agent.',
	})
	await createManagedAgent(page, {
		name: betaAgentName,
		systemPrompt: 'You are beta agent.',
	})

	await page.goto('/chat')
	await expect(
		page.getByRole('heading', { name: 'Chats', exact: true }),
	).toBeVisible()
	// With threads in the list but no active thread, the draft agent picker is
	// hidden; open a new thread so the composer (and picker) is shown.
	const nonZeroAgentPicker = page.getByRole('button', {
		name: /[1-9]\d* agents in this chat/,
	})
	if ((await nonZeroAgentPicker.count()) === 0) {
		await page.getByRole('button', { name: 'New thread' }).click()
		await expect(page).toHaveURL(/\/chat\/.+/)
	}
	// Default agent can take a moment to apply after navigation or new thread.
	await expect(
		page.getByRole('button', { name: '1 agents in this chat' }),
	).toBeVisible({ timeout: 30_000 })

	const draftAgentButton = page.getByRole('button', {
		name: '1 agents in this chat',
	})
	await draftAgentButton.click()
	const searchAgentsInput = page.getByRole('searchbox', {
		name: 'Search agents',
	})
	await searchAgentsInput.fill(alphaAgentName)
	await page.keyboard.press('Enter')
	await searchAgentsInput.fill(betaAgentName)
	await page.keyboard.press('Enter')
	await searchAgentsInput.fill('default agent')
	await page.keyboard.press('Enter')
	await page.keyboard.press('Escape')
	await expect(
		page.getByRole('button', { name: '2 agents in this chat' }),
	).toBeVisible()

	await page
		.getByRole('textbox', { name: 'Message' })
		.fill('hello alpha agent and beta agent')
	await page.getByRole('button', { name: 'Send message' }).click()

	await expect(page).toHaveURL(/\/chat\/.+/)
	const messages = page.locator('#chat-messages-scroll-container')
	const firstAssistantMessage = messages.locator('article').nth(1)
	await expect(firstAssistantMessage.getByRole('strong')).toHaveText(
		alphaAgentName,
	)
	await expect(firstAssistantMessage.getByRole('strong')).not.toHaveText(
		betaAgentName,
	)

	const threadAgentButton = page.getByRole('button', {
		name: '2 agents in this chat',
	})
	await threadAgentButton.click()
	const activeSearchAgentsInput = page.getByRole('searchbox', {
		name: 'Search agents',
	})
	await activeSearchAgentsInput.fill(alphaAgentName)
	await page.keyboard.press('Enter')
	await page.keyboard.press('Escape')
	await expect(
		page.getByRole('button', { name: '1 agents in this chat' }),
	).toBeVisible()

	await page.getByRole('textbox', { name: 'Message' }).fill('hello again')
	await page.getByRole('button', { name: 'Send message' }).click()

	await expect(messages.locator('article')).toHaveCount(4)
	const secondAssistantMessage = messages.locator('article').nth(3)
	await expect(secondAssistantMessage.getByRole('strong')).toHaveText(
		betaAgentName,
	)
	await expect(secondAssistantMessage.getByRole('strong')).not.toHaveText(
		alphaAgentName,
	)
})

test('uses the chat list route on mobile', async ({ page, login }) => {
	await login()
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/chat')

	await page.getByRole('textbox', { name: 'Message' }).fill('Hello from mobile')
	await page.getByRole('button', { name: 'Send message' }).click()

	await expect(page).toHaveURL(/\/chat\/.+/)
	await expect(
		page
			.locator('#chat-messages-scroll-container')
			.getByText('Hello from mobile'),
	).toBeVisible()
	await expect(page.getByRole('link', { name: 'Chats' })).toBeVisible()

	await page.getByRole('link', { name: 'Chats' }).click()
	await expect(page).toHaveURL(/\/chat$/)
	await expect(
		page.getByRole('heading', { name: 'Chats', exact: true }),
	).toBeVisible()
	await expect(page.locator('#chat-messages-scroll-container')).toHaveCount(0)
	await expect(page.getByRole('textbox', { name: 'Message' })).toHaveCount(0)
})
