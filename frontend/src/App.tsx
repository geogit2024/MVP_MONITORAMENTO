import React, { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import MainApplication from './MainApplication';
import FieldAgentMobileApp from './mobile/field-agent/FieldAgentMobileApp';
import { MapModeProvider } from './modules/map3d/MapModeContext';
import FieldDispatchPage from './modules/field-dispatch/pages/FieldDispatchPage';
import FieldDispatchMonthlyReportPage from './modules/field-dispatch/pages/FieldDispatchMonthlyReportPage';
import FormTemplateEditorPage from './modules/field-dispatch/pages/FormTemplateEditorPage';
import FormTemplatesPage from './modules/field-dispatch/pages/FormTemplatesPage';
import LoginPage from './pages/LoginPage';
import MenuPage from './pages/MenuPage';
import PropertyRegistrationPage from './pages/PropertyRegistrationPage';
import ReservoirPanel from './pages/ReservoirPanel';

const ProtectedRoute = ({
  isAuthenticated,
  children,
}: {
  isAuthenticated: boolean;
  children: React.ReactElement;
}) => {
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    navigate('/menu');
  };

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />

      <Route
        path="/menu"
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <MenuPage />
          </ProtectedRoute>
        }
      />

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

      <Route
        path="/cadastro-propriedades"
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <PropertyRegistrationPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/reservatorios"
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <ReservoirPanel />
          </ProtectedRoute>
        }
      />

      <Route
        path="/field-dispatch"
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <FieldDispatchPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/field-dispatch/reports/monthly"
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <FieldDispatchMonthlyReportPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/field-dispatch/forms"
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <FormTemplatesPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/field-dispatch/forms/:templateId"
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <FormTemplateEditorPage />
          </ProtectedRoute>
        }
      />

      <Route path="/mobile/field-agent" element={<FieldAgentMobileApp />} />

      <Route path="*" element={<Navigate to={isAuthenticated ? '/menu' : '/login'} />} />
    </Routes>
  );
}
