import { lazy, StrictMode, Suspense } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';

const MujocoLab = lazy(() => import('./app/mujoco-lab'));
const showMujocoLab =
  new URLSearchParams(location.search).get('lab') === 'mujoco';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <Suspense fallback={<p>Cargando simulador…</p>}>
      {showMujocoLab ? <MujocoLab /> : <App />}
    </Suspense>
  </StrictMode>,
);
