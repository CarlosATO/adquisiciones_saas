import React from 'react';
import { NavLink } from 'react-router-dom';
import { Grip, User, Settings } from 'lucide-react';

const MainLayout = ({ children }) => {
  const navigation = [
    { name: 'Dashboard', href: '/' },
    { name: 'Proveedores', href: '/proveedores' },
    { name: 'Órdenes de Compra', href: '/ordenes' },
    { name: 'Recepción', href: '/recepcion' },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-800">
      
      {/* Top Bar (Global Shell) */}
      <header className="flex h-14 shrink-0 items-center justify-between bg-slate-900 px-4 text-white">
        {/* Lado Izquierdo */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => window.location.href = 'http://localhost:3000/portal'}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            title="Volver al Portal"
          >
            <Grip className="h-5 w-5" />
          </button>
          <div className="h-4 w-px bg-slate-700"></div>
          <span className="text-sm font-semibold tracking-wide">
            Datix <span className="font-light opacity-70">| Adquisiciones</span>
          </span>
        </div>

        {/* Lado Derecho */}
        <div className="flex items-center gap-3">
            <button className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
                <Settings className="h-4 w-4" />
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors ring-1 ring-slate-700">
                <User className="h-4 w-4" />
            </button>
        </div>
      </header>

      {/* Sub-Nav Bar (Menú del Módulo) */}
      <nav className="flex h-12 shrink-0 items-center gap-6 border-b border-slate-200 bg-white px-6 text-sm font-medium">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/'} // Para que '/' no coincida con '/proveedores'
            className={({ isActive }) =>
              `flex h-full items-center border-b-2 transition-colors ${
                isActive
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-indigo-600'
              }`
            }
          >
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Área de Contenido */}
      <main className="flex-1 overflow-auto bg-slate-50 p-6">
        {children}
      </main>
      
    </div>
  );
};

export default MainLayout;
