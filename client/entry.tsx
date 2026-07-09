import { createRoot } from 'remix/ui'
import { App } from './app.tsx'

const rootElement = document.getElementById('root') ?? document.body
if (rootElement.childNodes.length > 0) {
	// Remix UI auto-hydrates non-empty containers. We render from scratch.
	rootElement.replaceChildren()
}
createRoot(rootElement).render(<App />)
