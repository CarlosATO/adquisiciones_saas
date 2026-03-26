import { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { Anchor, ChevronRight, CheckSquare, Square, Calculator, CheckCircle, X, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const BRAND_PRIMARY = '#4C3073';
const BRAND_ACCENT  = '#8E43D9';

export default function CostosDestino() {
  const [companyId, setCompanyId]       = useState(null);
  const [userId, setUserId]             = useState(null);
  const [loading, setLoading]           = useState(true);

  // Data
  const [logInvoices, setLogInvoices]   = useState([]); // LOG- expenses con saldo disponible
  const [receipts, setReceipts]         = useState([]); // inventory_receipts DONE

  // Wizard state
  const [selectedInvoices, setSelectedInvoices] = useState([]); // multi-select LOG-
  const [selectedReceipts, setSelectedReceipts] = useState([]);
  const [receiptSearch, setReceiptSearch]       = useState('');
  const [allocation, setAllocation]             = useState(null);
  const [expandedRow, setExpandedRow]           = useState(null);
  const [saving, setSaving]                     = useState(false);
  const [successMsg, setSuccessMsg]             = useState('');

  useEffect(() => { fetchData(); }, []);

  /* ── DATA LOAD ─────────────────────────────────────────── */
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // 🔥 NUEVA ARQUITECTURA: Identidad vía JWT
      const jwtCompanyId = user.app_metadata?.company_id;
      if (!jwtCompanyId) return;
      setCompanyId(jwtCompanyId);

      // 1. Facturas LOG- con su asignación acumulada (RLS filtra automáticamente)
      const { data: expenses } = await supabase
        .from('expenses')
        .select('id, internal_id, supplier_id, document_number, amount, expense_date, description, suppliers(business_name, name)')
        .like('internal_id', 'LOG-%')
        .gt('amount', 0)
        .order('internal_id', { ascending: false });

      // Suma ya asignada por expense
      const { data: allocations } = await supabase
        .from('landed_cost_allocations')
        .select('expense_id, allocated_amount');

      const allocMap = {};
      (allocations || []).forEach(a => {
        allocMap[a.expense_id] = (allocMap[a.expense_id] || 0) + Number(a.allocated_amount);
      });

      const invoicesWithBalance = (expenses || []).map(e => ({
        ...e,
        supplier_name: e.suppliers?.business_name || e.suppliers?.name || '—',
        allocated:     allocMap[e.id] || 0,
        remaining:     Number(e.amount) - (allocMap[e.id] || 0),
      })).filter(e => e.remaining > 0.01);

      setLogInvoices(invoicesWithBalance);

      // 2. Recepciones DONE con proveedor y OC
      const { data: recs } = await supabase
        .from('inventory_receipts')
        .select(`
          id, document_type, document_number, created_at, po_id,
          purchase_orders(po_number, supplier_id, suppliers(business_name, name))
        `)
        .eq('status', 'DONE')
        .order('created_at', { ascending: false });

      // 3. Movimientos + ítems de OC para calcular el valor de cada recepción
      if (recs?.length) {
        const recIds = recs.map(r => r.id);
        const poIds  = [...new Set(recs.map(r => r.po_id).filter(Boolean))];

        const [{ data: movements }, { data: poItems }] = await Promise.all([
          supabase.from('inventory_movements').select('receipt_id, product_id, quantity').in('receipt_id', recIds),
          supabase.from('purchase_order_items').select('po_id, product_id, unit_cost').in('po_id', poIds),
        ]);

        const enriched = recs
          // Excluir notas de crédito y guías de devolución de la selección visual
          .filter(rec => !['NOTA_CREDITO', 'GUIA_DEVOLUCION'].includes(rec.document_type))
          .map(rec => {
            const recMovs = (movements || []).filter(m => m.receipt_id === rec.id);
            const items   = (poItems   || []).filter(i => i.po_id === rec.po_id);
            const value   = recMovs.reduce((sum, m) => {
              const item = items.find(i => i.product_id === m.product_id);
              return sum + Number(m.quantity) * Number(item?.unit_cost || 0);
            }, 0);
            return {
              ...rec,
              po_number:     rec.purchase_orders?.po_number,
              supplier_name: rec.purchase_orders?.suppliers?.business_name || rec.purchase_orders?.suppliers?.name || '—',
              value,
              movements: recMovs,
              poItems:   items,
            };
          });

        setReceipts(enriched);
      } else {
        setReceipts([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /* ── TOGGLE RECEIPT SELECTION ───────────────────────────── */
  const toggleReceipt = (id) => {
    setSelectedReceipts(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
    setAllocation(null); // reset preview on change
  };

  /* ── CALCULAR PRORRATEO ─────────────────────────────────── */
  const calcAllocation = async () => {
    if (selectedInvoices.length === 0) return alert('Seleccione al menos una factura logística.');
    if (selectedReceipts.length === 0) return alert('Seleccione al menos una recepción.');

    const chosen     = receipts.filter(r => selectedReceipts.includes(r.id));
    const totalValue = chosen.reduce((s, r) => s + r.value, 0);
    if (totalValue === 0) return alert('Las recepciones seleccionadas no tienen valor calculable. Verifica los costos de la OC.');

    const toDistribute = selectedInvoices.reduce((s, inv) => s + inv.remaining, 0);

    // Fetch current cost_price for all products involved
    const allProductIds = [...new Set(chosen.flatMap(rec => rec.movements.map(m => m.product_id)))];
    const { data: productData } = await supabase
      .from('products').select('id, name, cost_price, stock_quantity').in('id', allProductIds);
    const productMap = Object.fromEntries((productData || []).map(p => [p.id, p]));

    const rows = chosen.map(rec => {
      const pct    = rec.value / totalValue;
      const amount = Math.round(pct * toDistribute);

      const products = rec.movements.map(mov => {
        const item      = rec.poItems.find(i => i.product_id === mov.product_id);
        const prod      = productMap[mov.product_id];
        if (!item || !prod) return null;
        const prodValue   = Number(mov.quantity) * Number(item.unit_cost);
        const prodShare   = rec.value > 0 ? Math.round((prodValue / rec.value) * amount) : 0;
        const currentCost = Number(prod.cost_price || 0);
        const stock       = Number(prod.stock_quantity || 0);
        const newCost     = stock > 0
          ? Math.round(((stock * currentCost) + prodShare) / stock * 100) / 100
          : currentCost;
        return { id: prod.id, name: prod.name, qty: Number(mov.quantity), currentCost, prodShare, newCost };
      }).filter(Boolean);

      return { receipt: rec, pct, amount, products };
    });

    // Ajuste de redondeo al último ítem
    const diff = Math.round(toDistribute) - rows.reduce((s, r) => s + r.amount, 0);
    if (rows.length > 0) rows[rows.length - 1].amount += diff;

    setAllocation({ rows, toDistribute, totalValue });
    setExpandedRow(null);
  };

  /* ── APLICAR PRORRATEO ──────────────────────────────────── */
  const applyAllocation = async () => {
    if (!allocation) return;
    setSaving(true);
    try {
      const totalDistributed = selectedInvoices.reduce((s, inv) => s + inv.remaining, 0);

      for (const row of allocation.rows) {
        const { receipt, amount } = row;
        if (amount <= 0) continue;

        // 1. Insertar en landed_cost_allocations — un registro por cada (factura, recepción)
        //    Cada factura aporta su proporción del monto asignado a esta recepción
        for (const inv of selectedInvoices) {
          const invShare = totalDistributed > 0
            ? Math.round((inv.remaining / totalDistributed) * amount)
            : 0;
          if (invShare <= 0) continue;
          const { error: lcaErr } = await supabase.from('landed_cost_allocations').insert([{
            expense_id:       inv.id,
            receipt_id:       receipt.id,
            allocated_amount: invShare,
            created_by:       userId,
          }]);
          if (lcaErr) throw lcaErr;
        }

        // 2. Actualizar cost_price de cada producto de esta recepción
        const recValue = receipt.value;
        for (const mov of receipt.movements) {
          const item     = receipt.poItems.find(i => i.product_id === mov.product_id);
          if (!item) continue;
          const prodValue = Number(mov.quantity) * Number(item.unit_cost);
          const prodShare = recValue > 0 ? (prodValue / recValue) * amount : 0;
          if (prodShare <= 0) continue;

          const { data: prod } = await supabase
            .from('products').select('id, stock_quantity, cost_price')
            .eq('id', mov.product_id).single();
          if (!prod || Number(prod.stock_quantity) <= 0) continue;

          const currentStock = Number(prod.stock_quantity);
          const newCost      = ((currentStock * Number(prod.cost_price || 0)) + prodShare) / currentStock;
          await supabase.from('products')
            .update({ cost_price: Math.round(newCost * 100) / 100 })
            .eq('id', prod.id);
        }
      }

      const total = selectedInvoices.reduce((s, i) => s + i.remaining, 0);
      setSuccessMsg(`✓ Prorrateo aplicado. $${Math.round(total).toLocaleString('es-CL')} de ${selectedInvoices.length} factura(s) distribuidos entre ${allocation.rows.length} recepción(es).`);
      setAllocation(null);
      setSelectedInvoices([]);
      setSelectedReceipts([]);
      fetchData();
    } catch (err) {
      alert('Error al aplicar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ── RENDER ─────────────────────────────────────────────── */
  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">Cargando...</div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-40px)] bg-gray-50 text-slate-800 text-sm overflow-hidden">

      {/* Control Panel */}
      <div className="border-b border-slate-200 px-5 py-2.5 bg-white shrink-0">
        <nav className="flex items-center text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">
          <span>Adquisiciones</span>
          <ChevronRight size={10} className="mx-1" />
          <span className="text-slate-700">Costos en Destino (Landed Costs)</span>
        </nav>
        <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">
          Prorratea gastos de flete y aduana entre las recepciones de inventario
        </p>
      </div>

      {/* ── BANNER EDUCATIVO PERMANENTE ── */}
      <div className="mx-5 mt-3 flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-sm px-4 py-3 shrink-0">
        <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">Importante · Orden de Operaciones</p>
          <p className="text-[11px] text-amber-800 mt-0.5">
            <strong>Los Costos en Destino deben asignarse ANTES de vender la mercadería</strong> para que el margen de ganancia sea exacto.
            Si los productos ya fueron vendidos (stock = 0), el costo prorrateado no podrá ajustar su valor en inventario.
          </p>
        </div>
      </div>

      {/* Success Banner */}
      {successMsg && (
        <div className="mx-5 mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-sm px-4 py-2.5 shrink-0">
          <CheckCircle size={14} className="text-green-600 shrink-0" />
          <p className="text-[11px] text-green-700 font-bold">{successMsg}</p>
          <button onClick={() => setSuccessMsg('')} className="ml-auto text-green-400 hover:text-green-600"><X size={14} /></button>
        </div>
      )}

      {/* Body — 3 columnas */}
      <div className="flex-1 overflow-auto p-5 grid grid-cols-12 gap-4">

        {/* ── SECCIÓN A: Origen ── (col 1-4) */}
        <div className="col-span-4 flex flex-col gap-3">
          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">A · Factura Logística</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{selectedInvoices.length} seleccionada{selectedInvoices.length !== 1 ? 's' : ''}</p>
              </div>
              {selectedInvoices.length > 0 && (
                <button
                  onClick={() => { setSelectedInvoices([]); setAllocation(null); setSelectedReceipts([]); }}
                  className="text-[10px] text-slate-400 hover:text-slate-600 uppercase font-bold tracking-widest"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto divide-y divide-slate-50">
              {logInvoices.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <Anchor size={28} className="mx-auto mb-2 text-slate-200" />
                  <p className="text-xs font-bold uppercase tracking-widest">Sin facturas disponibles</p>
                  <p className="text-[11px] mt-1">Ingresa una Factura Logística primero</p>
                </div>
              ) : logInvoices.map(inv => {
                const isSelected = selectedInvoices.some(i => i.id === inv.id);
                return (
                  <button
                    key={inv.id}
                    onClick={() => {
                      setSelectedInvoices(prev =>
                        isSelected ? prev.filter(i => i.id !== inv.id) : [...prev, inv]
                      );
                      setAllocation(null);
                    }}
                    className={`w-full text-left px-4 py-3 transition-colors flex gap-3 items-start ${isSelected ? 'bg-purple-50 border-l-2' : 'hover:bg-slate-50 border-l-2 border-transparent'}`}
                    style={isSelected ? { borderLeftColor: BRAND_PRIMARY } : {}}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isSelected
                        ? <CheckSquare size={14} style={{ color: BRAND_PRIMARY }} />
                        : <Square size={14} className="text-slate-300" />}
                    </div>
                    <div className="flex-1 flex justify-between items-start">
                      <div>
                        <p className="font-black text-xs" style={{ color: BRAND_PRIMARY }}>{inv.internal_id}</p>
                        <p className="text-[11px] text-slate-600 mt-0.5">{inv.supplier_name}</p>
                        <p className="text-[10px] text-slate-400">{inv.document_number} · {inv.expense_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-xs text-slate-800">${Number(inv.amount).toLocaleString('es-CL')}</p>
                        {inv.allocated > 0 && (
                          <p className="text-[10px] text-orange-500 font-bold">
                            -{Math.round(inv.allocated).toLocaleString('es-CL')} asig.
                          </p>
                        )}
                        <p className="text-[10px] font-black" style={{ color: BRAND_PRIMARY }}>
                          Disp: ${Math.round(inv.remaining).toLocaleString('es-CL')}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Total seleccionado */}
            {selectedInvoices.length > 1 && (
              <div className="border-t border-slate-100 px-4 py-2 bg-purple-50 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total a distribuir</span>
                <span className="font-black text-sm" style={{ color: BRAND_PRIMARY }}>
                  ${selectedInvoices.reduce((s, i) => s + i.remaining, 0).toLocaleString('es-CL')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── SECCIÓN B: Recepciones ── (col 5-9) */}
        <div className="col-span-5 flex flex-col gap-3">
          <div className={`bg-white border rounded-sm overflow-hidden flex flex-col transition-opacity ${selectedInvoices.length === 0 ? 'border-slate-100 opacity-50 pointer-events-none' : 'border-slate-200'}`}>
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">B · Recepciones de Inventario</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{selectedReceipts.length} seleccionada{selectedReceipts.length !== 1 ? 's' : ''}</p>
                </div>
                {selectedReceipts.length > 0 && (
                  <button
                    onClick={() => { setSelectedReceipts([]); setAllocation(null); }}
                    className="text-[10px] text-slate-400 hover:text-slate-600 uppercase font-bold tracking-widest"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              {/* Buscador */}
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text"
                  placeholder="Buscar OC, proveedor o documento..."
                  value={receiptSearch}
                  onChange={(e) => setReceiptSearch(e.target.value)}
                  className="w-full pl-7 pr-3 py-1 text-xs border border-slate-200 rounded-sm focus:outline-none focus:border-[#4C3073] bg-white"
                />
              </div>
            </div>
            {/* Tabla con scroll fijo */}
            <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
              {receipts.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <p className="text-xs font-bold uppercase tracking-widest">Sin recepciones</p>
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-tighter text-slate-500 font-bold sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left">OC #</th>
                      <th className="px-3 py-2 text-left">Proveedor</th>
                      <th className="px-3 py-2 text-left">Documento</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {receipts.filter(rec => {
                      const q = receiptSearch.toLowerCase();
                      if (!q) return true;
                      return (
                        String(rec.po_number || '').includes(q) ||
                        (rec.supplier_name || '').toLowerCase().includes(q) ||
                        (rec.document_number || '').toLowerCase().includes(q)
                      );
                    }).map(rec => {
                      const isChk = selectedReceipts.includes(rec.id);
                      return (
                        <tr
                          key={rec.id}
                          onClick={() => toggleReceipt(rec.id)}
                          className={`cursor-pointer transition-colors ${isChk ? 'bg-purple-50' : 'hover:bg-slate-50'}`}
                        >
                          <td className="px-3 py-2 text-center">
                            {isChk
                              ? <CheckSquare size={14} style={{ color: BRAND_PRIMARY }} />
                              : <Square size={14} className="text-slate-300" />}
                          </td>
                          <td className="px-3 py-2 font-black font-mono" style={{ color: BRAND_PRIMARY }}>
                            #{String(rec.po_number || '').padStart(4, '0')}
                          </td>
                          <td className="px-3 py-2 text-slate-700 max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
                            {rec.supplier_name}
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-[10px] text-slate-500">{rec.document_type}</div>
                            <div className="font-mono font-bold text-slate-700">{rec.document_number}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold">
                            {rec.value > 0
                              ? <span style={{ color: BRAND_ACCENT }}>${Math.round(rec.value).toLocaleString('es-CL')}</span>
                              : <span className="text-slate-300 text-[10px]">Sin val.</span>}
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

        {/* ── SECCIÓN C: Cálculo ── (col 10-12) */}
        <div className="col-span-3 flex flex-col gap-3">
          <div className={`bg-white border rounded-sm overflow-hidden flex flex-col transition-opacity ${selectedInvoices.length === 0 ? 'border-slate-100 opacity-50 pointer-events-none' : 'border-slate-200'}`}>
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">C · Distribución</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Prorrateo por valor</p>
            </div>
            <div className="p-4 flex flex-col gap-3">

              {/* Botón calcular */}
              <button
                onClick={calcAllocation}
                disabled={selectedInvoices.length === 0 || selectedReceipts.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-sm text-xs font-bold uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed border"
                style={selectedInvoices.length > 0 && selectedReceipts.length > 0
                  ? { backgroundColor: BRAND_PRIMARY, color: 'white', borderColor: BRAND_PRIMARY }
                  : { borderColor: '#d1d5db', color: '#9ca3af' }}
              >
                <Calculator size={13} />
                Calcular Prorrateo
              </button>

              {/* Resumen facturas seleccionadas */}
              {selectedInvoices.length > 0 && (
                <div className="bg-purple-50 border border-purple-100 rounded-sm p-3 space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                    {selectedInvoices.length === 1 ? 'Factura seleccionada' : `${selectedInvoices.length} Facturas seleccionadas`}
                  </p>
                  {selectedInvoices.map(inv => (
                    <div key={inv.id} className="flex justify-between items-center">
                      <div>
                        <span className="font-black text-xs" style={{ color: BRAND_PRIMARY }}>{inv.internal_id}</span>
                        <span className="text-[10px] text-slate-500 ml-1">{inv.supplier_name}</span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-700">${Math.round(inv.remaining).toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                  <div className="border-t border-purple-100 pt-1.5 flex justify-between">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Total a distribuir</span>
                    <span className="font-black text-sm" style={{ color: BRAND_PRIMARY }}>
                      ${selectedInvoices.reduce((s, i) => s + i.remaining, 0).toLocaleString('es-CL')}
                    </span>
                  </div>
                </div>
              )}

              {/* Preview de prorrateo */}
              {allocation && (
                <>
                  <div className="border border-slate-200 rounded-sm overflow-hidden">
                    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pre-visualización</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Clic para ver detalle por producto</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {allocation.rows.map((row, i) => (
                        <div key={i}>
                          {/* Fila resumen — clickeable */}
                          <button
                            onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1.5">
                                {expandedRow === i
                                  ? <ChevronUp size={11} className="text-slate-400" />
                                  : <ChevronDown size={11} className="text-slate-400" />}
                                <p className="text-[10px] font-black" style={{ color: BRAND_PRIMARY }}>
                                  OC #{String(row.receipt.po_number || '').padStart(4, '0')}
                                </p>
                              </div>
                              <p className="font-black text-xs" style={{ color: BRAND_PRIMARY }}>
                                ${Math.round(row.amount).toLocaleString('es-CL')}
                              </p>
                            </div>
                            <p className="text-[10px] text-slate-400 pl-4">
                              {(row.pct * 100).toFixed(1)}% · {row.products.length} producto{row.products.length !== 1 ? 's' : ''}
                            </p>
                          </button>
                          {/* Detalle expandible — antes / después por producto */}
                          {expandedRow === i && (
                            <div className="bg-purple-50 border-t border-purple-100 px-3 py-2">
                              <table className="w-full text-[10px] border-collapse">
                                <thead>
                                  <tr className="text-slate-500 uppercase tracking-tighter font-bold">
                                    <th className="text-left pb-1.5 pr-2">Producto</th>
                                    <th className="text-right pb-1.5 pr-1">Actual</th>
                                    <th className="text-right pb-1.5 pr-1">+Flete</th>
                                    <th className="text-right pb-1.5" style={{ color: BRAND_PRIMARY }}>Nuevo</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-purple-100">
                                  {row.products.map(p => (
                                    <tr key={p.id}>
                                      <td className="py-1 pr-2 text-slate-700 font-medium max-w-[90px] overflow-hidden text-ellipsis whitespace-nowrap">{p.name}</td>
                                      <td className="py-1 pr-1 text-right font-mono text-slate-500">${p.currentCost.toLocaleString('es-CL')}</td>
                                      <td className="py-1 pr-1 text-right font-mono text-amber-600">+{p.prodShare.toLocaleString('es-CL')}</td>
                                      <td className="py-1 text-right font-mono font-black" style={{ color: BRAND_PRIMARY }}>${p.newCost.toLocaleString('es-CL')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Warning si alguna recepción no tiene valor */}
                  {allocation.rows.some(r => r.receipt.value === 0) && (
                    <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
                      <AlertCircle size={12} className="text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-amber-700">Algunas recepciones sin valor no recibirán asignación.</p>
                    </div>
                  )}

                  <button
                    onClick={applyAllocation}
                    disabled={saving}
                    className="w-full py-2 rounded-sm text-xs font-bold uppercase text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: BRAND_PRIMARY }}
                  >
                    {saving ? 'Aplicando...' : '✓ Confirmar y Aplicar'}
                  </button>
                  <button
                    onClick={() => { setAllocation(null); setExpandedRow(null); }}
                    className="w-full py-1.5 rounded-sm text-xs font-bold uppercase text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
