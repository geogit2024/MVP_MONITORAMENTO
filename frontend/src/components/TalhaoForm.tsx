import React, { useState, useEffect } from 'react';
import { Feature, Polygon } from 'geojson';
import { Talhao } from '../interfaces/Talhao';
import './TalhaoForm.css';
import * as turf from '@turf/turf';

interface TalhaoModalProps {
  onClose: () => void;
  onSave: (talhao: Talhao) => void;
  propertyId: number | undefined;
  talhaoGeometry: Feature<Polygon>;
  initialArea?: number;
}

const TalhaoModal: React.FC<TalhaoModalProps> = ({ onClose, onSave, propertyId, talhaoGeometry, initialArea }) => {
  // Log de DEBUG para observar a prop recebida
  console.log('%c[FILHO] Componente TalhaoForm recebeu a prop propertyId:', 'color: green; font-weight: bold;', propertyId);

  const [nome, setNome] = useState('');
  const [area, setArea] = useState<number | ''>(initialArea || '');
  const [culturaPrincipal, setCulturaPrincipal] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!initialArea && talhaoGeometry && talhaoGeometry.geometry?.type === 'Polygon') {
      try {
        const calcArea = turf.area(talhaoGeometry);
        const areaHa = calcArea / 10000;
        setArea(parseFloat(areaHa.toFixed(4)));
      } catch (err) {
        console.error('Erro ao calcular área do talhão:', err);
        alert('Não foi possível calcular a área do talhão.');
      }
    } else if (initialArea) {
      setArea(initialArea);
    }
  }, [talhaoGeometry, initialArea]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // A guarda de segurança que nos alerta sobre o problema
    if (typeof propertyId !== 'number' || propertyId <= 0) {
      alert('Erro: ID da Propriedade inválido. Não é possível salvar.');
      console.error("ID da Propriedade inválido detectado no TalhaoForm:", propertyId);
      return; 
    }

    if (!nome || area === '' || Number(area) <= 0) {
      alert('Por favor, preencha corretamente os campos obrigatórios.');
      return;
    }

    setIsLoading(true);
    const novoTalhao = {
      nome,
      area: Number(area),
      cultura_principal: culturaPrincipal,
      geometry: talhaoGeometry.geometry,
    };

    try {
      const response = await fetch(`http://localhost:8000/api/properties/${propertyId}/talhoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(novoTalhao),
      });

      if (!response.ok) {
        const erro = await response.json();
        throw new Error(erro.detail || 'Erro ao salvar o talhão.');
      }

      const talhaoSalvo: Talhao = await response.json();
      alert('Talhão cadastrado com sucesso!');
      onSave(talhaoSalvo);
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Erro desconhecido ao salvar.');
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
            <label htmlFor="nome">Nome do Talhão:</label>
            <input
              type="text"
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="area">Área (ha):</label>
            <input
              type="number"
              id="area"
              value={area}
              onChange={(e) => setArea(parseFloat(e.target.value) || '')}
              required
              disabled={isLoading}
              step="0.01"
            />
          </div>
          <div className="form-group">
            <label htmlFor="culturaPrincipal">Cultura Principal:</label>
            <input
              type="text"
              id="culturaPrincipal"
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