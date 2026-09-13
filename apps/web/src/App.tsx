import { Route, Routes } from 'react-router-dom';
import { CanvasPage } from './pages/Canvas';
import { HomePage } from './pages/Home';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/s/:spaceId" element={<CanvasPage />} />
      <Route path="*" element={<p className="page">Страница не найдена.</p>} />
    </Routes>
  );
}
