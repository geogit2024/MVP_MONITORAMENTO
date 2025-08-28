// src/pages/EdicaoTalhaoPage.tsx

import React, { useState } from 'react';
import MapView from '../components/MapView'; // Importa o seu componente de mapa
import './EdicaoTalhaoPage.css'; 

const EdicaoTalhaoPage = () => {
  // Estados para controlar as propriedades (props) que o MapView espera receber.
  // Estes são exemplos para tornar o componente funcional.
  const [baseMapKey, setBaseMapKey] = useState('satellite');
  const [activeAoi, setActiveAoi] = useState(null);
  const [mapViewTarget, setMapViewTarget] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
    // ✅ LOG 1: Verificar se esta página está sendo renderizada e passando a prop
  console.log("LOG 1 (EdicaoTalhaoPage): Renderizando MapView com startWithEditPanelOpen=true");
  return (
    <div className="edicao-talhao-container">
      <MapView 
        // ✅ ALTERAÇÃO PRINCIPAL: 
        // Esta prop instrui o MapView a abrir o painel de edição imediatamente.
        startWithEditPanelOpen={true}
        
        // Props de exemplo para garantir que o MapView funcione corretamente.
        // Você poderá conectar estas props a uma lógica mais complexa no futuro.
        baseMapKey={baseMapKey}
        onBaseMapChange={setBaseMapKey}
        activeAoi={activeAoi}
        mapViewTarget={mapViewTarget}
        onPropertySelect={(id) => console.log(`Propriedade ${id} selecionada`)}
        refreshTrigger={refreshTrigger}
        
        // Props que podem não ser usadas nesta tela, mas que o componente espera
        onDrawComplete={() => {}}
        visibleLayerUrl={null}
        previewLayerUrl={null}
        changePolygons={null}
        differenceLayerUrl={null}
        indexLayerZIndex={1}
        differenceLayerZIndex={1}
        previewLayerZIndex={1}
        drawingEnabled={false}
      />
    </div>
  );
};

export default EdicaoTalhaoPage;