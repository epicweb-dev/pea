import {
	readAuthenticatedAppUser,
	type AuthenticatedAppUser,
} from './authenticated-user.ts'
import { isAdminEmail } from '#shared/admin.ts'

export async function readAdminAppUser(
	request: Request,
	env: Env,
): Promise<AuthenticatedAppUser | null> {
	const user = await readAuthenticatedAppUser(request, env)
	if (!user || !isAdminEmail(user.email)) {
		return null
	}
	return user
}
