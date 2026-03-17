import { type BuildAction } from 'remix/fetch-router'
import { readAuthenticatedAppUser } from '#server/authenticated-user.ts'
import { createAgentsStore } from '#server/agents.ts'
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

export function createChatAgentsHandler(appEnv: AppEnv) {
	const store = createAgentsStore(appEnv.APP_DB)

	return {
		middleware: [],
		async action({ request }) {
			const user = await readAuthenticatedAppUser(request, appEnv as Env)
			if (!user) {
				return jsonResponse(
					{ ok: false, error: 'Unauthorized' },
					{ status: 401 },
				)
			}

			const agents = await store.listAvailable()
			return jsonResponse({ ok: true, agents })
		},
	} satisfies BuildAction<
		typeof routes.chatAgents.method,
		typeof routes.chatAgents.pattern
	>
}
