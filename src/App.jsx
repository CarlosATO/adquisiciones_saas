import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './api/supabaseClient'

const PrivateRoute = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  
  const [isProcessingToken, setIsProcessingToken] = useState(
    window.location.hash.includes('access_token')
  );

  useEffect(() => {
    const processToken = async () => {
      if (isProcessingToken) {
        try {
          const hash = window.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        } catch (err) {
          console.error("Error en SSO:", err);
        } finally {
          setIsProcessingToken(false);
          checkAuth();
        }
      } else {
        checkAuth();
      }
    };
    processToken();
  }, [isProcessingToken]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
    setLoading(false);
  };

  if (loading || isProcessingToken) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-500 font-bold text-sm uppercase tracking-widest">Verificando credenciales...</p>
      </div>
    );
  }

  if (!session) {
      window.location.href = 'http://localhost:3000/login';
      return null;
  }

  return children;
};

// Componentes Dummy para rutas no construidas
const DashboardAdquisiciones = () => (
  <div className="p-8">
    <h1 className="text-3xl font-bold text-slate-800">Datix Adquisiciones</h1>
    <p className="text-slate-600 mt-2">Bienvenido al módulo de compras.</p>
  </div>
);

import MainLayout from './layouts/MainLayout';
import Productos from './pages/Productos';
import Proveedores from './pages/Proveedores';
import OrdenesCompra from './pages/OrdenesCompra';
import Facturacion from './pages/Facturacion';
import CuentasPorPagar from './pages/CuentasPorPagar';
import CostosDestino from './pages/CostosDestino';
import AdquisicionesDashboard from './pages/AdquisicionesDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PrivateRoute><MainLayout><AdquisicionesDashboard /></MainLayout></PrivateRoute>} />
        <Route path="/dashboard-compras" element={<PrivateRoute><MainLayout><AdquisicionesDashboard /></MainLayout></PrivateRoute>} />
        <Route path="/productos" element={<PrivateRoute><MainLayout><Productos /></MainLayout></PrivateRoute>} />
        <Route path="/proveedores" element={<PrivateRoute><MainLayout><Proveedores /></MainLayout></PrivateRoute>} />
        <Route path="/ordenes" element={<PrivateRoute><MainLayout><OrdenesCompra /></MainLayout></PrivateRoute>} />
        <Route path="/recepcion" element={<Navigate to="/ordenes" replace />} />
        <Route path="/facturacion" element={<PrivateRoute><MainLayout><Facturacion /></MainLayout></PrivateRoute>} />
        <Route path="/cuentas-por-pagar" element={<PrivateRoute><MainLayout><CuentasPorPagar /></MainLayout></PrivateRoute>} />
        <Route path="/costos-destino" element={<PrivateRoute><MainLayout><CostosDestino /></MainLayout></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App;
