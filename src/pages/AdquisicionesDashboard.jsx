import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabaseClient';
import {
  ShoppingCart, AlertCircle, TrendingDown, Plus, ChevronRight,
  Package, Clock, CheckCircle, FileText, BarChart2
} from 'lucide-react';

const BRAND_PRIMARY = '#4C3073';

const STATUS_MAP = {
  DRAFT:    { label: 'Borrador',   color: 'bg-slate-100 text-slate-500 border-slate-200' },
  PENDING:  { label: 'Pendiente',  color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  PARTIAL:  { label: 'Parcial',    color: 'bg-amber-50 text-amber-600 border-amber-200' },
  RECEIVED: { label: 'Recibida',   color: 'bg-green-50 text-green-700 border-green-200' },
};

export default function AdquisicionesDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading]             = useState(true);
  const [gastoMes, setGastoMes]           = useState(0);
  const [saldoPagar, setSaldoPagar]       = useState(0);
  const [ordenesEnCurso, setOrdenesEnCurso] = useState(0);
  const [topProveedores, setTopProveedores] = useState([]);
  const [ultimasOrdenes, setUltimasOrdenes] = useState([]);
  const [notasCredito, setNotasCredito]   = useState(0);

  const [unallocatedLog, setUnallocatedLog] = useState([]); // LOG- con saldo sin asignar

  useEffect(() => { fetchDashboardData(); }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: cu } = await supabase
        .from('company_users').select('company_id').eq('user_id', user.id).single();
      if (!cu) return;
      const companyId = cu.company_id;

      const now      = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      // 1. Gastos del mes (expenses vinculados a OC)
      const { data: expensesMes } = await supabase
        .from('expenses')
        .select('amount, paid_amount, status, supplier_id')
        .eq('company_id', companyId)
        .not('po_id', 'is', null)
        .gte('expense_date', firstDay)
        .lte('expense_date', lastDay);

      const invoicesMes    = (expensesMes || []).filter(e => Number(e.amount) > 0);
      const creditNotesMes = (expensesMes || []).filter(e => Number(e.amount) < 0);
      const totalFacturado = invoicesMes.reduce((s, e) => s + Number(e.amount), 0);
      const totalNC        = creditNotesMes.reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
      setGastoMes(Math.round(totalFacturado - totalNC));
      setNotasCredito(Math.round(totalNC));

      // 2. Saldo por pagar (todas las expenses pendientes, no solo este mes)
      const { data: expensesPendientes } = await supabase
        .from('expenses')
        .select('amount, paid_amount, status')
        .eq('company_id', companyId)
        .not('po_id', 'is', null)
        .gt('amount', 0)
        .in('status', ['PENDING_PAYMENT', 'PARTIAL_PAYMENT']);

      const totalSaldo = (expensesPendientes || []).reduce((s, e) =>
        s + Math.max(0, Number(e.amount) - Number(e.paid_amount || 0)), 0);
      setSaldoPagar(Math.round(totalSaldo));

      // 3. Órdenes en curso
      const { count: cursoCt } = await supabase
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['PENDING', 'PARTIAL']);
      setOrdenesEnCurso(cursoCt || 0);

      // 4. Top 5 proveedores (por gasto acumulado del mes)
      const supplierIds = [...new Set(invoicesMes.map(e => e.supplier_id).filter(Boolean))];
      if (supplierIds.length > 0) {
        const { data: suppliersData } = await supabase
          .from('suppliers')
          .select('id, business_name, name')
          .in('id', supplierIds);
        const supplierMap = Object.fromEntries((suppliersData || []).map(s => [s.id, s]));

        const totales = supplierIds.map(sid => ({
          supplier: supplierMap[sid],
          total: invoicesMes.filter(e => e.supplier_id === sid).reduce((s, e) => s + Number(e.amount), 0),
        })).sort((a, b) => b.total - a.total).slice(0, 5);

        setTopProveedores(totales);
      } else {
        setTopProveedores([]);
      }

      // 5. Últimas 5 órdenes
      const { data: ordenes } = await supabase
        .from('purchase_orders')
        .select('id, po_number, status, issue_date, total_amount, suppliers(business_name, name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5);
      setUltimasOrdenes(ordenes || []);

      // 6. Facturas logísticas con saldo sin asignar (LOG- donde allocated < amount)
      const { data: logExpenses } = await supabase
        .from('expenses')
        .select('id, internal_id, amount, expense_date, suppliers(business_name, name)')
        .eq('company_id', companyId)
        .like('internal_id', 'LOG-%')
        .gt('amount', 0);

      if (logExpenses?.length) {
        const logIds = logExpenses.map(e => e.id);
        const { data: allocs } = await supabase
          .from('landed_cost_allocations')
          .select('expense_id, allocated_amount')
          .in('expense_id', logIds);

        const allocMap = {};
        (allocs || []).forEach(a => {
          allocMap[a.expense_id] = (allocMap[a.expense_id] || 0) + Number(a.allocated_amount);
        });

        const pending = logExpenses.filter(e => {
          const allocated = allocMap[e.id] || 0;
          return allocated < Number(e.amount) - 0.01; // pequeña tolerancia de redondeo
        });
        setUnallocatedLog(pending);
      } else {
        setUnallocatedLog([]);
      }

    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n) => `$${Math.round(n).toLocaleString('es-CL')}`;
  const maxTop = topProveedores[0]?.total || 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] font-sans text-white/90">

      {/* ── CONTROL PANEL ── */}
      <div className="border-b border-white/5 px-6 py-2 bg-white/5 shadow-xl flex items-center justify-between backdrop-blur-md">
        <nav className="flex items-center text-[11px] text-white/50 uppercase tracking-widest font-medium gap-1">
          <span className="text-white/40">Compras</span>
          <ChevronRight size={11} className="text-white/20" />
          <span className="text-white font-black">Tablero</span>
        </nav>
        <button
          onClick={() => navigate('/ordenes')}
          className="flex items-center gap-2 text-white text-xs font-bold uppercase px-4 py-1.5 rounded-sm shadow-sm hover:opacity-90 transition"
          style={{ backgroundColor: BRAND_PRIMARY }}
        >
          <Plus size={13} /> Nueva Orden de Compra
        </button>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">

        {/* ── ALERTA: Facturas logísticas sin asignar ── */}
        {unallocatedLog.length > 0 && (
          <div className="bg-orange-50 border border-orange-300 rounded-sm px-4 py-3 flex items-start gap-3">
            <AlertCircle size={18} className="text-orange-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-widest text-orange-700">
                ⚠️ {unallocatedLog.length} Factura{unallocatedLog.length > 1 ? 's' : ''} Logística{unallocatedLog.length > 1 ? 's' : ''} sin asignar a órdenes de compra
              </p>
              <p className="text-[11px] text-orange-700 mt-1">
                <strong>Los Costos en Destino deben asignarse ANTES de vender la mercadería</strong> para que el margen de ganancia sea exacto.
                Si los productos se venden con stock = 0 antes de asignar, el costo de flete NO ajustará su valor en inventario.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {unallocatedLog.map(e => (
                  <span key={e.id} className="inline-flex items-center gap-1 bg-orange-100 border border-orange-200 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase">
                    {e.internal_id} · {e.suppliers?.business_name || e.suppliers?.name || '—'}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => navigate('/costos-destino')}
              className="shrink-0 text-[10px] font-black uppercase px-3 py-1.5 rounded-sm text-white hover:opacity-90 transition"
              style={{ backgroundColor: '#c2410c' }}
            >
              Asignar ahora →
            </button>
          </div>
        )}

        {/* ── FILA 1: KPI CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Gasto del Mes */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Gasto del Mes</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <BarChart2 size={16} className="text-indigo-300" />
              </div>
            </div>
            <div className="text-2xl font-black text-indigo-300 font-mono">{fmt(gastoMes)}</div>
            {notasCredito > 0 && (
              <div className="mt-1 text-[10px] text-red-300 font-bold font-mono">
                — NC: {fmt(notasCredito)} descontado
              </div>
            )}
            <div className="mt-2 text-[10px] text-white/30 uppercase tracking-widest leading-tight">Mes en curso · facturas recibidas</div>
          </div>

          {/* Saldo por Pagar */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Saldo por Pagar</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${saldoPagar > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-green-500/10 border border-green-500/20'}`}>
                <AlertCircle size={16} className={saldoPagar > 0 ? 'text-red-300' : 'text-green-300'} />
              </div>
            </div>
            <div className={`text-2xl font-black font-mono ${saldoPagar > 0 ? 'text-red-300' : 'text-green-300'}`}>
              {fmt(saldoPagar)}
            </div>
            <div className="mt-2 text-[10px] text-white/30 uppercase tracking-widest">Deuda acumulada pendiente</div>
          </div>

          {/* Órdenes en Curso */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Órdenes en Curso</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <ShoppingCart size={16} className="text-amber-300" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-300 font-mono">{ordenesEnCurso}</div>
            <div className="mt-2 text-[10px] text-white/30 uppercase tracking-widest">Pendientes + recibidas parcial</div>
          </div>
        </div>

        {/* ── FILA 2: TOP PROVEEDORES + ACTIVIDAD RECIENTE ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Top Proveedores */}
          <div className="bg-white/5 border border-white/10 rounded-xl shadow-xl backdrop-blur-sm">
            <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
              <TrendingDown size={14} className="text-indigo-400" />
              <h2 className="text-[10px] font-black uppercase tracking-widest text-white/60">Top Proveedores · Mes Actual</h2>
            </div>
            <div className="px-5 py-4 space-y-4">
              {topProveedores.length === 0 ? (
                <div className="text-center py-8 text-slate-300 text-xs uppercase tracking-widest font-bold">
                  Sin datos este mes
                </div>
              ) : topProveedores.map((item, idx) => {
                const pct = Math.round((item.total / maxTop) * 100);
                const name = item.supplier?.business_name || item.supplier?.name || 'Proveedor';
                return (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white/80 truncate max-w-[60%]">{name}</span>
                      <span className="text-xs font-mono font-black text-indigo-300">{fmt(item.total)}</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actividad Reciente */}
          <div className="bg-white/5 border border-white/10 rounded-xl shadow-xl backdrop-blur-sm">
            <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-white/40" />
                <h2 className="text-[10px] font-black uppercase tracking-widest text-white/60">Actividad Reciente</h2>
              </div>
              <button
                onClick={() => navigate('/ordenes')}
                className="text-[10px] font-bold text-indigo-300 hover:underline uppercase tracking-widest transition-all"
              >
                Ver todas →
              </button>
            </div>
            <div className="overflow-hidden">
              {ultimasOrdenes.length === 0 ? (
                <div className="text-center py-8 text-slate-300 text-xs uppercase tracking-widest font-bold">
                  Sin órdenes registradas
                </div>
              ) : (
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/5 text-[9px] uppercase tracking-wider text-white/40 font-black">
                      <th className="px-4 py-2 text-left">Ref.</th>
                      <th className="px-4 py-2 text-left">Proveedor</th>
                      <th className="px-4 py-2 text-left">Fecha</th>
                      <th className="px-4 py-2 text-center">Estado</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {ultimasOrdenes.map(o => {
                      const st = STATUS_MAP[o.status] || STATUS_MAP.DRAFT;
                      return (
                        <tr
                          key={o.id}
                          onClick={() => navigate('/ordenes')}
                          className="hover:bg-white/5 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-2.5 font-mono font-black text-indigo-300">
                            #{String(o.po_number).padStart(4, '0')}
                          </td>
                          <td className="px-4 py-2.5 text-white/70 max-w-[120px] truncate">
                            {o.suppliers?.business_name || o.suppliers?.name || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-white/40 font-mono">
                            {o.issue_date?.split('T')[0] || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex px-1.5 py-0.5 rounded-sm text-[9px] font-black border uppercase shadow-sm ${st.color.replace('bg-indigo-50', 'bg-indigo-500/10').replace('text-indigo-600', 'text-indigo-300').replace('border-indigo-200', 'border-indigo-500/20')}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-white/90">
                            {o.total_amount ? fmt(o.total_amount) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* ── FILA 3: ACCESOS RÁPIDOS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Órdenes de Compra', icon: ShoppingCart, to: '/ordenes', color: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20' },
            { label: 'Proveedores',        icon: Package,      to: '/proveedores', color: 'text-blue-300 bg-blue-500/10 border-blue-500/20' },
            { label: 'Facturación',        icon: FileText,     to: '/facturacion', color: 'text-green-300 bg-green-500/10 border-green-500/20' },
            { label: 'Cuentas por Pagar',  icon: AlertCircle,  to: '/cuentas-por-pagar', color: 'text-red-300 bg-red-500/10 border-red-500/20' },
          ].map(({ label, icon: Icon, to, color }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className={`bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center gap-2 text-center hover:bg-white/10 hover:shadow-2xl transition-all group backdrop-blur-sm`}
            >
              <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${color}`}>
                <Icon size={17} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white transition">{label}</span>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
