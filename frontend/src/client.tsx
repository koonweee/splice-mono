import { StrictMode, startTransition } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
import { isLocalLaunch } from './lib/pwa/launch-mode'

startTransition(() => {
  if (isLocalLaunch) {
    // The public build shell has no Start SSR state. Mount Router as a client
    // application; only network-authenticated documents use Start hydration.
    const router = getRouter()
    createRoot(document).render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    )
  } else {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    )
  }
})
