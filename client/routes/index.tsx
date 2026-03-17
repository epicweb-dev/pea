import { AccountRoute } from './account.tsx'
import { AdminAgentsRoute } from './admin-agents.tsx'
import { ChatRoute } from './chat.tsx'
import { HomeRoute } from './home.tsx'
import { LoginRoute } from './login.tsx'
import { OAuthAuthorizeRoute } from './oauth-authorize.tsx'
import { OAuthCallbackRoute } from './oauth-callback.tsx'
import { ResetPasswordRoute } from './reset-password.tsx'

/** Single element so /chat ↔ /chat/:threadId does not remount (preserves thread list + sync). */
const chatRoute = <ChatRoute key="chat-route" />

export const clientRoutes = {
	'/': <HomeRoute />,
	'/chat': chatRoute,
	'/chat/:threadId': chatRoute,
	'/admin/agents': <AdminAgentsRoute />,
	'/account': <AccountRoute />,
	'/login': <LoginRoute />,
	'/signup': <LoginRoute setup={{ initialMode: 'signup' }} />,
	'/reset-password': <ResetPasswordRoute />,
	'/oauth/authorize': <OAuthAuthorizeRoute />,
	'/oauth/callback': <OAuthCallbackRoute />,
}
