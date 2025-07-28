// src/components/NdviResultModal.tsx

import React from 'react';
import type { NdviAreas } from '../MainApplication';
import NdviClassificationChart from './NDVIQuantitativos';

interface Props {
  data: NdviAreas;
  onClose: () => void; // Função para fechar o modal
}

const NdviResultModal: React.FC<Props> = ({ data, onClose }) => {
  // Impede que o clique dentro do modal feche a janela
  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    // O overlay escuro que cobre a tela
    <div className="modal-overlay" onClick={onClose}>
      {/* O container do conteúdo do modal */}
      <div className="modal-content" onClick={handleContentClick}>
        <div className="modal-header">
          <h3>Resultados da Análise NDVI</h3>
          <button onClick={onClose} className="modal-close-button">&times;</button>
        </div>
        <div className="modal-body">
          <NdviClassificationChart data={data} />
        </div>
      </div>
    </div>
  );
};

export default NdviResultModal;