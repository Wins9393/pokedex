import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { LoadingScreen } from '@/components/ui/StateScreens'
import { PokedexPage } from '@/pages/PokedexPage'

/*
 * Le mode combat sort du paquet principal : moteur, arène et sélection
 * d'équipe ne servent qu'à ceux qui y entrent, et le Pokédex se charge
 * plus vite sans eux. Le service worker précache tous les fichiers du
 * build, chunk compris, donc le hors-ligne n'y perd rien.
 */
const BattlePage = lazy(() =>
  import('@/pages/BattlePage').then((module) => ({ default: module.BattlePage })),
)

export default function App() {
  return (
    <Routes>
      {/* La fiche est une surcouche de la grille : même page, la grille
          reste montée derrière, donc le scroll et les filtres survivent. */}
      <Route path="/" element={<PokedexPage />} />
      <Route path="/pokemon/:id" element={<PokedexPage />} />
      {/* Sans segment, la page propose les trois modes ; avec, elle joue
          celui-là. Même composant, donc un seul chunk à charger et une
          navigation instantanée entre la sélection et la partie. */}
      <Route
        path="/combat"
        element={
          <Suspense fallback={<LoadingScreen label="Chargement du mode combat…" />}>
            <BattlePage />
          </Suspense>
        }
      />
      <Route
        path="/combat/:mode"
        element={
          <Suspense fallback={<LoadingScreen label="Chargement du mode combat…" />}>
            <BattlePage />
          </Suspense>
        }
      />
      <Route path="*" element={<PokedexPage />} />
    </Routes>
  )
}
