// src/components/PropertyForm.tsx

import React, { useState } from 'react';
import { Feature } from 'geojson';
import './PropertyForm.css';
import { Property } from '../../types'; // Ajuste o caminho se necessário

interface PropertyFormProps {
  geometry: Feature;
  onSubmit: (formData: any) => void;
  onCancel: () => void;
  initialData?: Property | null;
  isReadOnly?: boolean;
}

const PropertyForm: React.FC<PropertyFormProps> = ({
  geometry,
  onSubmit,
  onCancel,
  initialData,
  isReadOnly = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  // ✅ ESTA É A FUNÇÃO COMPLETA E CORRIGIDA
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    formData.append('geometry', JSON.stringify(geometry.geometry));

    try {
      const response = await fetch('http://localhost:8000/api/properties', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.detail && Array.isArray(errorData.detail)) {
          const errorMessages = errorData.detail
            .map((err: any) => `Campo '${err.loc[1]}': ${err.msg}`)
            .join('\n');
          throw new Error(`Erros de validação:\n${errorMessages}`);
        }
        throw new Error(errorData.detail || 'Ocorreu um erro desconhecido no servidor.');
      }

      const result = await response.json();
      onSubmit(result);

    } catch (error: any) {
      console.error('Erro ao cadastrar propriedade:', error);
      alert(error.message); // O alert exibirá a mensagem de erro real
    } finally {
      setIsLoading(false);
    }
  };

  const formTitle = initialData ? "Detalhes da Propriedade" : "Cadastro de Propriedade Rural";
  const primaryButtonText = isReadOnly ? "Fechar" : "Salvar";

  return (
    <div className="property-form-container">
      <div className="form-header">
        <h2>{formTitle}</h2>
        {!initialData && <p>A geometria da propriedade foi definida. Por favor, preencha os dados abaixo.</p>}
      </div>
      
      <div className="form-body">
        <form id="property-form" onSubmit={!isReadOnly ? handleSubmit : (e) => e.preventDefault()}>
          <fieldset disabled={isLoading || isReadOnly}>
            <legend>1. Identificação do Imóvel Rural</legend>
            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="propriedade_nome">Nome da propriedade</label>
                <input type="text" id="propriedade_nome" name="propriedade_nome" defaultValue={initialData?.propriedade_nome || ''} required />
              </div>
              <div className="form-group">
                <label htmlFor="incra_codigo">Código do Imóvel no INCRA (se houver)</label>
                <input type="text" id="incra_codigo" name="incra_codigo" defaultValue={initialData?.incra_codigo || ''} />
              </div>
               <div className="form-group">
                <label htmlFor="municipio">Município</label>
                <input type="text" id="municipio" name="municipio" defaultValue={initialData?.municipio || ''} required />
              </div>
              <div className="form-group">
                <label htmlFor="estado">Estado</label>
                <input type="text" id="estado" name="estado" defaultValue={initialData?.estado || ''} required />
              </div>
              <div className="form-group">
                <label htmlFor="area_total">Área total (ha)</label>
                <input type="number" step="0.01" id="area_total" name="area_total" defaultValue={initialData?.area_total || ''} required />
              </div>
            </div>
          </fieldset>

          <fieldset disabled={isLoading || isReadOnly}>
            <legend>2. Identificação do Proprietário ou Possuidor</legend>
            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="proprietario_nome">Nome completo / Razão Social</label>
                <input type="text" id="proprietario_nome" name="proprietario_nome" defaultValue={initialData?.proprietario_nome || ''} required />
              </div>
              <div className="form-group">
                <label htmlFor="cpf_cnpj">CPF ou CNPJ</label>
                <input type="text" id="cpf_cnpj" name="cpf_cnpj" defaultValue={initialData?.cpf_cnpj || ''} required />
              </div>
              <div className="form-group">
                <label htmlFor="email">E-mail</label>
                <input type="email" id="email" name="email" defaultValue={initialData?.email || ''} required />
              </div>
            </div>
          </fieldset>

          <fieldset disabled={isLoading || isReadOnly}>
            <legend>3. Documentação do Imóvel</legend>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="matricula">Número da matrícula / escritura</label>
                <input type="text" id="matricula" name="matricula" defaultValue={initialData?.matricula || ''} />
              </div>
              <div className="form-group">
                <label htmlFor="ccir">Número do CCIR</label>
                <input type="text" id="ccir" name="ccir" defaultValue={initialData?.ccir || ''} />
              </div>
            </div>
          </fieldset>
          
          <fieldset disabled={isLoading || isReadOnly}>
              <legend>6. Anexos (Digitalizados)</legend>
              <div className="form-group">
                  <label htmlFor="doc_identidade">Documento de identidade (RG/CPF ou CNPJ)</label>
                  <input type="file" id="doc_identidade" name="doc_identidade" />
              </div>
               <div className="form-group">
                  <label htmlFor="doc_terra">Documento da terra (escritura, contrato)</label>
                  <input type="file" id="doc_terra" name="doc_terra" />
              </div>
          </fieldset>
        </form>
      </div>

      <div className="form-actions">
        {!isReadOnly && <button type="button" onClick={onCancel} className="button-secondary" disabled={isLoading}>Cancelar</button>}
        <button 
          type={isReadOnly ? "button" : "submit"}
          form="property-form" 
          onClick={isReadOnly ? onCancel : undefined}
          className="button-primary" 
          disabled={isLoading}
        >
          {isLoading ? 'Salvando...' : primaryButtonText}
        </button>
      </div>
    </div>
  );
};

export default PropertyForm;