// Caminho: src/components/ImageCarousel.tsx

import React from 'react';
import { ImageInfo } from '../App'; 
import './ImageCarousel.css';

// A ID da camada virtual, idealmente exportada do App.tsx para consistência.
const CHANGE_LAYER_ID = 'change-detection-result';

interface ImageCarouselProps {
  images: ImageInfo[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onPreview: (id: string) => void; 
  // Prop para receber a ID da camada de resultado quando ela estiver visível
  activeLayerId: string | null;
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({ images, selectedIds, onSelect, onPreview, activeLayerId }) => {
  return (
    // ✅ CLASSE ATUALIZADA: de "carousel-container" para "image-carousel"
    <div className="image-carousel">
      {images.map((img) => {
        // Um item é considerado "ativo" se estiver na lista de seleção (para análise)
        // OU se for a nossa camada de resultado que está atualmente visível no mapa.
        const isActive = selectedIds.includes(img.id) || activeLayerId === img.id;
        
        // Lógica condicional para tratar o item da camada de resultado de forma diferente
        if (img.id === CHANGE_LAYER_ID) {
          // --- Renderização para a Camada de Resultado ---
          return (
            <div
              key={img.id}
              // ✅ CLASSE ATUALIZADA: de "carousel-item" para "thumbnail"
              className={`thumbnail ${isActive ? 'selected' : ''}`}
              // Um clique simples neste item controla sua visibilidade (liga/desliga)
              onClick={() => onSelect(img.id)}
              title="Clique para mostrar/esconder a camada de alterações"
            >
              <img src={img.thumbnailUrl} alt="Resultado da Análise" />
              {/* ✅ CLASSE ATUALIZADA: de "item-date" para "date-label" */}
              <div className="date-label">{img.date}</div>
              {/* Este item não precisa de checkbox de seleção para análise */}
            </div>
          );
        } else {
          // --- Renderização Padrão para Imagens de Satélite ---
          return (
            <div
              key={img.id}
              // ✅ CLASSE ATUALIZADA: de "carousel-item" para "thumbnail"
              className={`thumbnail ${isActive ? 'selected' : ''}`}
              onClick={() => onPreview(img.id)}
              title={`Pré-visualizar imagem de ${img.date}`}
            >
              <img src={img.thumbnailUrl} alt={`Imagem de ${img.date}`} />
              {/* ✅ CLASSE ATUALIZADA: de "item-date" para "date-label" */}
              <div className="date-label">{img.date}</div>
              
              <div
                className="selection-checkbox"
                title="Selecionar para análise"
                onClick={(e) => {
                  e.stopPropagation(); 
                  onSelect(img.id);
                }}
              >
                {/* Usamos 'isActive' aqui também para refletir o estado de seleção */}
                {isActive ? '✓' : ''}
              </div>
            </div>
          );
        }
      })}
    </div>
  );
};

export default ImageCarousel;