// src/components/ChangeResultModal.tsx

import React from 'react';

interface ChangeResultModalProps {
    gainArea: number;
    lossArea: number;
    onClose: () => void;
    theme?: 'light' | 'dark';
}

const ChangeResultModal: React.FC<ChangeResultModalProps> = ({ gainArea, lossArea, onClose, theme = 'dark' }) => {
    return (
        // A classe 'floating-popup' aplicada aqui
        <div className="floating-popup" data-theme={theme}> {/* Adicione data-theme para CSS dinâmico se usar */}
            <h2>Resultado da Detecção de Mudança</h2>
            <div className="results">
                <div className="result-item gain">
                    <p className="value">{gainArea.toFixed(2)} ha</p>
                    <span className="label">Área de Ganho de Vegetação</span>
                </div>
                <div className="result-item loss">
                    <p className="value">{lossArea.toFixed(2)} ha</p>
                    <span className="label">Área de Perda de Vegetação</span>
                </div>
            </div>
            <button className="close-button" onClick={onClose}>
                Fechar
            </button>
        </div>
    );
};

export default ChangeResultModal;