import React, { useState, useRef } from 'react';
import { Feature } from 'geojson';
import togeojson from '@mapbox/togeojson';
import './ReservoirSidebar.css'; 

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// 1. ATUALIZAÇÃO: A interface de props agora inclui a função 'onReservoirSelect'
interface ReservoirSidebarProps {
    reservoirs: Feature[];
    onRefresh: () => void;
    onReservoirSelect: (feature: Feature) => void;
}

const ReservoirSidebar: React.FC<ReservoirSidebarProps> = ({ reservoirs, onRefresh, onReservoirSelect }) => {
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [kmlFile, setKmlFile] = useState<File | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setKmlFile(file);
            setIsFormVisible(true);
            setError(null);
        }
    };
    
    const resetForm = () => {
        setName('');
        setDescription('');
        setKmlFile(null);
        setIsFormVisible(false);
        setIsSubmitting(false);
        setError(null);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!kmlFile || !name) {
            setError('Nome e arquivo KML são obrigatórios.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const kmlText = await kmlFile.text();
            const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
            const geojson = togeojson.kml(dom);
            
            const validFeature = geojson.features.find(f => f.geometry);

            if (!validFeature) {
                throw new Error('Nenhuma geometria válida (ponto, linha ou polígono) foi encontrada no arquivo KML.');
            }

            const payload = {
                name,
                description,
                geometry: validFeature.geometry,
            };

            const response = await fetch(`${API_BASE_URL}/api/reservoirs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Falha ao salvar reservatório.');
            }
            
            alert('Reservatório salvo com sucesso!');
            resetForm();
            onRefresh(); 

        } catch (err: any) {
            console.error("Erro ao submeter.", err);
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number, name: string) => {
        if (window.confirm(`Tem certeza que deseja excluir o reservatório "${name}"?`)) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/reservoirs/${id}`, {
                    method: 'DELETE',
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ detail: 'Falha ao excluir o reservatório.' }));
                    throw new Error(errData.detail);
                }
                
                alert('Reservatório excluído com sucesso!');
                onRefresh();

            } catch (err: any) {
                console.error("Erro ao excluir:", err);
                alert(err.message);
            }
        }
    };

    return (
        <div className="reservoir-sidebar">
            <header>
                <h2>Reservatórios</h2>
                <p>Gerencie e cadastre novas áreas.</p>
            </header>
            
            <input
                type="file"
                accept=".kml"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            {isFormVisible ? (
                <form onSubmit={handleSubmit} className="reservoir-form">
                    <h3>Novo Reservatório</h3>
                    <p>Arquivo: <strong>{kmlFile?.name}</strong></p>
                    <div className="form-group">
                        <label htmlFor="name">Nome</label>
                        <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="description">Descrição</label>
                        <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                    
                    {error && <p className="error-message">{error}</p>}
                    
                    <div className="form-actions">
                        <button type="button" onClick={resetForm} className="cancel-btn">Cancelar</button>
                        <button type="submit" disabled={isSubmitting} className="save-btn">
                            {isSubmitting ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </form>
            ) : (
                <button onClick={handleImportClick} className="import-btn">
                    + Cadastrar (Importar KML)
                </button>
            )}

            <div className="reservoir-list">
                <h3>Lista de Reservatórios</h3>
                <ul>
                    {reservoirs.map(r => (
                        // 2. ATUALIZAÇÃO: O <li> agora tem um evento de clique que chama a função do componente pai
                        <li key={r.properties?.id} onClick={() => onReservoirSelect(r)} title="Clique para ver no mapa">
                            <div className="reservoir-info">
                                <strong>{r.properties?.name}</strong>
                                <p>{r.properties?.description || 'Sem descrição'}</p>
                            </div>
                            <button 
                                className="delete-btn" 
                                // 3. ATUALIZAÇÃO: Adicionado stopPropagation para evitar que o clique no botão
                                // também acione o clique na <li>
                                onClick={(e) => { e.stopPropagation(); handleDelete(r.properties?.id, r.properties?.name); }}
                                title="Excluir reservatório"
                            >
                                &#x1F5D1;
                            </button>
                        </li>
                    ))}
                    {reservoirs.length === 0 && <p className="empty-list">Nenhum reservatório cadastrado.</p>}
                </ul>
            </div>
        </div>
    );
};

export default ReservoirSidebar;