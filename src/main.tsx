import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'
import App from './App'
import { markScrollbarKind } from './lib/scrollbars'
import './styles/index.css'

markScrollbarKind()

const CACHE_KEY = 'pokedex:cache'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    },
  },
})

/*
 * IndexedDB plutôt que localStorage. Ce dernier plafonne à 5 Mo et ne
 * stocke que des chaînes : l'index seul y tenait (424 Ko), mais les fiches
 * non — les 1025 représentent une quarantaine de mégaoctets, à comparer au
 * quota d'origine qui se compte en gigaoctets.
 */
const persister = createAsyncStoragePersister({
  key: CACHE_KEY,
  /*
   * Chaque écriture sérialise l'intégralité du cache. Au fil des fiches
   * consultées cela porte sur plusieurs mégaoctets, d'où une temporisation
   * plus large que la seconde par défaut.
   */
  throttleTime: 3000,
  storage: {
    getItem: (key) => get<string>(key).then((value) => value ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
})

// L'ancien cache localStorage n'a plus de lecteur : il occuperait 424 Ko
// pour rien chez ceux qui ont déjà visité le site.
try {
  window.localStorage.removeItem(CACHE_KEY)
} catch {
  // Stockage refusé (navigation privée stricte) : sans conséquence ici.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 30,
        // Relevé lors du passage à IndexedDB : ce qui est conservé a changé
        // de nature, les anciens caches ne doivent pas être réutilisés.
        buster: 'pokedex-v2',
        dehydrateOptions: {
          // Index et fiches. Persister les fiches est ce qui rend un Pokémon
          // déjà consulté consultable hors ligne, et plus seulement la grille.
          shouldDehydrateQuery: (query) => query.state.status === 'success',
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
)
