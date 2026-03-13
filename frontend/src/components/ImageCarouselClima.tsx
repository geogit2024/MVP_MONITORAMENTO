// src/components/ImageCarousel.tsx

import React from 'react';
import type { ImageInfo } from '../types/image';
import './ImageCarousel.css'; // Ficheiro de estilos para o carrossel

interface ImageCarouselProps {
  images: ImageInfo[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  // âœ… NOVO: Prop para receber a ID da camada de resultado quando estiver visÃ­vel
  activeLayerId: string | null;
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({ images, selectedIds, onSelect, activeLayerId }) => {
  return (
    <div className="carousel-container">
      <div className="carousel-track">
        {images.map(image => {
          // âœ… REVISÃƒO: Uma imagem Ã© considerada "ativa" se estiver na lista de selecionadas
          // OU se for a nossa camada de resultado visÃ­vel.
          const isActive = selectedIds.includes(image.id) || activeLayerId === image.id;
          
          return (
            <div
              key={image.id}
              className={`carousel-item ${isActive ? 'selected' : ''}`}
              onClick={() => onSelect(image.id)}
            >
              <img src={image.thumbnailUrl} alt={image.date} className="carousel-thumbnail" />
              <div className="carousel-item-caption">{image.date}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ImageCarousel;
