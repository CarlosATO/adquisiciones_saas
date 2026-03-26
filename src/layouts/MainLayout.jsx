import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../api/supabaseClient';

// Icons
import {
    LayoutDashboard,
    Package,
    Users,
    Truck,
    ClipboardList,
    LogOut,
    Grip,
    Bell,
    HelpCircle,
    PackageCheck,
    Receipt,
    CreditCard,
    Anchor,
    CheckSquare,
    Settings
} from 'lucide-react';

const BRAND_PRIMARY = '#4C3073';

const buildRibbonTabs = (userRole, moduleRoles) => {
    const isManager = userRole === 'OWNER' || userRole === 'MANAGER' || moduleRoles?.ADQUISICIONES === 'MANAGER';
    const tabs = [];
    
    // Module 1: Inicio / Dashboard
    // Persistente para todos los usuarios autenticados
    tabs.push({
        id: 'inicio',
        label: 'Inicio',
        icon: LayoutDashboard,
        items: [
            { to: '/dashboard-compras', label: 'Tablero', icon: LayoutDashboard },
        ],
    });

    // Module 2: Adquisiciones (Local)
    // Sin discriminación de roles en este módulo
    const items = [
        { to: '/productos', label: 'Productos', icon: Package },
        { to: '/proveedores', label: 'Proveedores', icon: Users },
        { to: '/ordenes', label: 'Órdenes de Compra', icon: ClipboardList },
        { to: '/aprobaciones', label: 'Aprobaciones', icon: CheckSquare },
        { to: '/recepcion', label: 'Recepción', icon: PackageCheck },
        { to: '/costos-destino', label: 'Costos en Destino', icon: Anchor },
        { to: '/facturacion',      label: 'Facturación',      icon: Receipt },
        { to: '/cuentas-por-pagar', label: 'Cuentas por Pagar', icon: CreditCard },
    ];
    tabs.push({ id: 'adquisiciones', label: 'Adquisiciones', icon: Truck, items });

    return tabs;
};

export default function MainLayout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [userRole, setUserRole]           = useState(null);
    const [moduleRoles, setModuleRoles]     = useState({});
    const [userName, setUserName]           = useState('');
    const [companyName, setCompanyName]     = useState('Datix ERP');
    const [loading, setLoading]             = useState(true);
    const [activeTabId, setActiveTabId]     = useState(null);
    const [showAppDrawer, setShowAppDrawer] = useState(false);

    useEffect(() => { fetchUserData(); }, []);

    useEffect(() => {
        if (!userRole) return;
        const tabs = buildRibbonTabs(userRole, moduleRoles);
        const found = tabs.find(t => t.items?.some(i => i.to === location.pathname)) || 
                      tabs.find(t => t.items?.some(i => i.to !== '/' && location.pathname.startsWith(i.to)));
        if (found) setActiveTabId(found.id);
        else setActiveTabId('adquisiciones');
    }, [location.pathname, userRole, moduleRoles]);

    const fetchUserData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserName(user.email.split('@')[0].toUpperCase());

            // 🔥 NUEVA ARQUITECTURA: Extraemos Rol y ID directamente del JWT
            const role = user.app_metadata?.role || 'MEMBER';
            const companyId = user.app_metadata?.company_id;
            
            setUserRole(role);
            setModuleRoles(user.app_metadata?.module_roles || {});

            if (companyId) {
                const { data: comp } = await supabase.from('companies').select('name').eq('id', companyId).single();
                if (comp) setCompanyName(comp.name.replace(/Almacen/i, "Adquisiciones"));
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    if (loading) return <div className="h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div></div>;

    const tabs = buildRibbonTabs(userRole, moduleRoles);
    const currentTab = tabs.find(t => t.id === activeTabId) || tabs.find(t => t.id === 'adquisiciones');

    return (
        <div className="flex flex-col h-screen font-sans text-white/90 text-[13px] overflow-hidden" style={{ backgroundColor: '#45316D' }}>
            
            <header 
              style={{ backgroundColor: '#5B4385' }}
              className="flex h-12 shrink-0 items-center justify-between px-4 text-white z-[100] shadow-xl border-b border-white/5"
            >
                <div className="flex items-center gap-6 h-full overflow-x-auto no-scrollbar">
                    {/* Brand / Logo Area */}
                    <div 
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity whitespace-nowrap"
                    >
                        <span className="font-black tracking-tight text-white flex items-center gap-1.5 uppercase text-sm">
                            <span className="bg-white text-[#5B4385] px-1.5 py-0.5 rounded text-[10px] font-black">DX</span>
                            Adquisiciones
                        </span>
                    </div>

                    <div className="h-6 w-px bg-white/10 mx-1 hidden md:block"></div>

                    {/* Navigation Links (ERP Style) */}
                    <nav className="flex items-center gap-0.5 h-full">
                        {tabs.flatMap(t => t.items).filter(item => item.to !== '/').map(item => {
                            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to);
                            return (
                                <button
                                    key={item.to}
                                    onClick={() => navigate(item.to)}
                                    className={`px-3 flex items-center h-full transition-all border-b-2 whitespace-nowrap text-[12px] font-medium
                                        ${isActive 
                                            ? 'bg-white/10 border-white text-white' 
                                            : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
                                        }`}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden lg:flex items-center gap-3 text-white/60 mr-2">
                        <button className="hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10"><Bell size={16} /></button>
                        <button className="hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10"><HelpCircle size={16} /></button>
                    </div>
                    
                    <div className="flex items-center gap-3 ml-2 cursor-pointer hover:bg-white/10 px-3 py-1.5 rounded-md transition-all group relative">
                        <div className="flex flex-col items-end hidden sm:flex">
                            <span className="text-[11px] font-bold leading-none">{userName}</span>
                            <span className="text-[9px] text-white/50 uppercase tracking-tighter">{userRole?.toLowerCase()}</span>
                        </div>
                        <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-bold border border-white/20 shadow-inner group-hover:scale-105 transition-transform">
                            {userName.substring(0, 2)}
                        </div>
                        
                        {/* Dropdown Menu */}
                        <div className="absolute right-0 top-full w-56 pt-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all transform group-hover:translate-y-0 translate-y-2 z-[110]">
                            <div className="bg-[#5B4385] text-white shadow-2xl border border-white/10 rounded-lg py-2 overflow-hidden backdrop-blur-xl">
                                <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                                    <p className="font-bold text-xs truncate">{companyName}</p>
                                    <p className="text-[10px] text-white/50">{userRole}</p>
                                </div>
                                <div className="py-1">
                                    <button 
                                        onClick={async () => {
                                            const { data: { session } } = await supabase.auth.getSession();
                                            if (session) {
                                                window.location.href = `http://localhost:3000/portal#access_token=${session.access_token}&refresh_token=${session.refresh_token}`;
                                            } else {
                                                window.location.href = 'http://localhost:3000/login';
                                            }
                                        }} 
                                        className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center gap-3 text-xs transition-colors"
                                    >
                                        <LogOut size={14} className="opacity-70" /> 
                                        <span>Volver al Portal Datix</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto relative">
                {children || <Outlet />}
            </main>
        </div>
    );
}
