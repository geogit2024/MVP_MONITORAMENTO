// src/components/PropertyForm.tsx

import React from 'react';
import { Feature } from 'geojson';
import './PropertyForm.css';
import { Property } from '../mockProperties'; // Importa a interface Property

interface PropertyFormProps {
  geometry: Feature;
  onSubmit: (formData: any) => void;
  onCancel: () => void;
  initialData?: Property | null; // ✅ NOVA PROP: para dados iniciais
}

const PropertyForm: React.FC<PropertyFormProps> = ({ geometry, onSubmit, onCancel, initialData }) => {
  
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const dataObject = Object.fromEntries(formData.entries());
    onSubmit(dataObject);
  };

  const formTitle = initialData ? "Detalhes da Propriedade" : "Cadastro de Propriedade Rural";

  return (
    <div className="property-form-container">
      <div className="form-header">
        <h2>{formTitle}</h2>
        {!initialData && <p>A geometria da propriedade foi definida. Por favor, preencha os dados abaixo.</p>}
      </div>
      
      <div className="form-body">
        <form id="property-form" onSubmit={handleSubmit}>
          <fieldset>
            <legend>1. Identificação do Imóvel Rural</legend>
            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="propriedade_nome">Nome da propriedade</label>
                {/* ✅ USA defaultValue PARA PREENCHER O CAMPO */}
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

          <fieldset>
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

          <fieldset>
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
          
          <fieldset>
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
        <button type="button" onClick={onCancel} className="button-secondary">Cancelar</button>
        <button type="submit" form="property-form" className="button-primary">Salvar</button>
      </div>
    </div>
  );
};

export default PropertyForm;