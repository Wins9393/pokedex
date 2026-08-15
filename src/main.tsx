import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import App from './App'
import { markScrollbarKind } from './lib/scrollbars'
import './styles/index.css'

markScrollbarKind()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    },
  },
})

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'pokedex:cache',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 30,
        buster: 'pokedex-v1',
        dehydrateOptions: {
          // Seul l'index est persisté : c'est lui qui rend l'appli
          // utilisable hors ligne. Persister chaque fiche consultée
          // saturerait le quota localStorage pour rien.
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success' && query.queryKey[1] === 'index',
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
)
