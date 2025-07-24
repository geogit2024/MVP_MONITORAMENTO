// src/components/TalhaoModal.tsx

import React, { useState, useEffect } from 'react';
import { Feature, Polygon } from 'geojson'; // Importe Feature e Polygon
import { Talhao } from '../interfaces/Talhao';
import "./TalhaoForm.css";
import * as turf from '@turf/turf'; // Para cálculo de área, se necessário

interface TalhaoModalProps {
  onClose: () => void;
  onSave: (talhao: Talhao) => void; // Chamado após o talhão ser salvo no backend
  propertyId: string;
  talhaoGeometry: Feature<Polygon>; // NOVO: Geometria do talhão desenhado
  initialArea?: number; // Opcional: Área pré-calculada do talhão
}

const TalhaoModal: React.FC<TalhaoModalProps> = ({ onClose, onSave, propertyId, talhaoGeometry, initialArea }) => {
  const [nome, setNome] = useState('');
  const [area, setArea] = useState<number | ''>(initialArea || '');
  const [culturaPrincipal, setCulturaPrincipal] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Calcula a área se não foi passada ou se a geometria mudar
    if (!initialArea && talhaoGeometry) {
      const calculatedArea = turf.area(talhaoGeometry) / 10000; // Converte para hectares
      setArea(parseFloat(calculatedArea.toFixed(4)));
    } else if (initialArea) {
      setArea(initialArea);
    }
  }, [talhaoGeometry, initialArea]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nome.trim() === '' || area === '' || area <= 0) {
      alert('Por favor, preencha o nome e a área do talhão.');
      return;
    }

    setIsLoading(true);
    const newTalhao: Partial<Talhao> = { // Usar Partial porque o ID será do backend
      nome: nome,
      area: Number(area),
      cultura_principal: culturaPrincipal,
      geometry: talhaoGeometry, // ✅ Inclui a geometria no payload
    };

    try {
        const response = await fetch(`http://localhost:8000/api/properties/${propertyId}/talhoes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(newTalhao),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao adicionar talhão.');
        }

        const savedTalhao: Talhao = await response.json(); // Backend deve retornar o talhão salvo com ID
        onSave(savedTalhao); // Notifica o componente pai

        alert('Talhão cadastrado com sucesso!');
        // O modal será fechado pelo pai após o onSave

    } catch (error: any) {
        console.error('Erro ao cadastrar talhão:', error);
        alert(error.message);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Cadastro de Talhão</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="talhaoNome">Nome do Talhão:</label>
            <input
              type="text"
              id="talhaoNome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="talhaoArea">Área (ha):</label>
            <input
              type="number"
              id="talhaoArea"
              value={area}
              onChange={(e) => setArea(parseFloat(e.target.value) || '')}
              step="0.01"
              required
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="talhaoCultura">Cultura Principal:</label>
            <input
              type="text"
              id="talhaoCultura"
              value={culturaPrincipal}
              onChange={(e) => setCulturaPrincipal(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="modal-actions">
            <button type="submit" className="button-primary" disabled={isLoading}>
              {isLoading ? 'Salvando...' : 'Salvar Talhão'}
            </button>
            <button type="button" className="button-secondary" onClick={onClose} disabled={isLoading}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TalhaoModal;