// src/components/IndicesInfoPanel.tsx (Atualizado)

import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import './IndicesInfoPanel.css';

// 1. Dados da tabela atualizados com a coluna "Culturas Comuns"
const indicesData = [
  {
    indice: 'NDVI',
    descricao: 'Índice de Vegetação da Diferença Normalizada. O mais comum para medir a saúde e densidade da vegetação.',
    aplicacao: 'Monitoramento geral da saúde da cultura, identificação de áreas com estresse hídrico ou de nutrientes, estimativa de biomassa.',
    culturas: 'Soja (pleno desenvolvimento), Cana-de-açúcar, Trigo, Arroz, Hortaliças, Pastagem.'
  },
  {
    indice: 'SAVI',
    descricao: 'Índice de Vegetação Ajustado ao Solo. Minimiza a influência do brilho do solo em áreas com pouca vegetação.',
    aplicacao: 'Ideal para estágios iniciais de crescimento da cultura, análise de solos com vegetação esparsa, agricultura em zonas áridas.',
    culturas: 'Soja (estágio inicial), culturas em geral durante a emergência.'
  },
  {
    indice: 'MSAVI',
    descricao: 'Índice de Vegetação Ajustado ao Solo Modificado. Uma melhoria do SAVI, ainda mais eficaz na redução do efeito do solo.',
    aplicacao: 'Semelhante ao SAVI, mas com maior precisão em áreas de transição entre solo e vegetação. Ótimo para agricultura de precisão.',
    culturas: 'Culturas com dossel aberto ou em solos com muita variabilidade.'
  },
  {
    indice: 'Red-Edge NDVI (NDRE)',
    descricao: 'Utiliza a banda de Red-Edge (Borda do Vermelho) para medir o teor de clorofila. Sensível a mudanças na saúde da planta.',
    aplicacao: 'Detecção precoce de estresse nutricional (especialmente nitrogênio), monitoramento de culturas de dossel denso, mapeamento de senescência.',
    culturas: 'Milho, Café, Algodão, Frutíferas (maçã, uva), Cana-de-açúcar.'
  }
];

interface Props {
  onClose: () => void;
}

const IndicesInfoPanel: React.FC<Props> = ({ onClose }) => {
  const nodeRef = useRef(null);

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".panel-header"
      bounds=".app-container"
      defaultPosition={{ x: 400, y: 80 }}
    >
      <ResizableBox
        ref={nodeRef}
        width={850} // Largura ajustada para a nova coluna
        height={450}
        minConstraints={[500, 300]}
        maxConstraints={[1200, 800]}
        className="floating-panel-box"
        handle={<span className="react-resizable-handle react-resizable-handle-se" />}
      >
        <div className="panel-header">
          <h3>Guia de Índices de Vegetação</h3>
          <button onClick={onClose} className="panel-close-button">&times;</button>
        </div>
        <div className="panel-body panel-body-scrollable">
          <table className="info-table">
            <thead>
              <tr>
                <th>Índice</th>
                <th>Descrição</th>
                <th>Aplicação Prática</th>
                <th>Culturas Comuns</th> {/* 2. Nova coluna adicionada */}
              </tr>
            </thead>
            <tbody>
              {indicesData.map((item) => (
                <tr key={item.indice}>
                  <td><strong>{item.indice}</strong></td>
                  <td>{item.descricao}</td>
                  <td>{item.aplicacao}</td>
                  <td>{item.culturas}</td> {/* 3. Novo dado adicionado */}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ResizableBox>
    </Draggable>
  );
};

export default IndicesInfoPanel;