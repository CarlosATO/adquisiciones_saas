import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabaseClient';
import { CheckSquare, ChevronRight, X, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

const BRAND_PRIMARY = '#4C3073';

export default function Aprobaciones() {
  const navigate   = useNavigate();
  const [loading, setLoading]       = useState(true);
  const [orders, setOrders]         = useState([]);
  const [companyId, setCompanyId]   = useState(null);
  const [userId, setUserId]         = useState(null);
  const [isManager, setIsManager]   = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [saving, setSaving]         = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/'); return; }
      setUserId(user.id);

      const { data: cu } = await supabase
        .from('company_users')
        .select('company_id, role, module_roles')
        .eq('user_id', user.id).single();

      if (!cu) { navigate('/'); return; }
      setCompanyId(cu.company_id);

      const manager = cu.role === 'OWNER' || cu.role === 'MANAGER' || cu.module_roles?.ADQUISICIONES === 'MANAGER';
      setIsManager(manager);

      if (!manager) { navigate('/'); return; }

      await fetchOrders(cu.company_id);
    } catch (err) {
      console.error(err);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async (cid) => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, po_number, issue_date, total_amount, created_at, suppliers(id, business_name, name)')
      .eq('company_id', cid)
      .eq('status', 'WAITING_APPROVAL')
      .order('created_at', { ascending: true });

    if (error) console.error(error);
    setOrders(data || []);
  };

  const handleApprove = async () => {
    if (!selectedOrder) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status:        'PENDING',
          approved_by:   userId,
          approval_date: new Date().toISOString(),
        })
        .eq('id', selectedOrder.id);
      if (error) throw error;
      setSuccessMsg(`✓ Orden #${String(selectedOrder.po_number).padStart(4, '0')} aprobada. El comprador puede proceder.`);
      setSelectedOrder(null);
      fetchOrders(companyId);
    } catch (err) {
      alert('Error al aprobar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedOrder) return;
    if (!window.confirm('¿Rechazar esta orden? Volverá a estado Borrador para que el comprador la corrija.')) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'DRAFT', approved_by: null, approval_date: null })
        .eq('id', selectedOrder.id);
      if (error) throw error;
      setSuccessMsg(`Orden #${String(selectedOrder.po_number).padStart(4, '0')} devuelta a Borrador.`);
      setSelectedOrder(null);
      fetchOrders(companyId);
    } catch (err) {
      alert('Error al rechazar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_PRIMARY }}></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-40px)] bg-slate-50 font-sans text-slate-800 text-sm overflow-hidden">

      {/* Control Panel */}
      <div className="border-b border-slate-300 px-6 py-2 bg-white shadow-sm flex items-center justify-between shrink-0">
        <nav className="flex items-center text-[11px] text-slate-500 uppercase tracking-widest font-medium gap-1">
          <span className="text-slate-400">Adquisiciones</span>
          <ChevronRight size={11} className="text-slate-300" />
          <span className="text-slate-900 font-black">Bandeja de Aprobaciones</span>
        </nav>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {orders.length} orden{orders.length !== 1 ? 'es' : ''} pendiente{orders.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Success alert */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-sm px-4 py-2.5">
            <CheckCircle size={14} className="text-green-600 shrink-0" />
            <p className="text-[11px] text-green-700 font-bold flex-1">{successMsg}</p>
            <button onClick={() => setSuccessMsg('')} className="text-green-400 hover:text-green-600"><X size={13} /></button>
          </div>
        )}

        {/* Empty state */}
        {orders.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-sm p-12 text-center">
            <CheckCircle size={40} className="mx-auto mb-3 text-green-300" />
            <p className="text-sm font-black uppercase tracking-widest text-slate-400">Sin órdenes pendientes</p>
            <p className="text-xs text-slate-400 mt-1">Todas las órdenes han sido procesadas</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Órdenes Esperando Aprobación
              </p>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase tracking-tighter text-slate-600 font-bold">
                <tr>
                  <th className="px-4 py-2 w-24">N° Orden</th>
                  <th className="px-4 py-2">Proveedor</th>
                  <th className="px-4 py-2 w-32">Fecha</th>
                  <th className="px-4 py-2 w-36 text-right">Total</th>
                  <th className="px-4 py-2 w-28 text-center">Estado</th>
                  <th className="px-4 py-2 w-28 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-purple-50/30 transition-colors cursor-pointer" onClick={() => setSelectedOrder(o)}>
                    <td className="px-4 py-3 font-black font-mono" style={{ color: BRAND_PRIMARY }}>
                      #{String(o.po_number).padStart(4, '0')}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {o.suppliers?.business_name || o.suppliers?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">{o.issue_date}</td>
                    <td className="px-4 py-3 text-right font-black font-mono text-slate-800">
                      ${Number(o.total_amount).toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[9px] font-black border uppercase bg-purple-50 text-purple-700 border-purple-200">
                        <Clock size={9} /> Esperando
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedOrder(o); }}
                        className="text-[10px] font-black uppercase px-3 py-1 rounded-sm border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Revisar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Aprobación */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">

            {/* Modal toolbar */}
            <div className="border-b border-slate-200 px-5 py-3 bg-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} style={{ color: BRAND_PRIMARY }} />
                <span className="font-black text-sm uppercase tracking-widest" style={{ color: BRAND_PRIMARY }}>
                  Revisión de Orden
                </span>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-600 p-1 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Toolbar actions */}
            <div className="border-b border-slate-100 px-5 py-2 bg-slate-50 flex gap-2">
              <button
                onClick={handleApprove}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-black uppercase rounded-sm text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#16a34a' }}
              >
                <CheckCircle size={13} /> {saving ? 'Procesando...' : 'Aprobar Orden'}
              </button>
              <button
                onClick={handleReject}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-black uppercase rounded-sm text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#dc2626' }}
              >
                <XCircle size={13} /> Rechazar
              </button>
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-1.5 text-xs font-black uppercase rounded-sm border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 ml-auto"
              >
                Cerrar
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-4">
              {/* Alerta informativa */}
              <div className="flex items-start gap-2 bg-purple-50 border border-purple-200 rounded-sm px-3 py-2.5">
                <AlertCircle size={13} className="text-purple-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-purple-700">
                  Esta orden supera el umbral de aprobación configurado. Como Manager, puedes aprobarla para que el comprador continúe, o rechazarla para que la corrija.
                </p>
              </div>

              {/* Datos de la orden */}
              <div className="border border-slate-200 rounded-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-100 px-4 py-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Resumen de la Orden</p>
                </div>
                <div className="divide-y divide-slate-50">
                  <div className="px-4 py-2.5 flex justify-between items-center">
                    <span className="text-[11px] text-slate-500 font-bold uppercase tracking-tighter">N° Orden</span>
                    <span className="font-black text-sm font-mono" style={{ color: BRAND_PRIMARY }}>
                      #{String(selectedOrder.po_number).padStart(4, '0')}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex justify-between items-center">
                    <span className="text-[11px] text-slate-500 font-bold uppercase tracking-tighter">Proveedor</span>
                    <span className="font-medium text-xs text-slate-700">
                      {selectedOrder.suppliers?.business_name || selectedOrder.suppliers?.name || '—'}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex justify-between items-center">
                    <span className="text-[11px] text-slate-500 font-bold uppercase tracking-tighter">Fecha</span>
                    <span className="font-mono text-xs text-slate-600">{selectedOrder.issue_date}</span>
                  </div>
                  <div className="px-4 py-2.5 flex justify-between items-center bg-purple-50">
                    <span className="text-[11px] text-slate-600 font-black uppercase tracking-tighter">Total a Aprobar</span>
                    <span className="font-black text-lg" style={{ color: BRAND_PRIMARY }}>
                      ${Number(selectedOrder.total_amount).toLocaleString('es-CL')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
