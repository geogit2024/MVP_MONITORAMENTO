// src/components/PropertyForm.tsx

import React, { useState, useEffect } from 'react'; // Importe useEffect aqui
import { Feature, Geometry } from 'geojson'; 
import './PropertyForm.css';
import { Property } from '../../types';

interface PropertyFormProps {
  geometry?: Feature | Geometry;
  onSubmit: (formData: any) => void;
  onCancel: () => void;
  initialData?: Property | null;
  isReadOnly: boolean;
  onEdit?: () => void;
  onDelete?: (propertyId: string) => void; // Certifique-se de que esta prop está definida na interface
  onSegmentationComplete?: () => void;
}

const PropertyForm: React.FC<PropertyFormProps> = ({
  geometry,
  onSubmit,
  onCancel,
  initialData,
  isReadOnly,
  onEdit,
  onDelete, // Certifique-se de desestruturar onDelete aqui
  onSegmentationComplete,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  // NOVO: console.log para depurar as props no carregamento do componente
  useEffect(() => {
    console.log('--- PropertyForm Props State ---');
    console.log('isReadOnly:', isReadOnly);
    console.log('initialData:', initialData);
    console.log('initialData.id:', initialData?.id);
    console.log('onDelete (type):', typeof onDelete);
    console.log('------------------------------');
  }, [isReadOnly, initialData, onDelete]);


  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    let geometryToProcess: Geometry | null = null;

    if (geometry && (geometry as Feature).type === 'Feature' && (geometry as Feature).geometry) {
      geometryToProcess = (geometry as Feature).geometry;
    } 
    else if (geometry && ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(geometry.type as any)) {
      geometryToProcess = geometry as Geometry;
    }
    else if (initialData?.geometry && (initialData.geometry as Feature).type === 'Feature' && (initialData.geometry as Feature).geometry) {
      geometryToProcess = (initialData.geometry as Feature).geometry;
    }
    else if (initialData?.geometry && ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(initialData.geometry.type as any)) {
        geometryToProcess = initialData.geometry as Geometry;
    }

    if (!geometryToProcess) {
      console.error("Erro: A geometria da propriedade não está definida para salvar.");
      alert("Não foi possível salvar: A geometria da propriedade está faltando ou é inválida.");
      setIsLoading(false);
      return;
    }

    const form = event.currentTarget;
    const data: { [key: string]: any } = {
      propriedade_nome: form.propriedade_nome.value,
      municipio: form.municipio.value,
      estado: form.estado.value,
      area_total: parseFloat(form.area_total.value),
      proprietario_nome: form.proprietario_nome.value,
      cpf_cnpj: form.cpf_cnpj.value,
      email: form.email.value,
      incra_codigo: form.incra_codigo.value || null,
      matricula: form.matricula.value || null,
      ccir: form.ccir.value || null,
      geometry: geometryToProcess,
    };

    const isEditing = initialData && initialData.id;
    let url = isEditing
      ? `http://localhost:8000/api/properties/${initialData.id}`
      : 'http://localhost:8000/api/properties';
    let method = isEditing ? 'PUT' : 'POST';

    try {
      const jsonData = JSON.stringify(data);
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: jsonData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.detail && Array.isArray(errorData.detail)) {
            const errorMessages = errorData.detail
              .map((err: any) => {
                const fieldName = err.loc?.[1] || 'campo indefinido';
                return `Campo '${fieldName}': ${err.msg}`;
              })
              .join('\n');
            throw new Error(`Erros de validação:\n${errorMessages}`);
          }
          throw new Error(errorData.detail || 'Erro desconhecido no servidor.');
        } catch {
          throw new Error(`Erro interno ao salvar. Resposta: ${errorText || response.statusText}`);
        }
      }

      const result = await response.json();
      onSubmit(result);
    } catch (error: any) {
      console.error('Erro ao salvar propriedade:', error);
      alert(error.message || 'Erro de conexão. Verifique sua rede e o servidor.');
    } finally {
      setIsLoading(false);
    }
  };


  const formTitle = initialData ? 'Detalhes da Propriedade' : 'Cadastro de Propriedade Rural';

  return (
    <div className="property-form-container">
      <div className="form-header">
        <h2>{formTitle}</h2>
        {!initialData && (
          <p>A geometria da propriedade foi definida. Por favor, preencha os dados abaixo.</p>
        )}
      </div>

      <div className="form-body">
        <form
          id="property-form"
          onSubmit={!isReadOnly ? handleSubmit : (e) => e.preventDefault()}
        >
          <fieldset disabled={isLoading || isReadOnly}>
            <legend>1. Identificação do Imóvel Rural</legend>
            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="propriedade_nome">Nome da propriedade</label>
                <input
                  type="text"
                  id="propriedade_nome"
                  name="propriedade_nome"
                  defaultValue={initialData?.propriedade_nome || ''}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="incra_codigo">Código do Imóvel no INCRA</label>
                <input
                  type="text"
                  id="incra_codigo"
                  name="incra_codigo"
                  defaultValue={initialData?.incra_codigo || ''}
                />
              </div>
              <div className="form-group">
                <label htmlFor="municipio">Município</label>
                <input
                  type="text"
                  id="municipio"
                  name="municipio"
                  defaultValue={initialData?.municipio || ''}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="estado">Estado</label>
                <input
                  type="text"
                  id="estado"
                  name="estado"
                  defaultValue={initialData?.estado || ''}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="area_total">Área total (ha)</label>
                <input
                  type="number"
                  step="0.01"
                  id="area_total"
                  name="area_total"
                  defaultValue={initialData?.area_total || ''}
                  required
                />
              </div>
            </div>
          </fieldset>

          <fieldset disabled={isLoading || isReadOnly}>
            <legend>2. Identificação do Proprietário ou Possuidor</legend>
            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="proprietario_nome">Nome completo / Razão Social</label>
                <input
                  type="text"
                  id="proprietario_nome"
                  name="proprietario_nome"
                  defaultValue={initialData?.proprietario_nome || ''}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="cpf_cnpj">CPF ou CNPJ</label>
                <input
                  type="text"
                  id="cpf_cnpj"
                  name="cpf_cnpj"
                  defaultValue={initialData?.cpf_cnpj || ''}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">E-mail</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  defaultValue={initialData?.email || ''}
                  required
                />
              </div>
            </div>
          </fieldset>

          <fieldset disabled={isLoading || isReadOnly}>
            <legend>3. Documentação do Imóvel</legend>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="matricula">Número da matrícula / escritura</label>
                <input
                  type="text"
                  id="matricula"
                  name="matricula"
                  defaultValue={initialData?.matricula || ''}
                />
              </div>
              <div className="form-group">
                <label htmlFor="ccir">Número do CCIR</label>
                <input
                  type="text"
                  id="ccir"
                  name="ccir"
                  defaultValue={initialData?.ccir || ''}
                />
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
        {isReadOnly && initialData && (
          <>
            <button
              type="button"
              onClick={() => {
                if (onEdit) {
                  onEdit(); // importante para liberar edição no componente pai
                }
              }}
              className="button-secondary"
              disabled={isLoading}
            >
              Editar
            </button>

            {/* CONSOLE.LOG ADICIONADO AQUI PARA DEPURAR A RENDERIZAÇÃO DO BOTÃO APAGAR */}
            {console.log('Condições para botão Apagar:', {
              isReadOnly: isReadOnly,
              initialDataExists: !!initialData,
              initialDataId: initialData?.id,
              onDeleteIsFunction: typeof onDelete === 'function'
            })}

            {/* Botão Apagar Registro - SÓ SERÁ RENDERIZADO SE TODAS AS CONDIÇÕES FOREM TRUE */}
            {typeof onDelete === 'function' && (
              <button
                type="button"
                onClick={() => initialData?.id && onDelete(initialData.id)}
                className="button-delete"
                disabled={isLoading}
              >
                Apagar Registro
              </button>
            )}
          </>
        )}

        {!isReadOnly && (
          <button
            type="button"
            onClick={onCancel}
            className="button-secondary"
            disabled={isLoading}
          >
            Cancelar
          </button>
        )}

        <button
          type={!isReadOnly ? 'submit' : 'button'}
          form="property-form"
          onClick={!isReadOnly ? undefined : onCancel}
          className="button-primary"
          disabled={isLoading}
        >
          {isLoading ? 'Salvando...' : !isReadOnly ? 'Salvar' : 'Fechar'}
        </button>
      </div>
    </div>
  );
};

export default PropertyForm;