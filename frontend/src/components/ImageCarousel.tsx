// Caminho: src/components/ImageCarousel.tsx

import React from 'react';
// A interface ImageInfo agora é importada do App.tsx, então não precisa ser definida aqui.
import { ImageInfo } from '../App'; 
import './ImageCarousel.css'; // Certifique-se de ter o arquivo CSS correspondente

// ✅ CORREÇÃO: Interface de props atualizada para incluir a função onPreview
interface ImageCarouselProps {
  images: ImageInfo[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onPreview: (id: string) => void; 
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({ images, selectedIds, onSelect, onPreview }) => {
  return (
    // ✅ CORREÇÃO: Renomeado para corresponder ao CSS fornecido anteriormente
    <div className="carousel-container">
      {images.map((img) => {
        const isSelected = selectedIds.includes(img.id);
        return (
          <div
            key={img.id}
            // ✅ CORREÇÃO: Renomeado e agora chama onPreview
            className={`carousel-item ${isSelected ? 'selected' : ''}`}
            onClick={() => onPreview(img.id)}
            title={`Pré-visualizar imagem de ${img.date}`}
          >
            <img src={img.thumbnailUrl} alt={`Imagem de ${img.date}`} />
            <div className="item-date">{img.date}</div>

            {/* ✅ CORREÇÃO: Adicionado um elemento separado para a seleção */}
            <div
              className="selection-checkbox"
              title="Selecionar para análise"
              // Este onClick impede que o clique "vaze" para o div pai,
              // acionando apenas a seleção e não o preview.
              onClick={(e) => {
                e.stopPropagation(); 
                onSelect(img.id);
              }}
            >
              {isSelected ? '✓' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ImageCarousel;