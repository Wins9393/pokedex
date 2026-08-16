import { Route, Routes } from 'react-router'
import { BattlePage } from '@/pages/BattlePage'
import { PokedexPage } from '@/pages/PokedexPage'

export default function App() {
  return (
    <Routes>
      {/* La fiche est une surcouche de la grille : même page, la grille
          reste montée derrière, donc le scroll et les filtres survivent. */}
      <Route path="/" element={<PokedexPage />} />
      <Route path="/pokemon/:id" element={<PokedexPage />} />
      <Route path="/combat" element={<BattlePage />} />
      <Route path="*" element={<PokedexPage />} />
    </Routes>
  )
}
