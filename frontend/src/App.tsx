// src/App.tsx

import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import MenuPage from './pages/MenuPage';
import MainApplication from './MainApplication';
import PropertyRegistrationPage from './pages/PropertyRegistrationPage';
import ReservoirPanel from './pages/ReservoirPanel';
import { MapModeProvider } from './modules/map3d/MapModeContext';

/**
 * Componente de Rota Protegida.
 * Se o utilizador estiver autenticado, mostra a página que está a proteger.
 * Senão, redireciona para a página de login.
 */
const ProtectedRoute = ({ isAuthenticated, children }: { isAuthenticated: boolean, children: JSX.Element }) => {
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

/**
 * Componente principal que gere as rotas da aplicação.
 * O hook useNavigate é usado aqui, e este componente será envolvido
 * pelo BrowserRouter no ficheiro main.tsx.
 */
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  // Esta função é passada para a LoginPage e chamada quando o login tem sucesso.
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    navigate('/menu'); // Navega para a página de menu após o login
  };

  return (
    <Routes>
      {/* Rota pública para a página de Login */}
      <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />
      
      {/* Rota protegida para a página de Menu */}
      <Route 
        path="/menu" 
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <MenuPage />
          </ProtectedRoute>
        } 
      />
      
      {/* Rota protegida para a aplicação principal de monitoramento */}
      <Route 
        path="/monitoramento" 
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <MapModeProvider>
              <MainApplication />
            </MapModeProvider>
          </ProtectedRoute>
        }
      />

      {/* Rota protegida para a página de Cadastro de Propriedades */}
      <Route 
        path="/cadastro-propriedades" 
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <PropertyRegistrationPage />
          </ProtectedRoute>
        }
      />
      
      {/* ✅ NOVO: Rota protegida para o Painel de Reservatórios */}
      <Route 
        path="/reservatorios" 
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <ReservoirPanel />
          </ProtectedRoute>
        }
      />

      {/* Rota de fallback: redireciona para o menu se estiver logado, ou para o login se não estiver. */}
      <Route path="*" element={<Navigate to={isAuthenticated ? "/menu" : "/login"} />} />
    </Routes>
  );
}
