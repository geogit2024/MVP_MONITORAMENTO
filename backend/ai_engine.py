import numpy as np
import json

class AgroEmbeddingEngine:
    """
    Motor de processamento geoespacial para geração de embeddings comportamentais.
    Transforma séries temporais e métricas NDVI em vetores para busca de similaridade.
    """
    
    @staticmethod
    def generate_embedding(ndvi_series, precipitation=None, temperature=None):
        """
        Gera um embedding normalizado (vetor) de dimensão fixa (16 dimensões para o POC).
        Captura: Tendência, Sazonalidade, Vigor Médio e Estabilidade.
        """
        series = np.array(ndvi_series)
        
        # 1. Features Temporais (12 pontos)
        # Normalização simples da série NDVI (0.0 a 1.0)
        norm_series = (series - 0.0) / 1.0 
        
        # 2. Features Estatísticas (4 pontos)
        mean_val = np.mean(series)
        std_val = np.std(series)
        max_val = np.max(series)
        min_val = np.min(series)
        
        # Concatenar em um vetor de 16 dimensões
        # Em um sistema real, aqui poderíamos usar um Autoencoder ou Transformer pré-treinado
        embedding = np.concatenate([
            norm_series, 
            [mean_val, std_val, max_val, min_val]
        ])
        
        # Normalização L2 para similaridade de cosseno eficiente
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
            
        return embedding.tolist()

    @staticmethod
    def calculate_similarity(vec1, vec2):
        """
        Calcula a similaridade de cosseno entre dois vetores.
        Como os vetores são normalizados L2, o produto escalar é a similaridade.
        """
        if not vec1 or not vec2:
            return 0.0
        v1 = np.array(vec1)
        v2 = np.array(vec2)
        return float(np.dot(v1, v2))

    @staticmethod
    def get_anomaly_report(current_vec, history_vecs, peer_vecs):
        """
        Determina o score de anomalia comparando com o histórico e com pares regionais.
        """
        # Similaridade contra o histórico próprio (Auto-Consistência)
        sim_history = 0.0
        if history_vecs:
            sim_history = max([AgroEmbeddingEngine.calculate_similarity(current_vec, h) for h in history_vecs])
            
        # Similaridade contra áreas similares (Consistência Regional)
        sim_peers = 0.0
        if peer_vecs:
            sim_peers = np.mean([AgroEmbeddingEngine.calculate_similarity(current_vec, p) for p in peer_vecs])
            
        # Score final (Inverse of best similarity)
        # Se for muito diferente de SI MESMO e muito diferente dos VIZINHOS, é uma anomalia forte.
        best_sim = max(sim_history, sim_peers)
        
        # Ajuste de threshold: similaridade > 0.95 é normal, < 0.85 é anômalo
        anomaly_score = max(0.0, 1.0 - best_sim)
        
        reason = "Comportamento esperado."
        if anomaly_score > 0.15:
            if sim_history < 0.85 and sim_peers > 0.90:
                reason = "Anomalia Local: O talhão diverge do seu próprio histórico, embora a região siga normal."
            elif sim_peers < 0.85 and sim_history > 0.90:
                reason = "Resiliência: Talhão mantém vigor superior à queda generalizada detectada na região."
            else:
                reason = "Anomalia Grave: Comportamento atípico não detectado no histórico ou em áreas vizinhas."

        return {
            "score": round(anomaly_score, 2),
            "reason": reason,
            "confidence": "Alta" if len(history_vecs) > 2 else "Média"
        }
