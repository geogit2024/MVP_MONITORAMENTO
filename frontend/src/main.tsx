import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Estilos globais (inclui Leaflet CSS via import em MapView)
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);