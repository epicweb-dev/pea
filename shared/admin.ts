const adminEmail = 'me@kentcdodds.com'

export function isAdminEmail(email: string) {
	return email.trim().toLowerCase() === adminEmail
}
