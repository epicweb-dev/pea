import {
	css as cssMixin,
	Fragment,
	on as onMixin,
	type Handle,
	type Props as RemixProps,
	type RemixElement,
	type RemixNode,
} from 'remix/ui'
import {
	jsx as remixJsx,
	jsxDEV as remixJsxDev,
	jsxs as remixJsxs,
} from 'remix/ui/jsx-runtime'

type LegacyEventHandler = {
	bivarianceHack(event: any, signal: AbortSignal): void
}['bivarianceHack']
type LegacyEventMap = Record<string, LegacyEventHandler>
type RenderFn = () => RemixNode

type LegacyProps = Record<string, unknown> & {
	children?: RemixNode
	css?: Record<string, unknown>
	key?: unknown
	mix?: unknown
	on?: LegacyEventMap
}
type KnownElementName =
	| keyof HTMLElementTagNameMap
	| keyof SVGElementTagNameMap
	| keyof MathMLElementTagNameMap
type CompatIntrinsicElements = {
	[elementName in KnownElementName]: RemixProps<
		elementName & keyof globalThis.JSX.IntrinsicElements
	> &
		LegacyProps
}

type ElementType = string | ((handle: Handle<any, any>) => RenderFn)

function normalizeProps(props: Record<string, unknown> | null | undefined) {
	if (!props) return {}
	const { css, mix, on, ...rest } = props
	const nextMix = []
	if (css && typeof css === 'object') {
		nextMix.push(cssMixin(css as any))
	}
	if (on && typeof on === 'object') {
		for (const [eventName, handler] of Object.entries(on as LegacyEventMap)) {
			nextMix.push(onMixin(eventName as never, handler as never))
		}
	}
	if (Array.isArray(mix)) {
		nextMix.push(...mix)
	} else if (mix) {
		nextMix.push(mix)
	}
	if (nextMix.length === 0) {
		return props
	}
	return {
		...rest,
		mix: nextMix,
	}
}

export function jsx(
	type: ElementType,
	props: Record<string, unknown> | null | undefined,
	key?: string,
) {
	return remixJsx(type, normalizeProps(props), key)
}

export function jsxs(
	type: ElementType,
	props: Record<string, unknown> | null | undefined,
	key?: string,
) {
	return remixJsxs(type, normalizeProps(props), key)
}

export function jsxDEV(
	type: ElementType,
	props: Record<string, unknown> | null | undefined,
	key?: string,
) {
	return remixJsxDev(type, normalizeProps(props), key)
}

export { Fragment }

export namespace JSX {
	export type Element = RemixElement
	export type ElementType = string | ((handle: Handle<any, any>) => RenderFn)
	export type ElementChildrenAttribute = {
		children: unknown
	}
	export interface IntrinsicAttributes {
		key?: unknown
	}
	export type LibraryManagedAttributes<component, props> = component extends (
		handle: Handle<infer componentProps, any>,
	) => RenderFn
		? componentProps extends Record<string, never>
			? { key?: unknown }
			: componentProps & { key?: unknown }
		: props
	export type IntrinsicElements = CompatIntrinsicElements
}
