// Caminho: src/components/SidebarClima.tsx

import React from 'react';
import './Sidebar.css'; // Reutiliza os estilos da sidebar principal

interface SidebarClimaProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  // Futuramente, você pode adicionar mais props específicas para este módulo
}

export default function SidebarClima({
  theme,
  onToggleTheme,
}: SidebarClimaProps) {
  
  return (
    <aside className="sidebar-container">
      {/* O TÍTULO FOI REMOVIDO. O BOTÃO DE TEMA AGORA É O ÚNICO ELEMENTO. */}
      <div className="sidebar-header">
        <button onClick={onToggleTheme} title="Alternar Tema" className="theme-toggle-button">
          <img src="/logo.png" alt="Campos Conectados" className="theme-toggle-logo" />
        </button>
      </div>

      <div className="sidebar-content">
        {/* Aqui você adicionará os filtros e funcionalidades do módulo de clima */}
        <fieldset className="filter-group">
          <legend>Filtros de Clima (Exemplo)</legend>
          <label>
            Período de Análise:
            <input type="date" disabled />
          </label>
          <label>
            Variável Climática:
            <select disabled>
              <option>Temperatura</option>
              <option>Precipitação</option>
              <option>Umidade</option>
            </select>
          </label>
        </fieldset>
      </div>
    </aside>
  );
}

