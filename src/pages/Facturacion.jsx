import { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { FileText, Search, ChevronRight, X, Eye, Plus } from 'lucide-react';

const BRAND_PRIMARY = '#4C3073';

const DOC_LABELS = {
  FACTURA:           { label: 'Factura',           color: 'bg-green-50 text-green-700 border-green-200' },
  GUIA_DESPACHO:     { label: 'Guía de Despacho',  color: 'bg-blue-50 text-blue-700 border-blue-200' },
  BOLETA:            { label: 'Boleta',             color: 'bg-purple-50 text-purple-700 border-purple-200' },
  FACTURA_LOGISTICA: { label: 'Fact. Logística',   color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

export default function Facturacion() {
  const [receipts, setReceipts]         = useState([]);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [companyId, setCompanyId]       = useState(null);
  const [userId, setUserId]             = useState(null);
  const [searchTerm, setSearchTerm]     = useState('');
  const [typeFilter, setTypeFilter]     = useState('ALL');
  const [modalMode, setModalMode]       = useState(null); // 'register' | 'view'
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [formData, setFormData]         = useState({
    invoice_number: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
  });
  // Modal factura logística
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logFormData, setLogFormData]   = useState({
    supplier_id: '', document_number: '', amount: '',
    issue_date: new Date().toISOString().split('T')[0], due_date: '', description: '',
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: cu } = await supabase
        .from('company_users').select('company_id').eq('user_id', user.id).single();
      if (!cu) return;
      setCompanyId(cu.company_id);

      // 1. TODOS los proveedores de la empresa
      const { data: suppliersData } = await supabase
        .from('suppliers').select('id, business_name, name')
        .eq('company_id', cu.company_id).order('business_name');
      setAllSuppliers(suppliersData || []);
      const supplierMap = Object.fromEntries((suppliersData || []).map(s => [s.id, s]));

      // 2. Órdenes calificadas (PARTIAL o RECEIVED)
      let enriched = [];
      const { data: orders } = await supabase
        .from('purchase_orders')
        .select('id, po_number, status, billing_status, supplier_id')
        .eq('company_id', cu.company_id)
        .in('status', ['PARTIAL', 'RECEIVED']);

      if (orders?.length) {
        const poIds = orders.map(o => o.id);
        const poMap = Object.fromEntries(orders.map(o => [o.id, o]));

        const { data: receiptData } = await supabase
          .from('inventory_receipts').select('*')
          .in('po_id', poIds).eq('status', 'DONE')
          .order('created_at', { ascending: false });

        if (receiptData?.length) {
          const receiptIds = receiptData.map(r => r.id);
          const [
            { data: movements },
            { data: poItems },
            { data: expenses },
          ] = await Promise.all([
            supabase.from('inventory_movements').select('receipt_id, product_id, quantity').in('receipt_id', receiptIds),
            supabase.from('purchase_order_items').select('po_id, product_id, unit_cost').in('po_id', poIds),
            supabase.from('expenses').select('id, po_id, receipt_id, document_number, amount, expense_date, due_date, status').in('po_id', poIds),
          ]);

          enriched = receiptData.map(receipt => {
            const po       = poMap[receipt.po_id];
            const supplier = supplierMap[receipt.supplier_id] || supplierMap[po?.supplier_id];
            const receiptMovs = (movements || []).filter(m => m.receipt_id === receipt.id);
            const items       = (poItems || []).filter(i => i.po_id === receipt.po_id);
            const subtotal    = receiptMovs.reduce((sum, m) => {
              const item = items.find(i => i.product_id === m.product_id);
              return sum + (Number(m.quantity) * Number(item?.unit_cost || 0));
            }, 0);
            const amount = Math.round(subtotal * 1.19);
            const linkedExpense = (expenses || []).find(e =>
              e.receipt_id === receipt.id ||
              (receipt.document_type === 'FACTURA' && e.po_id === receipt.po_id && e.document_number === receipt.document_number)
            );
            const isInvoiced    = receipt.document_type === 'FACTURA' || !!linkedExpense;
            const invoiceNumber = receipt.document_type === 'FACTURA' ? receipt.document_number : linkedExpense?.document_number;
            return { ...receipt, po, supplier, amount, linkedExpense, isInvoiced, invoiceNumber };
          });
        }
      }

      // 3. Facturas Logísticas (LOG-)
      const { data: logExpenses, error: logErr } = await supabase
        .from('expenses')
        .select('id, internal_id, supplier_id, document_number, amount, expense_date, due_date, description, status, created_at')
        .eq('company_id', cu.company_id)
        .like('internal_id', 'LOG-%')
        .gt('amount', 0)
        .order('created_at', { ascending: false });

      const logFakeReceipts = logErr ? [] : (logExpenses || []).map(exp => ({
        id: exp.id, document_type: 'FACTURA_LOGISTICA', document_number: exp.document_number,
        created_at: exp.created_at || exp.expense_date, po: { po_number: exp.internal_id },
        supplier: supplierMap[exp.supplier_id] || null, amount: Number(exp.amount),
        linkedExpense: exp, isInvoiced: true, invoiceNumber: exp.document_number, isLogistic: true,
      }));

      setReceipts([...enriched, ...logFakeReceipts]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRegister = (receipt) => {
    setSelectedReceipt(receipt);
    setFormData({ invoice_number: '', issue_date: new Date().toISOString().split('T')[0], due_date: '' });
    setModalMode('register');
  };

  const handleOpenView = (receipt) => {
    setSelectedReceipt(receipt);
    setFormData({
      invoice_number: receipt.invoiceNumber || '',
      issue_date:     receipt.linkedExpense?.expense_date || '',
      due_date:       receipt.linkedExpense?.due_date || '',
    });
    setModalMode('view');
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!formData.invoice_number) return alert('Ingrese el número de factura.');
    setSaving(true);
    try {
      if (modalMode === 'register') {
        const { error: expErr } = await supabase.from('expenses').insert([{
          company_id:    companyId,
          user_id:       userId,
          category:      'OTROS',
          amount:        selectedReceipt.amount,
          description:   `FACTURA ${formData.invoice_number} — ${DOC_LABELS[selectedReceipt.document_type]?.label || ''} ${selectedReceipt.document_number}`,
          expense_date:  formData.issue_date,
          po_id:         selectedReceipt.po_id,
          receipt_id:    selectedReceipt.id,
          supplier_id:   selectedReceipt.po?.supplier_id,
          document_number: formData.invoice_number,
          due_date:      formData.due_date || null,
          status:        'PENDING_PAYMENT',
        }]);
        if (expErr) throw expErr;

        await supabase.from('purchase_orders')
          .update({ billing_status: 'BILLED' })
          .eq('id', selectedReceipt.po_id);

      } else if (modalMode === 'view' && selectedReceipt.linkedExpense?.id) {
        const { error: updErr } = await supabase.from('expenses')
          .update({
            document_number: formData.invoice_number,
            expense_date:    formData.issue_date,
            due_date:        formData.due_date || null,
          })
          .eq('id', selectedReceipt.linkedExpense.id);
        if (updErr) throw updErr;
      }

      setModalMode(null);
      fetchData();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLogistic = async (e) => {
    e.preventDefault();
    if (!logFormData.supplier_id) return alert('Seleccione un proveedor.');
    if (!logFormData.document_number) return alert('Ingrese el número de documento.');
    if (!logFormData.amount || isNaN(Number(logFormData.amount))) return alert('Ingrese un monto válido.');
    setSaving(true);
    try {
      const internalId = 'LOG-' + Date.now().toString().slice(-6);
      const supplier   = allSuppliers.find(s => s.id === logFormData.supplier_id);
      const newExp = {
        company_id:      companyId,
        user_id:         userId,
        category:        'OTROS',
        internal_id:     internalId,
        supplier_id:     logFormData.supplier_id,
        document_number: logFormData.document_number.toUpperCase(),
        amount:          Number(logFormData.amount),
        expense_date:    logFormData.issue_date,
        due_date:        logFormData.due_date || null,
        description:     logFormData.description || `Factura logística ${logFormData.document_number}`,
        status:          'PENDING_PAYMENT',
        po_id:           null,
        receipt_id:      null,
      };
      const { data: inserted, error } = await supabase.from('expenses').insert([newExp]).select().single();
      if (error) throw error;

      // Optimistic update: prepend to receipts list
      const fakeReceipt = {
        id: inserted?.id || Date.now(), document_type: 'FACTURA_LOGISTICA',
        document_number: newExp.document_number,
        created_at: new Date().toISOString(), po: { po_number: internalId },
        supplier: supplier || null, amount: Number(logFormData.amount),
        linkedExpense: inserted, isInvoiced: true, invoiceNumber: newExp.document_number,
        isLogistic: true,
      };
      setReceipts(prev => [fakeReceipt, ...prev]);
      setLogModalOpen(false);
      setLogFormData({ supplier_id: '', document_number: '', amount: '', issue_date: new Date().toISOString().split('T')[0], due_date: '', description: '' });
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = receipts.filter(r => {
    const q    = searchTerm.toLowerCase();
    const name = (r.supplier?.business_name || r.supplier?.name || '').toLowerCase();
    const po   = String(r.po?.po_number || '');
    const doc  = String(r.document_number || '').toLowerCase();
    const matchQ = !q || name.includes(q) || po.includes(q) || doc.includes(q);
    let matchT = true;
    if (typeFilter === 'PENDIENTE')        matchT = !r.isInvoiced;
    else if (typeFilter === 'LOGISTICA')   matchT = r.isLogistic;
    else if (typeFilter === 'FACTURA')     matchT = !r.isLogistic && r.document_type === 'FACTURA';
    else if (typeFilter === 'GUIA')        matchT = r.document_type === 'GUIA_DESPACHO';
    else if (typeFilter === 'BOLETA')      matchT = r.document_type === 'BOLETA';
    return matchQ && matchT;
  });

  // (counts computed inline in JSX)

  return (
    <div className="flex flex-col h-[calc(100vh-40px)] bg-gray-50 text-slate-800 text-sm overflow-hidden">

      {/* Control Panel */}
      <div className="border-b border-slate-300 px-5 py-2 bg-white flex flex-col gap-2 shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <nav className="flex items-center text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">
              <span>Adquisiciones</span>
              <ChevronRight size={10} className="mx-1" />
              <span className="text-slate-700">Control de Facturas de Proveedor</span>
            </nav>
            <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">
              {receipts.filter(r => !r.isInvoiced).length} pendiente{receipts.filter(r => !r.isInvoiced).length !== 1 ? 's' : ''} ·{' '}
              {receipts.filter(r => r.isInvoiced).length} facturada{receipts.filter(r => r.isInvoiced).length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative w-64">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar proveedor, OC o N° documento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full rounded-sm border border-slate-200 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#4C3073]"
              />
            </div>
            <button
              onClick={() => setLogModalOpen(true)}
              style={{ backgroundColor: BRAND_PRIMARY }}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase rounded-sm text-white hover:opacity-90 transition-all shadow-sm"
            >
              <Plus size={13} /> Nueva Factura Logística
            </button>
          </div>
        </div>

        {/* Tabs de filtro por tipo */}
        <div className="flex gap-0 border-b border-slate-200 -mb-2">
          {[
            { key: 'ALL',       label: 'Todas' },
            { key: 'PENDIENTE', label: 'Pendientes' },
            { key: 'FACTURA',   label: 'Facturas' },
            { key: 'GUIA',      label: 'Guías de Despacho' },
            { key: 'BOLETA',    label: 'Boletas' },
            { key: 'LOGISTICA', label: 'Logísticas' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all ${
                typeFilter === t.key
                  ? 'border-[#4C3073] text-[#4C3073]'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <FileText size={40} className="text-slate-300" />
            <p className="font-bold text-sm uppercase tracking-widest">Sin recepciones registradas</p>
          </div>
        ) : (
          <div className="border border-slate-300 bg-white">
            <table className="w-full text-left border-collapse table-fixed text-xs">
              <thead className="bg-slate-100 border-b border-slate-300 text-[10px] uppercase tracking-tighter text-slate-600 font-bold">
                <tr>
                  <th className="px-4 py-2 w-20">OC #</th>
                  <th className="px-4 py-2">Proveedor</th>
                  <th className="px-4 py-2 w-28">Fecha</th>
                  <th className="px-4 py-2 w-48">Documento Recibido</th>
                  <th className="px-4 py-2 w-32 text-center">Facturación</th>
                  <th className="px-4 py-2 w-32">N° Factura</th>
                  <th className="px-4 py-2 w-32 text-right">Monto</th>
                  <th className="px-4 py-2 w-36 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const docInfo = DOC_LABELS[r.document_type] || { label: r.document_type, color: 'bg-slate-50 text-slate-600 border-slate-200' };
                  return (
                    <tr key={r.id} className={`transition-colors ${r.isInvoiced ? 'bg-slate-50/40' : 'hover:bg-indigo-50/30'}`}>
                      <td className="px-4 py-2 font-black text-indigo-600 font-mono">
                        {r.isLogistic ? r.po?.po_number : '#' + String(r.po?.po_number || '').padStart(4, '0')}
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-800 overflow-hidden text-ellipsis whitespace-nowrap">
                        {r.supplier?.business_name || r.supplier?.name}
                      </td>
                      <td className="px-4 py-2 text-slate-500 font-mono text-[10px]">
                        {r.created_at?.split('T')[0]}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex px-1.5 py-0.5 rounded-sm text-[9px] font-black border uppercase w-fit ${docInfo.color}`}>
                            {docInfo.label}
                          </span>
                          <span className="font-mono font-bold text-slate-700 text-[11px]">{r.document_number}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.isInvoiced
                          ? <span className="inline-flex px-2 py-0.5 rounded-sm text-[9px] font-black bg-green-50 text-green-700 border border-green-200 uppercase">Facturada</span>
                          : <span className="inline-flex px-2 py-0.5 rounded-sm text-[9px] font-black bg-orange-50 text-orange-600 border border-orange-200 uppercase">Pendiente</span>
                        }
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-600 text-[11px]">
                        {r.invoiceNumber || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-black text-slate-900 font-mono">
                        ${r.amount.toLocaleString('es-CL')}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.isLogistic ? (
                          <button
                            onClick={() => handleOpenView(r)}
                            className="bg-white border border-amber-200 text-amber-600 hover:bg-amber-50 px-3 py-1 rounded-sm text-[10px] font-black uppercase transition-all inline-flex items-center gap-1"
                          >
                            <Eye size={11} /> Ver
                          </button>
                        ) : r.document_type === 'FACTURA' ? (
                          // Recepcionado con Factura → ya auto-registrado, solo ver
                          <button
                            onClick={() => handleOpenView(r)}
                            className="bg-white border border-slate-200 text-slate-400 hover:bg-slate-50 px-3 py-1 rounded-sm text-[10px] font-black uppercase transition-all inline-flex items-center gap-1"
                          >
                            <Eye size={11} /> Ver
                          </button>
                        ) : r.isInvoiced ? (
                          <button
                            onClick={() => handleOpenView(r)}
                            className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-3 py-1 rounded-sm text-[10px] font-black uppercase transition-all inline-flex items-center gap-1"
                          >
                            <Eye size={11} /> Ver / Editar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenRegister(r)}
                            style={{ backgroundColor: BRAND_PRIMARY }}
                            className="text-white px-3 py-1 rounded-sm text-[10px] font-black uppercase hover:opacity-90 transition-all inline-flex items-center gap-1"
                          >
                            <FileText size={11} /> Ingresar Factura
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Odoo-style */}
      {modalMode && selectedReceipt && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-sm shadow-xl w-full max-w-2xl flex flex-col overflow-hidden border border-gray-300">

            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <FileText size={20} style={{ color: BRAND_PRIMARY }} strokeWidth={2.5} />
                <div>
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">
                    {modalMode === 'register' ? 'Registrar Factura de Proveedor' : 'Factura Vinculada'}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                    OC #{String(selectedReceipt.po?.po_number || '').padStart(4, '0')} · {selectedReceipt.supplier?.business_name || selectedReceipt.supplier?.name}
                  </p>
                </div>
              </div>
              <button onClick={() => setModalMode(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Toolbar */}
            <div className="px-4 py-2 bg-white border-b border-gray-100 flex gap-2 shrink-0">
              {modalMode !== 'view' || selectedReceipt.document_type !== 'FACTURA' ? (
                <button
                  onClick={handleSubmit}
                  disabled={saving || !formData.invoice_number}
                  style={{ backgroundColor: BRAND_PRIMARY }}
                  className="text-white px-6 py-1 rounded-sm text-xs font-bold uppercase shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {saving ? 'Guardando...' : modalMode === 'register' ? 'Vincular Factura' : 'Guardar Cambios'}
                </button>
              ) : null}
              <button
                onClick={() => setModalMode(null)}
                className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-1 rounded-sm text-xs font-bold uppercase shadow-sm transition-all"
              >
                {modalMode === 'view' && selectedReceipt.document_type === 'FACTURA' ? 'Cerrar' : 'Descartar'}
              </button>
            </div>

            {/* Formulario 2 columnas */}
            <div className="p-6 grid grid-cols-2 gap-x-16 gap-y-4">
              {/* Izquierda: datos de la factura */}
              <div className="space-y-4">
                {modalMode === 'register' && (
                  <p className="text-xs text-gray-400 border-l-2 border-gray-200 pl-3 leading-relaxed">
                    Ingresa los datos de la factura del proveedor para vincularla a este documento de recepción.
                  </p>
                )}
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-6 uppercase tracking-tighter">N° Factura</label>
                  <input
                    required
                    readOnly={modalMode === 'view' && selectedReceipt.document_type === 'FACTURA'}
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value.toUpperCase() })}
                    placeholder="Folio..."
                    className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1 text-sm font-bold italic focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none read-only:bg-gray-50 read-only:text-gray-500"
                    style={{ color: BRAND_PRIMARY }}
                  />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-6 uppercase tracking-tighter">Fecha Emisión</label>
                  <input
                    type="date"
                    readOnly={modalMode === 'view' && selectedReceipt.document_type === 'FACTURA'}
                    value={formData.issue_date}
                    onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1 text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none"
                  />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-6 uppercase tracking-tighter">Vencimiento</label>
                  <input
                    type="date"
                    readOnly={modalMode === 'view' && selectedReceipt.document_type === 'FACTURA'}
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1 text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none"
                  />
                </div>
              </div>

              {/* Derecha: resumen del documento origen */}
              <div className="bg-gray-50 border border-gray-200 rounded-sm p-4 flex flex-col justify-center gap-3">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Documento Origen</p>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-bold uppercase tracking-tighter">Tipo</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-sm text-[9px] font-black border uppercase ${(DOC_LABELS[selectedReceipt.document_type] || {}).color || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {(DOC_LABELS[selectedReceipt.document_type] || {}).label || selectedReceipt.document_type}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-bold uppercase tracking-tighter">N° Documento</span>
                  <span className="font-bold font-mono" style={{ color: BRAND_PRIMARY }}>{selectedReceipt.document_number}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-bold uppercase tracking-tighter">Fecha Recepción</span>
                  <span className="font-bold text-gray-700 font-mono">{selectedReceipt.created_at?.split('T')[0]}</span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                  <span className="text-gray-500 font-bold text-xs uppercase tracking-tighter">Monto</span>
                  <span className="font-black text-lg" style={{ color: BRAND_PRIMARY }}>
                    ${selectedReceipt.amount.toLocaleString('es-CL')}
                  </span>
                </div>
                <p className="text-[9px] text-gray-400 text-right">IVA incluido (19%)</p>
              </div>
            </div>

          </div>
        </div>
      )}
      {/* Modal Factura Logística — Odoo Style */}
      {logModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-sm shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border border-gray-200">

            {/* Header */}
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <FileText size={20} style={{ color: BRAND_PRIMARY }} strokeWidth={2.5} />
                <div>
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">Nueva Factura Logística</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                    Sin Orden de Compra asociada · Gasto directo de servicio
                  </p>
                </div>
              </div>
              <button onClick={() => setLogModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            {/* Toolbar — Guardar / Descartar arriba (Odoo style) */}
            <div className="px-5 py-2 bg-white border-b border-gray-100 flex gap-2 shrink-0">
              <button
                form="log-form"
                type="submit"
                disabled={saving}
                style={{ backgroundColor: BRAND_PRIMARY }}
                className="text-white px-6 py-1 rounded-sm text-xs font-bold uppercase shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => setLogModalOpen(false)}
                className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-1 rounded-sm text-xs font-bold uppercase shadow-sm transition-all"
              >
                Descartar
              </button>
            </div>

            {/* Formulario 2 columnas — Odoo style */}
            <form id="log-form" onSubmit={handleSaveLogistic} className="p-6 grid grid-cols-2 gap-x-10 gap-y-4">

              {/* Columna izquierda */}
              <div className="space-y-4">
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-5 uppercase tracking-tighter">Proveedor</label>
                  <select
                    required
                    value={logFormData.supplier_id}
                    onChange={(e) => setLogFormData({ ...logFormData, supplier_id: e.target.value })}
                    className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1.5 text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none"
                  >
                    <option value="">— Seleccionar —</option>
                    {allSuppliers.map(s => <option key={s.id} value={s.id}>{s.business_name || s.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-5 uppercase tracking-tighter">N° Documento</label>
                  <input
                    required
                    value={logFormData.document_number}
                    onChange={(e) => setLogFormData({ ...logFormData, document_number: e.target.value.toUpperCase() })}
                    placeholder="Folio..."
                    className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1.5 text-sm font-mono font-bold focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none"
                    style={{ color: BRAND_PRIMARY }}
                  />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-5 uppercase tracking-tighter">Monto</label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={logFormData.amount}
                    onChange={(e) => setLogFormData({ ...logFormData, amount: e.target.value })}
                    placeholder="0"
                    className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1.5 text-sm font-mono font-bold focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ color: BRAND_PRIMARY }}
                  />
                </div>
                <div className="grid grid-cols-3 items-start">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-5 uppercase tracking-tighter pt-1.5">Descripción</label>
                  <textarea
                    rows={3}
                    value={logFormData.description}
                    onChange={(e) => setLogFormData({ ...logFormData, description: e.target.value })}
                    placeholder="Concepto del servicio, detalles adicionales..."
                    className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1.5 text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none resize-none"
                  />
                </div>
              </div>

              {/* Columna derecha */}
              <div className="space-y-4">
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-5 uppercase tracking-tighter">Fecha Emisión</label>
                  <input
                    type="date"
                    required
                    value={logFormData.issue_date}
                    onChange={(e) => setLogFormData({ ...logFormData, issue_date: e.target.value })}
                    className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1.5 text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none"
                  />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-5 uppercase tracking-tighter">Vencimiento</label>
                  <input
                    type="date"
                    value={logFormData.due_date}
                    onChange={(e) => setLogFormData({ ...logFormData, due_date: e.target.value })}
                    className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1.5 text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none"
                  />
                </div>

                {/* Preview del monto */}
                {logFormData.amount && Number(logFormData.amount) > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-sm p-4 mt-2 flex flex-col gap-2">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Resumen</p>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-bold uppercase tracking-tighter">Monto</span>
                      <span className="font-black text-base font-mono" style={{ color: BRAND_PRIMARY }}>
                        ${Number(logFormData.amount).toLocaleString('es-CL')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 uppercase tracking-tighter">Estado inicial</span>
                      <span className="inline-flex px-2 py-0.5 rounded-sm text-[9px] font-black border bg-orange-50 text-orange-600 border-orange-200 uppercase">Pendiente de pago</span>
                    </div>
                    {logFormData.due_date && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 uppercase tracking-tighter">Vence</span>
                        <span className="font-mono text-gray-700">{logFormData.due_date}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
