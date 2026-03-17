import { type Page } from '@playwright/test'
import { expect, test } from './playwright-utils.ts'

async function createManagedAgent(page: Page, input: {
	name: string
	systemPrompt: string
}) {
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

	await page
		.getByRole('complementary')
		.getByRole('button', { name: 'Delete' })
		.first()
		.click({ force: true })
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
	await createManagedAgent(page, {
		name: 'alpha agent',
		systemPrompt: 'You are alpha agent.',
	})
	await createManagedAgent(page, {
		name: 'beta agent',
		systemPrompt: 'You are beta agent.',
	})

	await page.goto('/chat')

	const draftAgentButton = page.getByRole('button', {
		name: '1 agents in this chat',
	})
	await draftAgentButton.click()
	const searchAgentsInput = page.getByRole('searchbox', { name: 'Search agents' })
	await searchAgentsInput.fill('alpha agent')
	await page.keyboard.press('Enter')
	await searchAgentsInput.fill('beta agent')
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
	await expect(firstAssistantMessage).toContainText('alpha agent:')
	await expect(firstAssistantMessage).toContainText('beta agent:')

	const threadAgentButton = page.getByRole('button', {
		name: '2 agents in this chat',
	})
	await threadAgentButton.click()
	const activeSearchAgentsInput = page.getByRole('searchbox', {
		name: 'Search agents',
	})
	await activeSearchAgentsInput.fill('alpha agent')
	await page.keyboard.press('Enter')
	await page.keyboard.press('Escape')
	await expect(
		page.getByRole('button', { name: '1 agents in this chat' }),
	).toBeVisible()

	await page.getByRole('textbox', { name: 'Message' }).fill('hello again')
	await page.getByRole('button', { name: 'Send message' }).click()

	await expect(messages.locator('article')).toHaveCount(4)
	const secondAssistantMessage = messages.locator('article').nth(3)
	await expect(secondAssistantMessage).not.toContainText('alpha agent:')
	await expect(secondAssistantMessage).toContainText('beta agent:')
})
