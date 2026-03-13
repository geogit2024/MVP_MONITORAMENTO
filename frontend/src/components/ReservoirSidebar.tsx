import React, { useState, useRef } from 'react';
import { Feature } from 'geojson';
import togeojson from '@mapbox/togeojson';
import './ReservoirSidebar.css'; 

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// 1. ATUALIZAÃ‡ÃƒO: A interface de props agora inclui a funÃ§Ã£o 'onReservoirSelect'
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
            setError('Nome e arquivo KML sÃ£o obrigatÃ³rios.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const kmlText = await kmlFile.text();
            const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
            const geojson = togeojson.kml(dom);
            
            const validFeature = geojson.features.find((f: Feature) => f.geometry);

            if (!validFeature) {
                throw new Error('Nenhuma geometria vÃ¡lida (ponto, linha ou polÃ­gono) foi encontrada no arquivo KML.');
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
                throw new Error(errData.detail || 'Falha ao salvar reservatÃ³rio.');
            }
            
            alert('ReservatÃ³rio salvo com sucesso!');
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
        if (window.confirm(`Tem certeza que deseja excluir o reservatÃ³rio "${name}"?`)) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/reservoirs/${id}`, {
                    method: 'DELETE',
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({ detail: 'Falha ao excluir o reservatÃ³rio.' }));
                    throw new Error(errData.detail);
                }
                
                alert('ReservatÃ³rio excluÃ­do com sucesso!');
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
                <h2>ReservatÃ³rios</h2>
                <p>Gerencie e cadastre novas Ã¡reas.</p>
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
                    <h3>Novo ReservatÃ³rio</h3>
                    <p>Arquivo: <strong>{kmlFile?.name}</strong></p>
                    <div className="form-group">
                        <label htmlFor="name">Nome</label>
                        <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="description">DescriÃ§Ã£o</label>
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
                <h3>Lista de ReservatÃ³rios</h3>
                <ul>
                    {reservoirs.map(r => (
                        // 2. ATUALIZAÃ‡ÃƒO: O <li> agora tem um evento de clique que chama a funÃ§Ã£o do componente pai
                        <li key={r.properties?.id} onClick={() => onReservoirSelect(r)} title="Clique para ver no mapa">
                            <div className="reservoir-info">
                                <strong>{r.properties?.name}</strong>
                                <p>{r.properties?.description || 'Sem descriÃ§Ã£o'}</p>
                            </div>
                            <button 
                                className="delete-btn" 
                                // 3. ATUALIZAÃ‡ÃƒO: Adicionado stopPropagation para evitar que o clique no botÃ£o
                                // tambÃ©m acione o clique na <li>
                                onClick={(e) => { e.stopPropagation(); handleDelete(r.properties?.id, r.properties?.name); }}
                                title="Excluir reservatÃ³rio"
                            >
                                &#x1F5D1;
                            </button>
                        </li>
                    ))}
                    {reservoirs.length === 0 && <p className="empty-list">Nenhum reservatÃ³rio cadastrado.</p>}
                </ul>
            </div>
        </div>
    );
};

export default ReservoirSidebar;
