import { Route, Routes } from 'react-router'
import { PokedexPage } from '@/pages/PokedexPage'

export default function App() {
  return (
    <Routes>
      {/* La fiche est une surcouche de la grille : même page, la grille
          reste montée derrière, donc le scroll et les filtres survivent. */}
      <Route path="/" element={<PokedexPage />} />
      <Route path="/pokemon/:id" element={<PokedexPage />} />
      <Route path="*" element={<PokedexPage />} />
    </Routes>
  )
}
