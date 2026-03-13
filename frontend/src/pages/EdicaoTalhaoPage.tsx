import React, { useState } from 'react';
import MapView from '../components/MapView';
import './EdicaoTalhaoPage.css';

const EdicaoTalhaoPage = () => {
  const [baseMapKey, setBaseMapKey] = useState('google_hybrid');
  const [activeAoi] = useState(null);
  const [mapViewTarget] = useState(null);
  const [refreshTrigger] = useState(0);

  return (
    <div className="edicao-talhao-container">
      <MapView
        baseMapKey={baseMapKey}
        onBaseMapChange={setBaseMapKey}
        activeAoi={activeAoi}
        mapViewTarget={mapViewTarget}
        onPropertySelect={(id) => console.log(`Propriedade ${id} selecionada`)}
        refreshTrigger={refreshTrigger}
        onDrawComplete={() => {}}
        visibleLayerUrl={null}
        previewLayerUrl={null}
        previewOverlay={null}
        changePolygons={null}
        differenceLayerUrl={null}
        indexLayerZIndex={1}
        differenceLayerZIndex={1}
        previewLayerZIndex={1}
        drawingEnabled={false}
        onAoiDeleted={() => {}}
      />
    </div>
  );
};

export default EdicaoTalhaoPage;
