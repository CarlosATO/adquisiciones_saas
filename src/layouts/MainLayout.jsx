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
    CheckSquare
} from 'lucide-react';

const BRAND_PRIMARY = '#4C3073';

const buildRibbonTabs = (userRole, moduleRoles) => {
    const isManager = userRole === 'OWNER' || userRole === 'MANAGER' || moduleRoles?.ADQUISICIONES === 'MANAGER';
    const tabs = [];
    
    // Module 1: Inicio / Dashboard
    if (isManager) {
        tabs.push({
            id: 'inicio',
            label: 'Inicio',
            icon: LayoutDashboard,
            items: [
                { to: '/dashboard-compras', label: 'Tablero', icon: LayoutDashboard },
            ],
        });
    }

    // Module 2: Adquisiciones (Local)
    if (isManager || userRole === 'PURCHASER') {
        const items = [
            { to: '/productos', label: 'Productos', icon: Package },
            { to: '/proveedores', label: 'Proveedores', icon: Users },
            { to: '/ordenes', label: 'Órdenes de Compra', icon: ClipboardList },
            { to: '/recepcion', label: 'Recepción', icon: PackageCheck },
            { to: '/costos-destino', label: 'Costos en Destino', icon: Anchor },
            { to: '/facturacion',      label: 'Facturación',      icon: Receipt },
            { to: '/cuentas-por-pagar', label: 'Cuentas por Pagar', icon: CreditCard },
        ];
        // Solo MANAGER / OWNER ven la bandeja de aprobaciones
        if (isManager) {
            items.splice(3, 0, { to: '/aprobaciones', label: 'Aprobaciones', icon: CheckSquare });
        }
        tabs.push({ id: 'adquisiciones', label: 'Adquisiciones', icon: Truck, items });
    }

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
            const { data, error } = await supabase.from('company_users')
                .select('role, module_roles, companies(name)').eq('user_id', user.id).single();
            if (error) throw error;
            setUserRole(data.role);
            setModuleRoles(data.module_roles || {});
            setCompanyName(data.companies.name.replace(/Almacen/i, "Adquisiciones"));
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    if (loading) return <div className="h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div></div>;

    const tabs = buildRibbonTabs(userRole, moduleRoles);
    const currentTab = tabs.find(t => t.id === activeTabId) || tabs.find(t => t.id === 'adquisiciones');

    return (
        <div className="flex flex-col h-screen bg-white font-sans text-gray-800 text-sm overflow-hidden">
            
            {/* Top Bar with Inline Hex Fallback */}
            <header 
              style={{ backgroundColor: BRAND_PRIMARY }}
              className="flex h-10 shrink-0 items-center justify-between px-4 text-white z-[100] shadow-md"
            >
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowAppDrawer(!showAppDrawer)}
                        className={`flex h-8 w-8 items-center justify-center rounded-sm hover:bg-white/10 transition-colors ${showAppDrawer ? 'bg-white/20' : ''}`}
                    >
                        <Grip size={18} />
                    </button>
                    <div className="h-4 w-px bg-white/20 mx-1"></div>
                    <span className="font-bold tracking-tight uppercase text-[12px]">{currentTab?.label || 'Adquisiciones'}</span>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-4 text-white/80">
                        <button className="hover:text-white"><Bell size={16} /></button>
                        <button className="hover:text-white"><HelpCircle size={16} /></button>
                    </div>
                    <div className="flex items-center gap-2 ml-2 cursor-pointer hover:bg-white/10 px-2 py-1 rounded-sm transition-colors group relative">
                        <span className="text-[11px] font-medium hidden sm:block">{userName}</span>
                        <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold border border-white/30">
                            {userName.substring(0, 2)}
                        </div>
                        <div className="absolute right-0 top-full w-48 pt-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-[110]">
                            <div className="bg-white text-gray-800 shadow-xl border border-gray-200 rounded-sm py-1">
                            <div className="px-4 py-2 border-b border-gray-100">
                                <p className="font-bold text-xs">{companyName}</p>
                                <p className="text-[10px] text-gray-400 capitalize">{userRole?.toLowerCase()}</p>
                            </div>
                            <button onClick={() => window.location.href = 'http://localhost:3000/portal'} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-xs">
                                <LogOut size={14} /> Volver al Portal
                            </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* App Drawer Overlay */}
            {showAppDrawer && (
                <div 
                  style={{ backgroundColor: `${BRAND_PRIMARY}f2` }}
                  className="fixed inset-0 top-10 z-[90] backdrop-blur-md animate-in fade-in duration-200"
                >
                    <div className="p-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-8 max-w-6xl mx-auto">
                        {tabs.flatMap(t => t.items).filter(item => item.to !== '/').map(item => {
                            const Icon = item.icon;
                            const isActive = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
                            return (
                                <button 
                                    key={item.to}
                                    onClick={() => { 
                                        navigate(item.to);
                                        setShowAppDrawer(false); 
                                    }}
                                    className="flex flex-col items-center gap-3 group transition-transform hover:scale-105"
                                >
                                    <div 
                                      className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-lg ${isActive ? 'bg-white' : 'bg-white/10 text-white group-hover:bg-white/20'}`}
                                      style={isActive ? { color: BRAND_PRIMARY } : {}}
                                    >
                                        <Icon size={32} />
                                    </div>
                                    <span className="text-white font-medium text-sm tracking-wide">{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto relative bg-white">
                {children || <Outlet />}
            </main>
        </div>
    );
}
