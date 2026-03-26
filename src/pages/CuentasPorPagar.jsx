import { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { CreditCard, Search, ChevronRight, X, FileText, Eye, Info } from 'lucide-react';

const BRAND_PRIMARY = '#4C3073';

const DOC_LABELS = {
  FACTURA:        'Factura',
  GUIA_DESPACHO:  'Guía de Despacho',
  BOLETA:         'Boleta',
  NOTA_CREDITO:   'Nota de Crédito',
  GUIA_DEVOLUCION:'Guía Devolución',
};

function poPayStatus(netAmount, totalPaid) {
  if (totalPaid <= 0)              return { key: 'PENDING',  label: 'Pendiente', color: 'bg-orange-50 text-orange-600 border-orange-200' };
  if (totalPaid >= netAmount)      return { key: 'PAID',     label: 'Pagado',    color: 'bg-green-50 text-green-700 border-green-200' };
  return                                  { key: 'PARTIAL',  label: 'Parcial',   color: 'bg-amber-50 text-amber-700 border-amber-200' };
}

export default function CuentasPorPagar() {
  const [poList, setPoList]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [companyId, setCompanyId]     = useState(null);
  const [searchTerm, setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal]         = useState(false);
  const [selectedPo, setSelectedPo]       = useState(null);
  const [modalLandedDetail, setModalLandedDetail] = useState(null); // product-level breakdown
  const [loadingLanded, setLoadingLanded] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 🔥 NUEVA ARQUITECTURA: Identidad vía JWT
      const jwtCompanyId = user.app_metadata?.company_id;
      if (!jwtCompanyId) return;
      setCompanyId(jwtCompanyId);

      // 1. Órdenes de compra recibidas (tienen facturas) - RLS filtra por empresa
      const { data: orders, error: oErr } = await supabase
        .from('purchase_orders')
        .select('id, po_number, status, issue_date, supplier_id, suppliers(id, business_name, name)')
        .in('status', ['PARTIAL', 'RECEIVED'])
        .order('po_number', { ascending: false });

      if (oErr) throw oErr;

      let enriched = [];

      if (orders?.length) {
        const poIds = orders.map(o => o.id);

        // 2. Expenses vinculadas a esas OC
        const { data: expenses, error: eErr } = await supabase
          .from('expenses')
          .select('id, po_id, category, document_number, description, amount, paid_amount, status, expense_date, due_date')
          .in('po_id', poIds)
          .not('po_id', 'is', null);

        if (eErr) throw eErr;

        // 3. Receipts para mostrar el tipo de documento (FACTURA / GUIA)
        const { data: receipts } = await supabase
          .from('inventory_receipts')
          .select('id, po_id, document_type, document_number')
          .in('po_id', poIds)
          .eq('status', 'DONE');

        // 4. Landed cost allocations por recepción (para calcular "Costos Asoc." por OC)
        const receiptIds = (receipts || []).map(r => r.id);
        let landedByReceipt = {};
        if (receiptIds.length) {
          const { data: allocs } = await supabase
            .from('landed_cost_allocations')
            .select('receipt_id, allocated_amount')
            .in('receipt_id', receiptIds);
          (allocs || []).forEach(a => {
            landedByReceipt[a.receipt_id] = (landedByReceipt[a.receipt_id] || 0) + Number(a.allocated_amount);
          });
        }

        // 5. Pagos ya realizados agrupados por expense_id
        const expenseIds = (expenses || []).map(e => e.id);
        const { data: payments } = expenseIds.length
          ? await supabase.from('supplier_payments').select('expense_id, amount').in('expense_id', expenseIds)
          : { data: [] };

        // 6. Enriquecer cada OC
        enriched = orders.map(po => {
          const poExpenses = (expenses || []).filter(e => e.po_id === po.id);
          const poReceipts = (receipts || []).filter(r => r.po_id === po.id);

          const docs = poExpenses.map(exp => {
            const isCredit   = Number(exp.amount) < 0;
            const receipt    = poReceipts.find(r => r.document_number === exp.document_number);
            const expPayments= (payments || []).filter(p => p.expense_id === exp.id);
            const paidReal   = expPayments.reduce((s, p) => s + Number(p.amount), 0);
            let docType;
            if (isCredit) {
              docType = (exp.description || '').includes('GUIA_DEVOLUCION') ? 'GUIA_DEVOLUCION' : 'NOTA_CREDITO';
            } else {
              docType = receipt?.document_type || 'FACTURA';
            }
            return {
              ...exp,
              document_type: docType,
              paid_amount:   paidReal || Number(exp.paid_amount || 0),
            };
          });

          const invoices    = docs.filter(d => Number(d.amount) > 0);
          const creditNotes = docs.filter(d => Number(d.amount) < 0);

          const totalInvoiced = invoices.reduce((s, d) => s + Number(d.amount), 0);
          const totalCredits  = creditNotes.reduce((s, d) => s + Math.abs(Number(d.amount)), 0);
          const totalPaid     = invoices.reduce((s, d) => s + Number(d.paid_amount || 0), 0);
          const netAmount     = Math.max(0, totalInvoiced - totalCredits);
          const balance       = Math.max(0, netAmount - totalPaid);
          const totalAmount   = totalInvoiced;
          const status        = poPayStatus(netAmount, totalPaid);

          const poReceiptIds = (receipts || []).filter(r => r.po_id === po.id).map(r => r.id);
          const landedTotal  = poReceiptIds.reduce((s, rid) => s + (landedByReceipt[rid] || 0), 0);

          return { ...po, docs, invoices, creditNotes, totalAmount, totalInvoiced, totalCredits, totalPaid, netAmount, balance, status, landedTotal, poReceiptIds };
        }).filter(po => po.invoices.length > 0);
      }

      // 6. Facturas Logísticas (LOG-) - RLS filtra automáticamente
      const { data: logExpenses, error: logErr } = await supabase
        .from('expenses')
        .select('id, internal_id, supplier_id, document_number, amount, paid_amount, status, expense_date, due_date, description, created_at')
        .like('internal_id', 'LOG-%')
        .gt('amount', 0)
        .order('created_at', { ascending: false });

      // Supplier lookup for LOG entries
      const logSupplierIds = [...new Set((logExpenses || []).map(e => e.supplier_id).filter(Boolean))];
      let logSupplierMap = {};
      if (logSupplierIds.length) {
        const { data: logSuppliers } = await supabase
          .from('suppliers').select('id, business_name, name').in('id', logSupplierIds);
        logSupplierMap = Object.fromEntries((logSuppliers || []).map(s => [s.id, s]));
      }

      const logMocks = logErr ? [] : (logExpenses || []).map(exp => {
        const netAmt  = Number(exp.amount);
        const paid    = Number(exp.paid_amount || 0);
        const balance = Math.max(0, netAmt - paid);
        const st      = poPayStatus(netAmt, paid);
        const supplier = logSupplierMap[exp.supplier_id];
        return {
          id: exp.id, po_number: exp.internal_id, issue_date: exp.expense_date,
          suppliers: supplier ? { business_name: supplier.business_name, name: supplier.name } : null,
          isLogistic: true,
          docs: [{ ...exp, document_type: 'FACTURA_LOGISTICA', paid_amount: paid }],
          invoices:    [{ ...exp, document_type: 'FACTURA_LOGISTICA', paid_amount: paid }],
          creditNotes: [],
          totalAmount: netAmt, totalInvoiced: netAmt, totalCredits: 0,
          totalPaid: paid, netAmount: netAmt, balance, status: st,
        };
      });

      setPoList([...enriched, ...logMocks]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (po) => {
    setSelectedPo(po);
    setShowModal(true);
    setModalLandedDetail(null);
    if (!po.isLogistic && po.poReceiptIds?.length && po.landedTotal > 0) {
      loadModalDetail(po);
    }
  };

  /* Carga el desglose producto × flete para el modal */
  const loadModalDetail = async (po) => {
    setLoadingLanded(true);
    try {
      // PO items con nombre de producto
      const { data: poItems } = await supabase
        .from('purchase_order_items')
        .select('product_id, quantity, unit_cost, products(name)')
        .eq('po_id', po.id);

      // Movimientos de recepción para estos receipts
      const { data: movements } = await supabase
        .from('inventory_movements')
        .select('receipt_id, product_id, quantity')
        .in('receipt_id', po.poReceiptIds);

      // Allocations por recepción con info de la factura LOG
      const { data: allocations } = await supabase
        .from('landed_cost_allocations')
        .select('receipt_id, allocated_amount, expenses(internal_id)')
        .in('receipt_id', po.poReceiptIds);

      if (!poItems || !movements) { setLoadingLanded(false); return; }

      // Agrupar por producto
      const itemMap = Object.fromEntries((poItems || []).map(i => [i.product_id, i]));
      const freightByProduct = {};

      // Para cada recepción, calcular flete por producto (proporcional al valor)
      const receiptGroups = {};
      (movements || []).forEach(m => {
        if (!receiptGroups[m.receipt_id]) receiptGroups[m.receipt_id] = [];
        receiptGroups[m.receipt_id].push(m);
      });

      Object.entries(receiptGroups).forEach(([rid, movs]) => {
        const recAllocs = (allocations || []).filter(a => a.receipt_id === rid);
        const recFreight = recAllocs.reduce((s, a) => s + Number(a.allocated_amount), 0);
        if (recFreight === 0) return;

        const recValue = movs.reduce((s, m) => {
          const item = itemMap[m.product_id];
          return s + (item ? Number(m.quantity) * Number(item.unit_cost) : 0);
        }, 0);

        movs.forEach(m => {
          const item = itemMap[m.product_id];
          if (!item || recValue === 0) return;
          const prodValue = Number(m.quantity) * Number(item.unit_cost);
          const prodFreight = (prodValue / recValue) * recFreight;
          freightByProduct[m.product_id] = (freightByProduct[m.product_id] || 0) + prodFreight;
        });
      });

      // Construir tabla de detalle
      const detail = (poItems || []).map(item => {
        const freightTotal = freightByProduct[item.product_id] || 0;
        const qty          = Number(item.quantity);
        const unitCost     = Number(item.unit_cost);
        const freightPerUnit = qty > 0 ? freightTotal / qty : 0;
        return {
          productId:    item.product_id,
          productName:  item.products?.name || item.product_id,
          qty,
          unitCost,
          freightTotal,
          freightPerUnit,
          totalCostPerUnit: unitCost + freightPerUnit,
        };
      }).filter(d => d.qty > 0);

      setModalLandedDetail(detail);
    } catch (err) {
      console.error('loadModalDetail error', err);
    } finally {
      setLoadingLanded(false);
    }
  };

  const totalPending = poList.filter(p => p.status.key !== 'PAID').reduce((s, p) => s + p.balance, 0);
  const totalPaid    = poList.reduce((s, p) => s + p.totalPaid, 0);

  const filtered = poList.filter(po => {
    const q    = searchTerm.toLowerCase();
    const name = (po.suppliers?.business_name || po.suppliers?.name || '').toLowerCase();
    const num  = String(po.po_number || '');
    const matchQ = !q || name.includes(q) || num.includes(q);
    const matchS = statusFilter === 'ALL' || po.status.key === statusFilter;
    return matchQ && matchS;
  });

  const supplierName = (po) => po.suppliers?.business_name || po.suppliers?.name || '—';

  return (
    <div className="flex flex-col h-[calc(100vh-40px)] bg-slate-50 text-slate-800 text-sm overflow-hidden">

      {/* Control Panel */}
      <div className="border-b border-slate-300 px-4 py-1.5 bg-white flex flex-col gap-1 shrink-0">
        <nav className="flex items-center text-[10px] text-slate-500 uppercase tracking-widest font-bold">
          <span>Adquisiciones</span>
          <ChevronRight size={10} className="mx-1" />
          <span className="text-slate-900">Cuentas por Pagar</span>
        </nav>
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Por Pagar</p>
              <p className="font-black text-sm" style={{ color: BRAND_PRIMARY }}>${Math.round(totalPending).toLocaleString('es-CL')}</p>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Pagado</p>
              <p className="font-black text-sm text-green-600">${Math.round(totalPaid).toLocaleString('es-CL')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="flex gap-1 border border-slate-300 rounded-sm overflow-hidden bg-white text-[10px] font-bold uppercase">
              {[
                { key: 'ALL',     label: 'Todos' },
                { key: 'PENDING', label: 'Pendiente' },
                { key: 'PARTIAL', label: 'Parcial' },
                { key: 'PAID',    label: 'Pagado' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1 transition-all ${statusFilter === f.key ? 'text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  style={statusFilter === f.key ? { backgroundColor: BRAND_PRIMARY } : {}}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative w-64">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar proveedor o N° OC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full rounded-sm border border-slate-300 pl-8 pr-3 py-1 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabla por OC */}
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <CreditCard size={40} className="text-slate-300" />
            <p className="font-bold text-sm uppercase tracking-widest">Sin órdenes pendientes de pago</p>
          </div>
        ) : (
          <div className="border border-slate-300 bg-white">
            <table className="w-full text-left border-collapse table-fixed text-xs">
              <thead className="bg-slate-100 border-b border-slate-300 text-[10px] uppercase tracking-tighter text-slate-600 font-bold">
                <tr>
                  <th className="px-4 py-2 w-20">OC #</th>
                  <th className="px-4 py-2">Proveedor</th>
                  <th className="px-4 py-2 w-24">Fecha OC</th>
                  <th className="px-4 py-2 w-20 text-center">Docs.</th>
                  <th className="px-4 py-2 w-32 text-right">Total OC</th>
                   <th className="px-4 py-2 w-28 text-right">Costos Asoc.</th>
                   <th className="px-4 py-2 w-32 text-right">Total</th>
                  <th className="px-4 py-2 w-28 text-right">Pagado</th>
                  <th className="px-4 py-2 w-28 text-right">Saldo</th>
                  <th className="px-4 py-2 w-28 text-right">Nota Créd.</th>
                  <th className="px-4 py-2 w-28 text-center">Estado</th>
                  <th className="px-4 py-2 w-36 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((po) => (
                  <tr key={po.id} className={`transition-colors ${po.status.key === 'PAID' ? 'bg-slate-50/40' : 'hover:bg-indigo-50/20'}`}>
                    <td className="px-4 py-2 font-black text-indigo-600 font-mono">
                      {po.isLogistic ? po.po_number : '#' + String(po.po_number).padStart(4, '0')}
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-800 overflow-hidden text-ellipsis whitespace-nowrap">
                      {supplierName(po)}
                    </td>
                    <td className="px-4 py-2 text-slate-500 font-mono text-[10px]">{po.issue_date || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className="inline-flex items-center gap-1 text-slate-500 font-bold">
                        <FileText size={11} />
                        {po.invoices.length + po.creditNotes.length}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">
                      ${Math.round(po.totalAmount).toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[11px]">
                      {(po.landedTotal || 0) > 0
                        ? <span className="text-amber-600 font-bold">+${Math.round(po.landedTotal).toLocaleString('es-CL')}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-black font-mono text-slate-800">
                      ${Math.round((po.totalAmount || 0) + (po.landedTotal || 0)).toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-green-600 font-bold">
                      {po.totalPaid > 0 ? `$${Math.round(po.totalPaid).toLocaleString('es-CL')}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-black font-mono" style={{ color: po.balance > 0 ? BRAND_PRIMARY : '#16a34a' }}>
                      ${Math.round(po.balance).toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {po.creditNotes.length > 0
                        ? <span className="text-red-500 font-bold">-${Math.round(po.totalCredits).toLocaleString('es-CL')}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-sm text-[9px] font-black border uppercase ${po.status.color}`}>
                        {po.status.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => openModal(po)}
                        className={`px-3 py-1 rounded-sm text-[10px] font-black uppercase transition-all inline-flex items-center gap-1 border ${
                          po.status.key !== 'PAID'
                            ? 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                            : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <Eye size={11} /> Ver Detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal / Panel lateral derecho */}
      {showModal && selectedPo && (
        <div className="fixed inset-0 bg-black/30 z-[200] flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className={`bg-white h-full w-full max-w-xl flex flex-col overflow-hidden border-l border-gray-300 shadow-2xl`}>

            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <CreditCard size={20} style={{ color: BRAND_PRIMARY }} strokeWidth={2.5} />
                <div>
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">
                    Detalle de Documentos
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                    {selectedPo.isLogistic ? selectedPo.po_number : 'OC #' + String(selectedPo.po_number).padStart(4, '0')} · {supplierName(selectedPo)}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Toolbar - solo cerrar */}
            <div className="px-4 py-2 bg-white border-b border-gray-100 flex gap-2 shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-1 rounded-sm text-xs font-bold uppercase shadow-sm transition-all"
              >
                Cerrar
              </button>
            </div>

            {/* Info banner */}
            <div className="mx-4 mt-4 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-sm px-3 py-2.5 shrink-0">
              <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-blue-700 leading-relaxed">
                <strong>Nota:</strong> El registro de pagos se realiza exclusivamente desde el módulo de Finanzas. Esta vista es de control.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Documentos de la OC */}
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Documentos Asociados a esta Orden</p>
                <div className="border border-gray-200 rounded-sm overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-gray-200 text-[10px] uppercase tracking-tighter text-slate-500 font-bold">
                      <tr>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-left">N° Documento</th>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2 text-right">Pagado</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {/* Facturas y guías (positivas) */}
                      {selectedPo.invoices.map((doc) => {
                        const docBalance = Math.max(0, Number(doc.amount || 0) - Number(doc.paid_amount || 0));
                        return (
                          <tr key={doc.id} className={docBalance === 0 ? 'bg-green-50/40' : ''}>
                            <td className="px-3 py-2">
                              <span className="inline-flex px-1.5 py-0.5 rounded-sm text-[9px] font-black border uppercase bg-blue-50 text-blue-700 border-blue-200">
                                {DOC_LABELS[doc.document_type] || doc.document_type}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-[11px]" style={{ color: BRAND_PRIMARY }}>
                              {doc.document_number}
                            </td>
                            <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{doc.expense_date}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">${Math.round(Number(doc.amount || 0)).toLocaleString('es-CL')}</td>
                            <td className="px-3 py-2 text-right font-mono text-green-600">${Math.round(Number(doc.paid_amount || 0)).toLocaleString('es-CL')}</td>
                            <td className="px-3 py-2 text-right font-black font-mono" style={{ color: docBalance > 0 ? BRAND_PRIMARY : '#16a34a' }}>
                              ${Math.round(docBalance).toLocaleString('es-CL')}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Notas de crédito / guías de devolución (negativas) */}
                      {selectedPo.creditNotes.map((doc) => (
                        <tr key={doc.id} className="bg-red-50/40">
                          <td className="px-3 py-2">
                            <span className="inline-flex px-1.5 py-0.5 rounded-sm text-[9px] font-black border uppercase bg-red-50 text-red-600 border-red-200">
                              {DOC_LABELS[doc.document_type] || doc.document_type}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-[11px] text-red-600">
                            {doc.document_number}
                          </td>
                          <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{doc.expense_date}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-red-600">
                            -${Math.round(Math.abs(Number(doc.amount || 0))).toLocaleString('es-CL')}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-400">—</td>
                          <td className="px-3 py-2 text-right font-mono text-red-500">
                            -${Math.round(Math.abs(Number(doc.amount || 0))).toLocaleString('es-CL')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-gray-200 font-black text-xs">
                      <tr>
                        <td colSpan="3" className="px-3 py-2 uppercase text-slate-500 text-[10px] tracking-widest">Total</td>
                        <td className="px-3 py-2 text-right font-mono">${Math.round(selectedPo.totalInvoiced).toLocaleString('es-CL')}</td>
                        <td className="px-3 py-2 text-right font-mono text-green-600">${Math.round(selectedPo.totalPaid).toLocaleString('es-CL')}</td>
                        <td className="px-3 py-2 text-right font-mono" style={{ color: BRAND_PRIMARY }}>${Math.round(selectedPo.balance).toLocaleString('es-CL')}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── Desglose de Costos por Producto (solo si hay landed costs) ── */}
              {!selectedPo.isLogistic && (selectedPo.landedTotal || 0) > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">
                    Costos Asociados por Producto (Landed Costs)
                  </p>
                  {loadingLanded ? (
                    <div className="border border-slate-200 rounded-sm p-4 text-center text-xs text-slate-400">Cargando desglose...</div>
                  ) : modalLandedDetail && modalLandedDetail.length > 0 ? (
                    <div className="border border-amber-200 rounded-sm overflow-hidden">
                      <div className="bg-amber-50 px-3 py-1.5 border-b border-amber-100 flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Costo Real en Inventario</p>
                        <span className="text-[10px] text-amber-600 font-bold">
                          Flete total asignado: +${Math.round(selectedPo.landedTotal).toLocaleString('es-CL')}
                        </span>
                      </div>
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100 text-[9px] uppercase tracking-tighter text-slate-500 font-bold">
                          <tr>
                            <th className="px-3 py-1.5 text-left">Producto</th>
                            <th className="px-3 py-1.5 text-right">Qty</th>
                            <th className="px-3 py-1.5 text-right">Costo Unit. OC</th>
                            <th className="px-3 py-1.5 text-right">+ Flete/u</th>
                            <th className="px-3 py-1.5 text-right font-black">= Costo Real/u</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {modalLandedDetail.map((d, i) => (
                            <tr key={i} className="hover:bg-amber-50/30">
                              <td className="px-3 py-2 font-medium text-slate-700">{d.productName}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-500">{d.qty}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-600">
                                ${d.unitCost.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-amber-600 font-bold">
                                +${d.freightPerUnit.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-right font-black font-mono" style={{ color: BRAND_PRIMARY }}>
                                ${d.totalCostPerUnit.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="bg-amber-50 border-t border-amber-100 px-3 py-2 text-[10px] text-amber-700">
                        <Info size={11} className="inline mr-1" />
                        El costo real refleja el costo unitario de la OC más el flete prorrateado. El pago al proveedor es solo por el Total OC.
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {selectedPo.status.key !== 'PAID' && (
                <div className="bg-gray-50 border border-gray-200 rounded-sm p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 font-bold uppercase tracking-tighter">Total Facturado</span>
                    <span className="font-bold font-mono text-gray-800">${Math.round(selectedPo.totalInvoiced).toLocaleString('es-CL')}</span>
                  </div>
                  {selectedPo.creditNotes.length > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-red-500 font-bold uppercase tracking-tighter">(-) Notas de Crédito</span>
                      <span className="font-bold font-mono text-red-500">-${Math.round(selectedPo.totalCredits).toLocaleString('es-CL')}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 font-bold uppercase tracking-tighter">Ya Pagado</span>
                    <span className="font-bold font-mono text-green-600">${Math.round(selectedPo.totalPaid).toLocaleString('es-CL')}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                    <span className="text-gray-500 font-bold text-xs uppercase tracking-tighter">Saldo Deudor</span>
                    <span className="font-black text-lg" style={{ color: BRAND_PRIMARY }}>
                      ${Math.round(selectedPo.balance).toLocaleString('es-CL')}
                    </span>
                  </div>
                </div>
              )}

              {/* Resumen solo lectura para órdenes pagadas */}
              {selectedPo.status.key === 'PAID' && (
                <div className="bg-green-50 border border-green-200 rounded-sm p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 font-bold uppercase tracking-tighter">Total Facturado</span>
                    <span className="font-bold font-mono text-gray-800">${Math.round(selectedPo.totalInvoiced).toLocaleString('es-CL')}</span>
                  </div>
                  {selectedPo.creditNotes.length > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-red-500 font-bold uppercase tracking-tighter">(-) Notas de Crédito</span>
                      <span className="font-bold font-mono text-red-500">-${Math.round(selectedPo.totalCredits).toLocaleString('es-CL')}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 font-bold uppercase tracking-tighter">Total Pagado</span>
                    <span className="font-bold font-mono text-green-600">${Math.round(selectedPo.totalPaid).toLocaleString('es-CL')}</span>
                  </div>
                  <div className="border-t border-green-200 pt-2 flex justify-between items-center">
                    <span className="text-green-700 font-black text-xs uppercase tracking-tighter">Estado</span>
                    <span className="inline-flex px-2 py-0.5 rounded-sm text-[10px] font-black border uppercase bg-green-100 text-green-700 border-green-300">✓ Saldado</span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
