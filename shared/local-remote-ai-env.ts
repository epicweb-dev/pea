type LocalRemoteAiEnvInput = {
	aiMode?: string
	isLocalDev: boolean
	gatewayId?: string
	accountId?: string
	apiToken?: string
}

function getMissingNames(input: {
	gatewayId?: string
	accountId?: string
	apiToken?: string
}) {
	const missingNames: Array<string> = []
	if (!input.gatewayId) {
		missingNames.push('AI_GATEWAY_ID')
	}
	if (!input.accountId) {
		missingNames.push('CLOUDFLARE_ACCOUNT_ID')
	}
	if (!input.apiToken) {
		missingNames.push('CLOUDFLARE_API_TOKEN')
	}
	return missingNames
}

export function getLocalRemoteAiEnvError(input: LocalRemoteAiEnvInput) {
	if (input.aiMode !== 'remote' || !input.isLocalDev) {
		return null
	}

	const missingNames = getMissingNames({
		gatewayId: input.gatewayId,
		accountId: input.accountId,
		apiToken: input.apiToken,
	})
	if (missingNames.length === 0) {
		return null
	}

	return [
		'AI_MODE="remote" in local Wrangler dev requires Cloudflare account credentials to call Workers AI through your gateway.',
		`Missing environment variables: ${missingNames.join(', ')}.`,
		'Add them to your local .env file, or switch to AI_MODE="mock" if you do not want live Workers AI locally.',
	].join(' ')
}
