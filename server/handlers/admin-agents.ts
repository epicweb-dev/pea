import { type BuildAction } from 'remix/fetch-router'
import { readAuthenticatedAppUser } from '#server/authenticated-user.ts'
import { isAdminEmail } from '#shared/admin.ts'
import { fallbackRemoteChatModel } from '#shared/chat.ts'
import { readAuthSessionResult } from '#server/auth-session.ts'
import { redirectToLogin } from '#server/auth-redirect.ts'
import { createAgentsStore } from '#server/agents.ts'
import { Layout } from '#server/layout.ts'
import { render } from '#server/render.ts'
import { type routes } from '#server/routes.ts'
import { type AppEnv } from '#types/env-schema.ts'

function jsonResponse(data: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
			...init?.headers,
		},
	})
}

async function requireAdminApiUser(request: Request, env: Env) {
	const user = await readAuthenticatedAppUser(request, env)
	if (!user) {
		return {
			user: null,
			response: jsonResponse(
				{ ok: false, error: 'Unauthorized' },
				{ status: 401 },
			),
		}
	}
	if (!isAdminEmail(user.email)) {
		return {
			user: null,
			response: jsonResponse(
				{ ok: false, error: 'Forbidden' },
				{ status: 403 },
			),
		}
	}
	return { user, response: null }
}

function readOptionalString(value: unknown) {
	return typeof value === 'string' ? value.trim() : ''
}

function readOptionalBoolean(value: unknown) {
	return value === true
}

export const adminAgentsPage = {
	middleware: [],
	async action({ request }) {
		const { session, setCookie } = await readAuthSessionResult(request)
		if (!session) {
			return redirectToLogin(request)
		}
		if (!isAdminEmail(session.email)) {
			return new Response('Forbidden', { status: 403 })
		}

		const response = render(
			Layout({
				title: 'Admin agents',
			}),
		)
		if (setCookie) {
			response.headers.set('Set-Cookie', setCookie)
		}
		return response
	},
} satisfies BuildAction<
	typeof routes.adminAgents.method,
	typeof routes.adminAgents.pattern
>

export function createAdminAgentsHandler(appEnv: AppEnv) {
	const store = createAgentsStore(appEnv.APP_DB)

	return {
		middleware: [],
		async action({ request }) {
			const { response } = await requireAdminApiUser(request, appEnv as Env)
			if (response) return response

			if (request.method === 'GET') {
				const agents = await store.list()
				return jsonResponse({
					ok: true,
					agents,
					environmentDefaultModel: appEnv.AI_MODEL ?? fallbackRemoteChatModel,
				})
			}

			const body = (await request.json().catch(() => null)) as {
				name?: unknown
				systemPrompt?: unknown
				modelPreset?: unknown
				customModel?: unknown
				isActive?: unknown
				makeDefault?: unknown
			} | null

			const name = readOptionalString(body?.name)
			const systemPrompt = readOptionalString(body?.systemPrompt)
			if (!name) {
				return jsonResponse(
					{ ok: false, error: 'Name is required.' },
					{ status: 400 },
				)
			}
			if (!systemPrompt) {
				return jsonResponse(
					{ ok: false, error: 'System prompt is required.' },
					{ status: 400 },
				)
			}

			const agent = await store.create({
				name,
				systemPrompt,
				modelPreset: readOptionalString(body?.modelPreset),
				customModel: readOptionalString(body?.customModel) || null,
				isActive:
					!body || body.isActive === undefined
						? true
						: readOptionalBoolean(body.isActive),
				makeDefault: readOptionalBoolean(body?.makeDefault),
			})
			return jsonResponse({ ok: true, agent }, { status: 201 })
		},
	} satisfies BuildAction<
		| typeof routes.adminAgentsData.method
		| typeof routes.adminAgentsCreate.method,
		typeof routes.adminAgentsData.pattern
	>
}

export function createUpdateAdminAgentHandler(appEnv: AppEnv) {
	const store = createAgentsStore(appEnv.APP_DB)

	return {
		middleware: [],
		async action({ request }) {
			const { response } = await requireAdminApiUser(request, appEnv as Env)
			if (response) return response

			const body = (await request.json().catch(() => null)) as {
				agentId?: unknown
				name?: unknown
				systemPrompt?: unknown
				modelPreset?: unknown
				customModel?: unknown
				isActive?: unknown
			} | null
			const agentId = readOptionalString(body?.agentId)
			const name = readOptionalString(body?.name)
			const systemPrompt = readOptionalString(body?.systemPrompt)
			if (!agentId) {
				return jsonResponse(
					{ ok: false, error: 'Agent ID is required.' },
					{ status: 400 },
				)
			}
			if (!name) {
				return jsonResponse(
					{ ok: false, error: 'Name is required.' },
					{ status: 400 },
				)
			}
			if (!systemPrompt) {
				return jsonResponse(
					{ ok: false, error: 'System prompt is required.' },
					{ status: 400 },
				)
			}

			const agent = await store.update(agentId, {
				name,
				systemPrompt,
				modelPreset: readOptionalString(body?.modelPreset),
				customModel: readOptionalString(body?.customModel) || null,
				isActive: readOptionalBoolean(body?.isActive),
			})
			if (!agent) {
				return jsonResponse(
					{ ok: false, error: 'Agent not found.' },
					{ status: 404 },
				)
			}

			return jsonResponse({ ok: true, agent })
		},
	} satisfies BuildAction<
		typeof routes.adminAgentsUpdate.method,
		typeof routes.adminAgentsUpdate.pattern
	>
}

export function createDeleteAdminAgentHandler(appEnv: AppEnv) {
	const store = createAgentsStore(appEnv.APP_DB)

	return {
		middleware: [],
		async action({ request }) {
			const { response } = await requireAdminApiUser(request, appEnv as Env)
			if (response) return response

			const body = (await request.json().catch(() => null)) as {
				agentId?: unknown
			} | null
			const agentId = readOptionalString(body?.agentId)
			if (!agentId) {
				return jsonResponse(
					{ ok: false, error: 'Agent ID is required.' },
					{ status: 400 },
				)
			}

			const deleted = await store.archive(agentId)
			if (!deleted) {
				return jsonResponse(
					{ ok: false, error: 'Agent not found.' },
					{ status: 404 },
				)
			}

			return jsonResponse({ ok: true })
		},
	} satisfies BuildAction<
		typeof routes.adminAgentsDelete.method,
		typeof routes.adminAgentsDelete.pattern
	>
}

export function createSetDefaultAdminAgentHandler(appEnv: AppEnv) {
	const store = createAgentsStore(appEnv.APP_DB)

	return {
		middleware: [],
		async action({ request }) {
			const { response } = await requireAdminApiUser(request, appEnv as Env)
			if (response) return response

			const body = (await request.json().catch(() => null)) as {
				agentId?: unknown
			} | null
			const agentId = readOptionalString(body?.agentId)
			if (!agentId) {
				return jsonResponse(
					{ ok: false, error: 'Agent ID is required.' },
					{ status: 400 },
				)
			}

			const agent = await store.setDefault(agentId)
			if (!agent) {
				return jsonResponse(
					{ ok: false, error: 'Agent not found.' },
					{ status: 404 },
				)
			}

			return jsonResponse({ ok: true, agent })
		},
	} satisfies BuildAction<
		typeof routes.adminAgentsDefault.method,
		typeof routes.adminAgentsDefault.pattern
	>
}
