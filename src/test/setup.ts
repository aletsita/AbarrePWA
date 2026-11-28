import { setupIonicReact } from '@ionic/react';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sin animaciones: los modales abren y cierran en el mismo ciclo
setupIonicReact({ mode: 'md', animated: false });

// jsdom no trae matchMedia (Ionic lo consulta al presentar)
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}

afterEach(() => cleanup());
