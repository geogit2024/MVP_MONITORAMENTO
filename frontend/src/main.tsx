// src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // ✅ Importar
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {/* ✅ Envolver o App com o BrowserRouter é essencial */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);