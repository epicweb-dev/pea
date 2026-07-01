import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fail, parseJsonc } from './resource-utils'

type CliOptions = {
	wranglerConfigPath: string
	outConfigPath: string
	d1DatabaseName: string
	d1DatabaseId: string
}

function parseArgs(argv: Array<string>): CliOptions {
	const options: CliOptions = {
		wranglerConfigPath: '',
		outConfigPath: '',
		d1DatabaseName: '',
		d1DatabaseId: '',
	}

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (!arg) continue
		switch (arg) {
			case '--wrangler-config': {
				options.wranglerConfigPath = argv[index + 1] ?? ''
				index += 1
				break
			}
			case '--out-config': {
				options.outConfigPath = argv[index + 1] ?? ''
				index += 1
				break
			}
			case '--d1-database-name': {
				options.d1DatabaseName = argv[index + 1] ?? ''
				index += 1
				break
			}
			case '--d1-database-id': {
				options.d1DatabaseId = argv[index + 1] ?? ''
				index += 1
				break
			}
			default: {
				if (arg.startsWith('-')) {
					fail(`Unknown flag: ${arg}`)
				}
			}
		}
	}

	if (!options.wranglerConfigPath) {
		fail('Missing required flag: --wrangler-config <path>')
	}
	if (!options.outConfigPath) {
		fail('Missing required flag: --out-config <path>')
	}
	if (!options.d1DatabaseName) {
		fail('Missing required flag: --d1-database-name <name>')
	}
	if (!options.d1DatabaseId) {
		fail('Missing required flag: --d1-database-id <id>')
	}

	return options
}

function updateEnvD1Binding({
	config,
	envName,
	d1DatabaseName,
	d1DatabaseId,
	baseConfigPath,
}: {
	config: Record<string, unknown>
	envName: string
	d1DatabaseName: string
	d1DatabaseId: string
	baseConfigPath: string
}) {
	const env = config.env
	if (!env || typeof env !== 'object') {
		fail(`wrangler config "${baseConfigPath}" is missing "env".`)
	}

	const targetEnv = (env as Record<string, unknown>)[envName]
	if (!targetEnv || typeof targetEnv !== 'object') {
		fail(`wrangler config "${baseConfigPath}" is missing "env.${envName}".`)
	}

	const d1Databases = (targetEnv as Record<string, unknown>).d1_databases
	if (!Array.isArray(d1Databases)) {
		fail(
			`wrangler config "${baseConfigPath}" is missing "env.${envName}.d1_databases".`,
		)
	}

	const d1EntryIndex = d1Databases.findIndex((entry) => {
		if (!entry || typeof entry !== 'object') return false
		return (entry as Record<string, unknown>).binding === 'APP_DB'
	})
	if (d1EntryIndex < 0) {
		fail(
			`wrangler config "${baseConfigPath}" has no ${envName} D1 binding for "APP_DB".`,
		)
	}

	const d1Entry = d1Databases[d1EntryIndex] as Record<string, unknown>
	d1Databases[d1EntryIndex] = {
		...d1Entry,
		database_name: d1DatabaseName,
		database_id: d1DatabaseId,
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2))
	const baseText = await readFile(options.wranglerConfigPath, 'utf8')
	const config = parseJsonc<Record<string, unknown>>(baseText)

	for (const envName of ['preview', 'test']) {
		updateEnvD1Binding({
			config,
			envName,
			d1DatabaseName: options.d1DatabaseName,
			d1DatabaseId: options.d1DatabaseId,
			baseConfigPath: options.wranglerConfigPath,
		})
	}

	const resolvedOut = path.resolve(options.outConfigPath)
	await writeFile(
		resolvedOut,
		`${JSON.stringify(config, null, '\t')}\n`,
		'utf8',
	)
	console.error(`Wrote generated mock Wrangler config: ${resolvedOut}`)
}

await main()
