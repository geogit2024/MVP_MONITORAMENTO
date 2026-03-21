import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import MapLoader from '../components/MapLoader';
import '../index.css';
import { LogOut, Coins, ShieldCheck, Activity, BrainCircuit, Leaf, ArrowRight, Info } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Bar } from 'recharts';
import { AlertTriangle, PlusCircle, CloudRain, ThermometerSun, Droplets, Save, List, ToggleRight, ToggleLeft, Crosshair, Target, Trash2, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import booleanIntersects from '@turf/boolean-intersects';
import ReportExporter from '../components/ReportExporter';
import { motion } from 'framer-motion';


function Dashboard() {
  const [drawnArea, setDrawnArea] = useState(null);
  const [analysisQueueResults, setAnalysisQueueResults] = useState([]);
  const [currentResultPage, setCurrentResultPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [currentlyProcessingId, setCurrentlyProcessingId] = useState(null);
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [cameraFocusGeojson, setCameraFocusGeojson] = useState(null);
  const [error, setError] = useState(null);
  const [credits, setCredits] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [radarSettings, setRadarSettings] = useState({ radar_frequency: 'weekly', radar_time: '03:00', radar_email_alerts: true });
  const [savedAreas, setSavedAreas] = useState([]);
  const [historyViewArea, setHistoryViewArea] = useState(null);
  const [areaHistory, setAreaHistory] = useState([]);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState("");
  const navigate = useNavigate();

  const fetchAreas = async (token) => {
    try {
      const res = await axios.get('http://localhost:8000/api/areas', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSavedAreas(res.data);
    } catch(err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('saas_token');
        if(!token) throw new Error("No token");
        
        const res = await axios.get('http://localhost:8000/api/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCredits(res.data.credits);
      setIsAdmin(res.data.is_admin);
      setRadarSettings({
        radar_frequency: res.data.radar_frequency || 'weekly',
        radar_time: res.data.radar_time || '03:00',
        radar_email_alerts: res.data.radar_email_alerts !== undefined ? res.data.radar_email_alerts : true
      });
      fetchAreas(token);
      } catch(err) {
        localStorage.removeItem('saas_token');
        navigate('/login');
      }
    };
    fetchUser();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('saas_token');
    navigate('/login');
  };

  const handleAreaDrawn = (geojson) => {
    setDrawnArea(geojson);
    setError(null);
    setAnalysisQueueResults([]); 
  };

  const toggleSelection = (id) => {
    setSelectedAreas(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleBatchAnalyze = async () => {
    console.log("DEBUG: handleBatchAnalyze acionado. Áreas selecionadas:", selectedAreas);
    
    if (selectedAreas.length === 0) return;

    if (credits < selectedAreas.length) {
        setError(`Créditos Insuficientes: Você selecionou ${selectedAreas.length} áreas, mas possui apenas ${credits} créditos. Reduza a seleção ou adquira mais créditos.`);
        return;
    }
    
    if (credits <= 0) {
        setError("Seu saldo de processamento acabou. Entre em contato com o suporte para recarregar.");
        return;
    }
    
    setIsProcessingQueue(true);
    setError(null);
    let results = [];
    
    const token = localStorage.getItem('saas_token');
    
    for (let areaId of selectedAreas) {
      setCurrentlyProcessingId(areaId);
      const area = savedAreas.find(a => a.id === areaId);
      
      try {
        // Simulação de Progresso por Etapas para o Usuário (Feedback Visual)
        const steps = [
          { p: 15, s: "Autenticando com Earth Engine Clouds..." },
          { p: 35, s: `Filtrando Sentinel-2 (L2A) para ${area.name}...` },
          { p: 55, s: "Processando Hidrologia CHIRPS (Precipitação)..." },
          { p: 75, s: "Analisando Termodinâmica ERA5 (Clima)..." },
          { p: 90, s: "Gerando Modelo de Embeddings Biométricos..." }
        ];

        for (const step of steps) {
            setProgress(step.p);
            setProgressStep(step.s);
            await new Promise(resolve => setTimeout(resolve, 800)); // Delay curto para cada step
        }

        let parsedGeojson;
        try {
          parsedGeojson = typeof area.geojson_data === 'string' ? JSON.parse(area.geojson_data) : area.geojson_data;
        } catch (parseErr) {
          results.push({ areaName: area.name, areaId: area.id, error: "GeoJSON inválido nesta área.", success: false });
          continue;
        }

        const response = await axios.post('http://localhost:8000/api/analyze-ndvi', {
          area_id: area.id,
          geojson: parsedGeojson
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        setProgress(100);
        setProgressStep("Análise Finalizada com Sucesso!");
        await new Promise(resolve => setTimeout(resolve, 500)); 

        results.push({ areaName: area.name, areaId: area.id, data: response.data, success: true });
        setCredits(prev => prev - 1);
      } catch (err) {
        console.error("Erro na API para " + area.name, err);
        results.push({ areaName: area.name, areaId: area.id, error: err.response?.data?.detail || "Erro", success: false });
      } finally {
        setProgress(0);
        setProgressStep("");
      }
    }
    
    setAnalysisQueueResults(results);
    setCurrentResultPage(0);
    setIsProcessingQueue(false);
    setCurrentlyProcessingId(null);
    setSelectedAreas([]); // clear selection after processing
  };

  const handleSaveArea = async () => {
    if (!drawnArea) return;
    
    // Validar Sobreposição com Geometrias Salvas (TurfJS)
    let overlappingArea = null;
    for (let area of savedAreas) {
        try {
            const savedGeo = JSON.parse(area.geojson_data);
            if (booleanIntersects(drawnArea, savedGeo)) {
                overlappingArea = area;
                break;
            }
        } catch (e) {
            console.error("Erro no parse do GeoJSON antigo", e);
        }
    }

    let isReplacing = false;
    let finalName = "Novo Talhão";

    if (overlappingArea) {
        const confirmReplace = window.confirm(
            `Atenção! Esta nova demarcação sobrepõe parcialmente o seu talhão já cadastrado: "${overlappingArea.name}".\n\nDeseja substituir a área antiga por este novo desenho espacial?`
        );
        if (!confirmReplace) {
             return; // cancela operação se usuário recusou
        }
        isReplacing = true;
        finalName = overlappingArea.name;
    } else {
        const areaName = prompt("Dê um nome para este Talhão Isolado (ex: Fazenda Sul):", "Novo Talhão");
        if (!areaName) return; // cancelou o prompt
        finalName = areaName;
    }

    try {
      const token = localStorage.getItem('saas_token');

      // Se replacing for true, exclua o anterior antes de adicionar o novo
      if (isReplacing && overlappingArea) {
           await axios.delete(`http://localhost:8000/api/areas/${overlappingArea.id}`, {
               headers: { Authorization: `Bearer ${token}` }
           });
      }

      await axios.post('http://localhost:8000/api/areas', {
        name: finalName,
        geojson_data: JSON.stringify(drawnArea)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(isReplacing ? "Área atualizada com sucesso!" : "Fazenda mapeada! Acesse a lista lateral para engatilhar as Filas de Processamento.");
      setDrawnArea(null);
      setAnalysisQueueResults([]);
      fetchAreas(token);
    } catch(err) {
      alert("Erro ao inserir área no banco de dados.");
    }
  };

  const handleBatchSchedule = async (turnOn) => {
    if (selectedAreas.length === 0) return;
    const token = localStorage.getItem('saas_token');
    
    try {
      for (let areaId of selectedAreas) {
          await axios.put(`http://localhost:8000/api/areas/${areaId}/monitor`, {
              is_monitoring: turnOn
          }, {
              headers: { Authorization: `Bearer ${token}` }
          });
      }
      fetchAreas(token);
      setSelectedAreas([]);
      alert(`Agendamento Automático ${turnOn ? 'ativado' : 'pausado'} para as áreas selecionadas!`);
    } catch (err) {
      alert("Erro ao aplicar lote de monitoramento.");
    }
  };

  const handleBatchDelete = async () => {
    if (selectedAreas.length === 0) return;
    if (!window.confirm(`Tem certeza que deseja apagar ${selectedAreas.length} talhão(ões) permanentemente do seu histórico?`)) return;

    const token = localStorage.getItem('saas_token');
    try {
      for (let areaId of selectedAreas) {
          await axios.delete(`http://localhost:8000/api/areas/${areaId}`, {
              headers: { Authorization: `Bearer ${token}` }
          });
      }
      fetchAreas(token);
      setSelectedAreas([]);
      alert("Propriedades excluídas com sucesso do banco de dados.");
    } catch (err) {
      alert("Erro na exclusão em lote.");
    }
  };

  const handleSaveSettings = async () => {
    try {
        const token = localStorage.getItem('saas_token');
        await axios.put('http://localhost:8000/api/me/settings', radarSettings, {
            headers: { Authorization: `Bearer ${token}` }
        });
        alert("Automação do Sistema atualizada com sucesso!");
        setShowSettings(false);
    } catch(e) {
        alert("Erro ao salvar opções do motor.");
    }
  };

  const handleViewHistory = async (areaId) => {
    try {
        const token = localStorage.getItem('saas_token');
        const res = await axios.get(`http://localhost:8000/api/areas/${areaId}/history`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setAreaHistory(res.data);
        setHistoryViewArea(savedAreas.find(a => a.id === areaId));
        setAnalysisQueueResults([]); // Limpa fila atual se estiver vendo histórico
    } catch (err) {
        alert("Erro ao buscar histórico desta área.");
    }
  };

  const handleDeleteHistoryItem = async (historyId, areaId) => {
    if (!window.confirm("Deseja realmente excluir este laudo permanente do histórico?")) return;
    try {
        const token = localStorage.getItem('saas_token');
        await axios.delete(`http://localhost:8000/api/history/${historyId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        // Atualiza a lista após exclusão
        const res = await axios.get(`http://localhost:8000/api/areas/${areaId}/history`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setAreaHistory(res.data);
    } catch (err) {
        alert("Erro ao excluir registro.");
    }
  };

  const loadHistoryItem = (item) => {
    const data = JSON.parse(item.chart_data_json);
    setAnalysisQueueResults([{
        areaName: historyViewArea.name,
        areaId: historyViewArea.id,
        data: {
            chartData: data.chartData,
            events: data.events,
            aiReport: item.report_text,
            anomaly: data.anomaly_score !== undefined ? {
                score: data.anomaly_score,
                reason: data.anomaly_reason,
                confidence: data.anomaly_confidence
            } : null,
            success: true
        },
        success: true
    }]);
    setCurrentResultPage(0);
  };


  return (
    <div className="relative h-screen w-full font-sans">
      {/* Container Principal do Mapa */}
      <div id="main-map" className="absolute inset-0 z-0 pointer-events-auto">
        <MapLoader 
            geojson={drawnArea || analysisQueueResults[currentResultPage]?.data?.geojson} 
            cameraFocusGeojson={cameraFocusGeojson}
            onAreaDrawn={handleAreaDrawn} 
            savedAreas={savedAreas} 
        />
      </div>

      {/* Interface Sobreposta (Glassmorphism Sidebar) */}
      <div className="absolute inset-0 z-10 pointer-events-none p-4 flex">
        
        {/* Sidebar de Controle (Painel Principal) - Agora Arrastável */}
        <motion.div 
          drag
          dragMomentum={false}
          data-html2canvas-ignore="true"
          className="absolute top-8 left-8 w-[500px] max-h-[85vh] glass-panel rounded-2xl flex flex-col z-10 overflow-y-auto pr-1 custom-scrollbar shadow-2xl pointer-events-auto"
        >
        {/* Header */}
        <div className="p-8 border-b border-gray-700/50 shrink-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <Leaf className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight xl:text-xl">AgroSentinel IA</h1>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setShowSettings(true)} className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg text-emerald-400 transition-colors" title="Ajustes do Motor IA">
                    <Settings size={18} />
                </button>
                {isAdmin && (
                  <Link to="/admin" className="p-2 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg text-purple-400 transition-colors" title="Acessar Administrador">
                      <ShieldCheck size={18} />
                  </Link>
                )}
                <button onClick={handleLogout} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors" title="Sair da Conta">
                    <LogOut size={18} />
                </button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium py-2 px-3 rounded-lg w-max">
            <Coins size={16} /> 
            Saldo Atual: {credits !== null ? credits : '...'} Processamentos
          </div>
        </div>
        
        {/* Painel de Controle */}
        <div className="p-8 flex-grow flex flex-col min-h-0">
          <div className="mb-8">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Ação Principal</h2>
            
            {drawnArea && analysisQueueResults.length === 0 ? (
              <div className="flex flex-col h-full gap-4">
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-emerald-600/50 rounded-xl bg-emerald-900/20 shrink-0">
                  <div className="text-emerald-400 mb-4 p-3 bg-emerald-500/20 rounded-full">
                    <Save size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Talhão Demarcado!</h3>
                  <p className="text-sm text-emerald-200/70 text-center mb-6">
                    A área foi mapeada pelas coordenadas no Leaflet. Ela está pronta para ser salva na nuvem.
                  </p>
                  
                  <button onClick={handleSaveArea} disabled={isLoading} className="w-full py-4 px-6 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg hover:shadow-emerald-500/25">
                      <Save size={18}/> Cadastrar Talhão no Sistema
                  </button>
                  <button onClick={() => setDrawnArea(null)} className="mt-4 text-xs font-semibold text-slate-500 hover:text-white uppercase tracking-wider transition-colors">
                      Cancelar Edição Vetorial
                  </button>
                </div>
              </div>
            ) : analysisQueueResults.length === 0 && !historyViewArea ? (
              <div className="flex flex-col h-full gap-4">
                {/* Lista de Talhões */}
                <div className="flex flex-col flex-1 min-h-0">
                   <div className="flex items-center justify-between mb-3 shrink-0">
                     <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                       <List size={16} /> Meus Talhões Cadastrados
                     </h3>
                     {selectedAreas.length > 0 && (
                       <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">
                         {selectedAreas.length} Selecionados
                       </span>
                     )}
                   </div>

                   <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
                     {savedAreas.length === 0 ? (
                         <div className="flex flex-col items-center justify-center p-6 border border-slate-700/50 rounded-xl bg-slate-800/20 h-32">
                             <p className="text-sm text-slate-400 text-center mb-1">Inventário Vazio.</p>
                             <p className="text-xs text-slate-500 text-center">Desenhe no mapa para começar.</p>
                         </div>
                     ) : (
                         <div className="flex flex-col gap-2 pb-2">
                           {savedAreas.map(area => (
                             <div key={area.id} className={`p-4 border rounded-xl flex justify-between items-center group transition-colors ${selectedAreas.includes(area.id) ? 'bg-slate-700/80 border-emerald-500/50' : 'bg-slate-800/60 border-slate-700/50 hover:bg-slate-700/50'}`}>
                                <div className="flex items-center gap-3">
                                   <div onClick={() => toggleSelection(area.id)} className={`flex items-center justify-center w-5 h-5 rounded border transition-colors cursor-pointer ${selectedAreas.includes(area.id) ? 'bg-emerald-500 border-emerald-400' : 'border-slate-600 bg-slate-800'}`}>
                                      {selectedAreas.includes(area.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                   </div>
                                   <div className="cursor-pointer group/nav flex items-center gap-2" onClick={() => { try { setCameraFocusGeojson(JSON.parse(area.geojson_data)); } catch(e){} }}>
                                     <div>
                                       <p className="text-sm font-bold text-slate-200 group-hover/nav:text-emerald-400 transition-colors flex items-center gap-1.5">{area.name} <Target size={12} className="opacity-0 group-hover/nav:opacity-100 transition-opacity"/></p>
                                       <p className="text-[10px] text-slate-500 mt-0.5">Adicionado: {new Date(area.created_at).toLocaleDateString()}</p>
                                     </div>
                                   </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  {isProcessingQueue && currentlyProcessingId === area.id ? (
                                    <span className="text-[10px] text-blue-400 font-bold animate-pulse flex items-center gap-1 uppercase tracking-wider"><Activity size={10}/> Processando...</span>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleViewHistory(area.id)} className="p-1.5 bg-slate-700/50 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 rounded-lg transition-all" title="Ver Histórico">
                                            <ShieldCheck size={14} />
                                        </button>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${area.is_monitoring ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                                            {area.is_monitoring ? 'Radar ON' : 'Radar OFF'}
                                        </span>
                                    </div>
                                  )}
                                </div>
                             </div>
                           ))}
                         </div>
                     )}
                   </div>

                   {/* Ações em Lote */}
                   <div className={`mt-auto pt-4 flex flex-col gap-2 border-t border-slate-700/50 shrink-0 transition-opacity duration-300 ${selectedAreas.length > 0 || isProcessingQueue ? 'opacity-100 pointer-events-auto' : 'opacity-50 pointer-events-none'}`}>
                      {isProcessingQueue && (
                        <div className="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                           <div className="flex justify-between items-end mb-2">
                              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest animate-pulse">{progressStep}</span>
                              <span className="text-xs font-black text-white">{progress}%</span>
                           </div>
                           <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden p-[1px] border border-white/5">
                              <div 
                                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                                style={{ width: `${progress}%` }}
                              />
                           </div>
                        </div>
                      )}

                      <button onClick={handleBatchAnalyze} disabled={isProcessingQueue || selectedAreas.length === 0} className="w-full py-3.5 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg hover:shadow-blue-500/25">
                         {isProcessingQueue ? (
                           <><svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Executando Fila...</>
                         ) : 'Processar em Lote (Analisar NDVI)'}
                      </button>
                      <div className="flex gap-2">
                         <button onClick={() => handleBatchSchedule(true)} disabled={isProcessingQueue} className="flex-1 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] sm:text-[11px] font-bold rounded-xl border border-emerald-500/30 transition-colors uppercase flex justify-center items-center gap-2">
                            <ToggleRight size={14}/> Ligar
                         </button>
                         <button onClick={() => handleBatchSchedule(false)} disabled={isProcessingQueue} className="flex-1 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-[10px] sm:text-[11px] font-bold rounded-xl border border-slate-600 transition-colors uppercase flex justify-center items-center gap-2">
                            <ToggleLeft size={14}/> Pausar
                         </button>
                         <button onClick={handleBatchDelete} disabled={isProcessingQueue} className="flex-[0.5] py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] sm:text-[11px] font-bold rounded-xl border border-red-500/30 transition-colors uppercase flex justify-center items-center gap-2" title="Apagar Talhões">
                            <Trash2 size={16}/>
                         </button>
                      </div>
                   </div>
                </div>
              </div>
            ) : null}
            
            {error && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300">
                <strong className="block mb-1">Ops, aviso de processamento:</strong> {error}
              </div>
            )}

            {historyViewArea && analysisQueueResults.length === 0 && (
                <div className="mt-6 animate-in fade-in slide-in-from-left-4 duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                            <ShieldCheck size={16} /> Histórico: {historyViewArea.name}
                        </h3>
                        <button onClick={() => setHistoryViewArea(null)} className="text-[10px] text-slate-500 hover:text-white uppercase font-bold tracking-widest">Fechar</button>
                    </div>
                    
                    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {areaHistory.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-4 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">Nenhum laudo encontrado para este talhão.</p>
                        ) : (
                            areaHistory.map(item => {
                                const chartData = item.chart_data_json ? JSON.parse(item.chart_data_json) : {};
                                const isAnomalous = chartData.anomaly_score > 0.15;
                                return (
                                    <div key={item.id} className="p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl hover:bg-slate-700/50 transition-all group relative border-l-2 border-l-transparent hover:border-l-emerald-500">
                                        <div className="flex justify-between items-start mb-2">
                                            <div onClick={() => loadHistoryItem(item)} className="flex flex-col cursor-pointer flex-1">
                                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                                                <span className="text-[9px] text-slate-500 font-bold">{new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border flex items-center gap-1 ${isAnomalous ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                                    <div className={`w-1 h-1 rounded-full ${isAnomalous ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                                                    {isAnomalous ? 'ANOMALIA' : 'NORMAL'}
                                                </span>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteHistoryItem(item.id, item.area_id); }} className="p-1 text-slate-600 hover:text-red-500 transition-colors rounded-md hover:bg-red-500/10">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                        <div onClick={() => loadHistoryItem(item)} className="cursor-pointer">
                                            <p className="text-[10px] text-slate-400 line-clamp-1 italic opacity-70 group-hover:opacity-100 transition-opacity">
                                                {item.report_text.replace(/### |[*]/g, '').substring(0, 50)}...
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
          </div>

          {/* Área do Gráfico e Laudo (Substitui botão se concluído) */}
          {analysisQueueResults.length > 0 && analysisQueueResults[currentResultPage] && !drawnArea && (
            <div className="flex-1 min-h-0 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto pr-2 custom-scrollbar">
              
              {/* Pagination Header */}
              <div className="bg-slate-800/80 border border-slate-600/30 rounded-2xl p-3 flex justify-between items-center shrink-0 shadow-md">
                <button onClick={() => setCurrentResultPage(p => Math.max(0, p - 1))} disabled={currentResultPage === 0} className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-white disabled:opacity-30 transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                
                <div className="text-center flex-1 px-4">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">Laudo {currentResultPage + 1} de {analysisQueueResults.length}</p>
                  <p className="text-sm text-emerald-400 font-bold truncate">{analysisQueueResults[currentResultPage].areaName}</p>
                </div>

                <button onClick={() => setCurrentResultPage(p => Math.min(analysisQueueResults.length - 1, p + 1))} disabled={currentResultPage === analysisQueueResults.length - 1} className="p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-white disabled:opacity-30 transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
              </div>

              {analysisQueueResults[currentResultPage].error || !analysisQueueResults[currentResultPage].success ? (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
                   Ops, falha ao processar a fazenda "{analysisQueueResults[currentResultPage].areaName}". {analysisQueueResults[currentResultPage].error}
                </div>
              ) : (
                <>
                  <div id="ndvi-chart-v4" className="bg-black/40 border border-white/5 rounded-2xl p-4 shrink-0 overflow-visible">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                          <Activity className="w-4 h-4" /> Série Histórica NDVI (Comparativo da Safra)
                        </h3>
                        <div className="group relative">
                          <Info size={14} className="text-slate-500 hover:text-emerald-400 cursor-help transition-colors" />
                          <div className="absolute top-0 right-6 w-64 p-3 bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-[10px] sm:text-xs text-slate-300 leading-relaxed pointer-events-none">
                            <p className="mb-2"><strong className="text-emerald-400">Safra Anterior (Pontilhada):</strong> Benchmark agronômico funcional baseado em curvas históricas de referência.</p>
                            <p><strong className="text-emerald-400">Safra Atual (Contínua):</strong> Dados reais processados pela IA via Radar, refletindo anomalias climáticas ou fitossanitárias.</p>
                          </div>
                        </div>
                      </div>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={analysisQueueResults[currentResultPage].data?.chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
                            <XAxis dataKey="date" stroke="#ffffff50" fontSize={11} tickMargin={8} />
                            <YAxis stroke="#ffffff50" fontSize={11} domain={[0, 1]} tickCount={5} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px' }} />
                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                            <Line type="monotone" dataKey="ndvi_atual" name="Safra Atual" stroke="#34d399" strokeWidth={3} dot={{ r: 3, fill: '#34d399', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                            <Line type="monotone" dataKey="ndvi_anterior" name="Safra Anterior" stroke="#60a5fa" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 3, fill: '#60a5fa', strokeWidth: 0 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                  </div>

                  {/* Anomaly Score Display (Destaque Topo) */}
                  {analysisQueueResults[currentResultPage].data?.anomaly && (
                    <div id="anomaly-engine-v4" className="bg-[#0f172a]/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-5 mb-4 border-l-4 border-l-emerald-500 shadow-xl animate-in fade-in slide-in-from-right-4 duration-700">
                      <div className="flex flex-col gap-4">
                        {/* Header Section */}
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <BrainCircuit className="w-4 h-4 text-emerald-400" />
                              <h4 className="text-[10px] font-black text-slate-100 uppercase tracking-[0.2em]">Motor de Anomalia v2</h4>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium">Análise de Similaridade Vetorial e Regional</p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                             <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold tracking-tight uppercase">AI BIOMETRIC ACTIVE</span>
                             <div className="flex items-center gap-1.5">
                               <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${analysisQueueResults[currentResultPage].data.anomaly.score > 0.15 ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                               <span className="text-[9px] text-slate-400 font-bold uppercase">Status: Nominal</span>
                             </div>
                          </div>
                        </div>

                        {/* Gauge Section */}
                        <div className="flex items-center gap-5 bg-slate-900/40 p-3 rounded-xl border border-white/5">
                          <div className="flex-1">
                            <div className="flex justify-between items-end mb-1.5">
                               <span className="text-[9px] text-slate-500 font-bold uppercase">Desvio de Comportamento</span>
                               <span className={`text-base font-black leading-none ${analysisQueueResults[currentResultPage].data.anomaly.score > 0.15 ? 'text-red-400' : 'text-emerald-400'}`}>
                                 {Math.round(analysisQueueResults[currentResultPage].data.anomaly.score * 100)}%
                               </span>
                            </div>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden p-[1px]">
                              <div 
                                className={`h-full rounded-full transition-all duration-1000 ${
                                  analysisQueueResults[currentResultPage].data.anomaly.score > 0.15 ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                                }`}
                                style={{ width: `${Math.max(5, analysisQueueResults[currentResultPage].data.anomaly.score * 100)}%` }}
                              />
                            </div>
                          </div>
                          <div className="w-px h-10 bg-slate-700/50"></div>
                          <div className="flex flex-col">
                             <span className="text-[8px] text-slate-500 font-bold uppercase">Confiança</span>
                             <span className="text-xs font-bold text-slate-200">{analysisQueueResults[currentResultPage].data.anomaly.confidence}</span>
                          </div>
                        </div>

                        {/* Reason Section */}
                        <div className="flex gap-3 items-start">
                           <div className="p-1.5 bg-slate-900 rounded-lg border border-white/5 shrink-0">
                              <Info size={12} className="text-slate-500" />
                           </div>
                           <p className="text-[10px] text-slate-300 italic leading-snug flex-1">
                             {analysisQueueResults[currentResultPage].data.anomaly.reason}
                           </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Eventos Detectados / Alertas Visuais */}
                  {analysisQueueResults[currentResultPage].data?.events && analysisQueueResults[currentResultPage].data.events.length > 0 && (
                    <div className="flex flex-col gap-3 shrink-0">
                       {analysisQueueResults[currentResultPage].data.events.map((ev, idx) => (
                         <div key={idx} className={`p-4 rounded-xl border flex gap-3 items-start animate-in fade-in slide-in-from-top-2 duration-500 shadow-lg ${ev.type === 'danger' ? 'bg-red-500/10 border-red-500/20 text-red-200' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'}`}>
                            <div className={`p-2 rounded-lg mt-0.5 shrink-0 shadow-inner ${ev.type === 'danger' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                               {ev.type === 'danger' ? <ThermometerSun size={18} /> : <CloudRain size={18} />}
                            </div>
                            <div>
                              <p className="text-sm font-bold flex items-center gap-2">{ev.title} <span className="text-xs font-normal opacity-70">({ev.date})</span></p>
                              <p className="text-xs mt-1 opacity-90 leading-relaxed">{ev.desc}</p>
                            </div>
                         </div>
                       ))}
                    </div>
                  )}

                  {/* Gráfico Climático CHIRPS (Secundário) */}
                  <div id="climate-chart-v4" className="bg-slate-800/80 border border-slate-600/30 rounded-2xl p-4 shrink-0 shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                         <CloudRain size={100} />
                      </div>
                      <h3 className="text-sm font-semibold text-blue-300 mb-4 flex items-center gap-2">
                        <CloudRain className="w-4 h-4" /> Distribuição Climática & Pluviometria
                      </h3>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={analysisQueueResults[currentResultPage].data?.chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis dataKey="date" stroke="#ffffff50" fontSize={11} tickMargin={8} />
                            <YAxis yAxisId="left" stroke="#3b82f6" fontSize={11} orientation="left" />
                            <YAxis yAxisId="right" stroke="#f59e0b" fontSize={11} orientation="right" />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                            <Bar yAxisId="left" dataKey="precipitation" name="Chuva Acum. (mm)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                            <Line yAxisId="right" type="monotone" dataKey="temperature" name="Temp Média (°C)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2, fill: '#f59e0b', strokeWidth: 0 }} />
                            <Line yAxisId="left" type="monotone" dataKey="soil_moisture" name="Umidade Solo (%)" stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                  </div>
                  

                  <div className="bg-blue-900/10 border border-blue-500/20 rounded-2xl p-5 shrink-0">
                      <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4" /> Laudo do Especialista IA
                      </h3>
                      <div className="text-sm text-slate-300 leading-relaxed prose prose-invert prose-p:mb-2 prose-strong:text-white max-w-none">
                         <ReactMarkdown>{analysisQueueResults[currentResultPage].data?.aiReport}</ReactMarkdown>
                      </div>
                  </div>
                </>
              )}

              {/* Botão de Exportação PDF Profissional */}
              {analysisQueueResults[currentResultPage]?.success && (
                <div className="my-2 shrink-0">
                  <ReportExporter
                    result={analysisQueueResults[currentResultPage]}
                    areaName={analysisQueueResults[currentResultPage]?.areaName}
                  />
                </div>
              )}

              <button 
                onClick={() => { setAnalysisQueueResults([]); setCurrentResultPage(0); setHistoryViewArea(null); }} 
                className="w-full mt-2 py-3.5 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl border border-white/10 transition-colors shrink-0 flex items-center justify-center gap-2 pointer-events-auto"
              >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg> Fechar Fila de Relatórios
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>

      {/* Interface Sobreposta Adicional (Modais) */}
      <div className="absolute inset-0 z-[100] pointer-events-none">
        {showSettings && (
           <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
             <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                  <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-3"><Settings size={24} className="text-emerald-400"/> Cron Job Automático</h3>
                  <p className="text-sm text-slate-400 mb-6 leading-relaxed">Configure com precisão as periodicidades do <strong>Satélite AI Sentinel</strong> varrendo todas as suas propriedades com radares ativados.</p>
                  
                  <div className="flex flex-col gap-5">
                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Frequência de Processamento</label>
                          <select 
                            className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3.5 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all cursor-pointer"
                            value={radarSettings.radar_frequency}
                            onChange={(e) => setRadarSettings({...radarSettings, radar_frequency: e.target.value})}
                          >
                             <option value="daily">Varredura Diária</option>
                             <option value="weekly">Semanal (Recomendado)</option>
                             <option value="biweekly">Quinzenal</option>
                             <option value="monthly">Exame Mensal Pleno</option>
                          </select>
                      </div>
                      
                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Horário (Fuso de Brasília GMT-3)</label>
                          <input 
                            type="time" 
                            className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3.5 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all cursor-pointer"
                            value={radarSettings.radar_time}
                            onChange={(e) => setRadarSettings({...radarSettings, radar_time: e.target.value})}
                          />
                      </div>
                      
                      <div className="flex items-center justify-between gap-3 mt-2 bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 cursor-pointer hover:bg-slate-800/60 transition-colors" onClick={() => setRadarSettings({...radarSettings, radar_email_alerts: !radarSettings.radar_email_alerts})}>
                          <div>
                            <p className="text-sm font-bold text-slate-200">Alertas de Urgência no E-mail</p>
                            <p className="text-xs text-slate-400 mt-0.5">Notificação em caso de pragas ou veranicos.</p>
                          </div>
                          <div className={`w-11 h-6 rounded-full transition-colors relative ${radarSettings.radar_email_alerts ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                             <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${radarSettings.radar_email_alerts ? 'translate-x-5' : 'translate-x-0'}`}></div>
                          </div>
                      </div>
                  </div>
                  
                  <div className="flex gap-3 mt-8">
                     <button onClick={() => setShowSettings(false)} className="flex-1 py-3.5 text-sm font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700">Cancelar</button>
                     <button onClick={handleSaveSettings} className="flex-1 py-3.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-95">Salvar Novo Motor</button>
                  </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
