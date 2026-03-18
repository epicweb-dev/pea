import { type Handle } from 'remix/component'
import {
	colors,
	mq,
	radius,
	shadows,
	spacing,
	typography,
} from '#client/styles/tokens.ts'

export function HomeRoute(_handle: Handle) {
	const learnerOutputs = [
		'Clear problem definitions',
		'Constraints, assumptions, and tradeoffs',
		'Success criteria and degradation signals',
		'Rollout, monitoring, and rollback plans',
	]

	const simulationBehaviors = [
		'Stakeholders reveal information progressively',
		'Hidden constraints emerge through questioning',
		'Conflicting incentives create realistic friction',
		'Instructor controls shape prompts and scenarios',
	]

	return () => (
		<section
			css={{
				display: 'grid',
				gap: spacing.xl,
			}}
		>
			<div
				css={{
					display: 'grid',
					gap: spacing.lg,
					padding: spacing.xl,
					borderRadius: radius.xl,
					border: `1px solid ${colors.border}`,
					background: `linear-gradient(135deg, ${colors.primarySoftStrong}, ${colors.primarySoftest} 55%, ${colors.background})`,
					boxShadow: shadows.md,
					textAlign: 'center',
					justifyItems: 'center',
					width: '100%',
					[mq.mobile]: {
						padding: spacing.lg,
					},
				}}
			>
				<div
					css={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						padding: `${spacing.xs} ${spacing.md}`,
						borderRadius: radius.full,
						border: `1px solid ${colors.border}`,
						background: colors.surface,
						color: colors.primaryText,
						fontSize: typography.fontSize.sm,
						fontWeight: typography.fontWeight.semibold,
						letterSpacing: '0.02em',
					}}
				>
					Product Engineer Agents
				</div>
				<div
					css={{
						display: 'grid',
						gap: spacing.md,
						justifyItems: 'center',
					}}
				>
					<img
						src="/logo.png"
						alt="pea logo"
						css={{
							width: '320px',
							maxWidth: '100%',
							height: 'auto',
						}}
					/>
					<div css={{ display: 'grid', gap: spacing.sm }}>
						<h1
							css={{
								fontSize: typography.fontSize['2xl'],
								fontWeight: typography.fontWeight.semibold,
								margin: 0,
								color: colors.text,
								lineHeight: 1.1,
							}}
						>
							Stakeholder simulations for engineering judgment workshops
						</h1>
						<p
							css={{
								margin: 0,
								color: colors.textMuted,
								fontSize: typography.fontSize.lg,
								maxWidth: '42rem',
							}}
						>
							`pea` powers realistic conversations with ambiguous, imperfect
							stakeholders so learners can practice clarifying problems,
							surfacing constraints, and critiquing outcomes before
							implementation.
						</p>
						<p
							css={{
								margin: 0,
								color: colors.textMuted,
								maxWidth: '38rem',
							}}
						>
							The workshop app owns the learner experience. `pea` owns the agent
							side: scenario behavior, stakeholder simulation, and instructor
							control.
						</p>
					</div>
				</div>
				<div
					css={{
						display: 'grid',
						gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
						gap: spacing.md,
						width: '100%',
						[mq.tablet]: {
							gridTemplateColumns: '1fr',
						},
					}}
				>
					{[
						[
							'Realistic ambiguity',
							'Stakeholders do not volunteer every requirement up front.',
						],
						[
							'Instructor control',
							'Prompts and scenarios can be adjusted to fit each exercise.',
						],
						[
							'Workshop integration',
							'Designed to plug into the separate workshop application.',
						],
					].map(([title, description]) => (
						<div
							key={title}
							css={{
								display: 'grid',
								gap: spacing.xs,
								padding: spacing.md,
								borderRadius: radius.lg,
								border: `1px solid ${colors.border}`,
								background: colors.background,
								textAlign: 'left',
							}}
						>
							<h2
								css={{
									margin: 0,
									color: colors.text,
									fontSize: typography.fontSize.base,
									fontWeight: typography.fontWeight.semibold,
								}}
							>
								{title}
							</h2>
							<p css={{ margin: 0, color: colors.textMuted }}>{description}</p>
						</div>
					))}
				</div>
			</div>
			<div
				css={{
					display: 'grid',
					gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
					gap: spacing.lg,
					width: '100%',
					[mq.tablet]: {
						gridTemplateColumns: '1fr',
					},
				}}
			>
				<div
					css={{
						display: 'grid',
						gap: spacing.md,
						padding: spacing.lg,
						borderRadius: radius.lg,
						border: `1px solid ${colors.border}`,
						background: colors.surface,
						boxShadow: shadows.sm,
					}}
				>
					<h2
						css={{
							margin: 0,
							color: colors.text,
							fontSize: typography.fontSize.xl,
							fontWeight: typography.fontWeight.semibold,
						}}
					>
						What learners should leave with
					</h2>
					<ul
						css={{
							margin: 0,
							paddingLeft: spacing.lg,
							display: 'grid',
							gap: spacing.sm,
							color: colors.textMuted,
						}}
					>
						{learnerOutputs.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>
				<div
					css={{
						display: 'grid',
						gap: spacing.md,
						padding: spacing.lg,
						borderRadius: radius.lg,
						border: `1px solid ${colors.border}`,
						background: colors.surface,
						boxShadow: shadows.sm,
					}}
				>
					<h2
						css={{
							margin: 0,
							color: colors.text,
							fontSize: typography.fontSize.xl,
							fontWeight: typography.fontWeight.semibold,
						}}
					>
						How the simulation should feel
					</h2>
					<ul
						css={{
							margin: 0,
							paddingLeft: spacing.lg,
							display: 'grid',
							gap: spacing.sm,
							color: colors.textMuted,
						}}
					>
						{simulationBehaviors.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>
			</div>
			<div
				css={{
					padding: spacing.lg,
					borderRadius: radius.lg,
					border: `1px solid ${colors.border}`,
					background: `linear-gradient(180deg, ${colors.primarySoftSubtle}, ${colors.surface})`,
					boxShadow: shadows.sm,
				}}
			>
				<p
					css={{
						margin: 0,
						color: colors.text,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					`pea` is not a coding tutor or the full workshop platform. It is the
					stakeholder simulation service that makes critique-based engineering
					judgment practice possible.
				</p>
			</div>
		</section>
	)
}
