// Caminho: src/components/ImageCarousel.tsx

import React from 'react';
import './ImageCarousel.css';

export interface ImageInfo {
  id: string;
  date: string;
  thumbnailUrl: string;
}

interface ImageCarouselProps {
  images: ImageInfo[];
  selectedIds: string[];
  onSelect: (id: string) => void;
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({ images, selectedIds, onSelect }) => {
  return (
    <div className="image-carousel">
      {images.map((img) => (
        <div
          key={img.id}
          className={`thumbnail ${selectedIds.includes(img.id) ? 'selected' : ''}`}
          onClick={() => onSelect(img.id)}
        >
          <img src={img.thumbnailUrl} alt={img.date} />
          <div className="date-label">{img.date}</div>
        </div>
      ))}
    </div>
  );
};

export default ImageCarousel;