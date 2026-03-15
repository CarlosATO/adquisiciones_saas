import { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { Anchor, ChevronRight, CheckSquare, Square, Calculator, CheckCircle, X, AlertCircle } from 'lucide-react';

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
  const [selectedInvoice, setSelectedInvoice]   = useState(null);
  const [selectedReceipts, setSelectedReceipts] = useState([]); // array of receipt ids
  const [allocation, setAllocation]             = useState(null); // preview data
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

      const { data: cu } = await supabase
        .from('company_users').select('company_id').eq('user_id', user.id).single();
      if (!cu) return;
      setCompanyId(cu.company_id);

      // 1. Facturas LOG- con su asignación acumulada
      const { data: expenses } = await supabase
        .from('expenses')
        .select('id, internal_id, supplier_id, document_number, amount, expense_date, description, suppliers(business_name, name)')
        .eq('company_id', cu.company_id)
        .like('internal_id', 'LOG-%')
        .gt('amount', 0)
        .order('internal_id', { ascending: false });

      // Suma ya asignada por expense
      const { data: allocations } = await supabase
        .from('landed_cost_allocations')
        .select('expense_id, allocated_amount')
        .eq('company_id', cu.company_id);

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
        .eq('company_id', cu.company_id)
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

        const enriched = recs.map(rec => {
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
            value,          // valor monetario de la recepción (sin IVA)
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
  const calcAllocation = () => {
    if (!selectedInvoice) return alert('Seleccione una factura logística.');
    if (selectedReceipts.length === 0) return alert('Seleccione al menos una recepción.');

    const chosen = receipts.filter(r => selectedReceipts.includes(r.id));
    const totalValue = chosen.reduce((s, r) => s + r.value, 0);

    if (totalValue === 0) return alert('Las recepciones seleccionadas no tienen valor calculable. Verifica los costos de la OC.');

    const toDistribute = selectedInvoice.remaining;

    const rows = chosen.map(rec => {
      const pct    = rec.value / totalValue;
      const amount = Math.round(pct * toDistribute);
      return { receipt: rec, pct, amount };
    });

    // Ajuste de redondeo al último ítem
    const sumRounded = rows.reduce((s, r) => s + r.amount, 0);
    const diff = Math.round(toDistribute) - sumRounded;
    if (rows.length > 0) rows[rows.length - 1].amount += diff;

    setAllocation({ rows, toDistribute, totalValue });
  };

  /* ── APLICAR PRORRATEO ──────────────────────────────────── */
  const applyAllocation = async () => {
    if (!allocation) return;
    setSaving(true);
    try {
      for (const row of allocation.rows) {
        const { receipt, amount } = row;
        if (amount <= 0) continue;

        // 1. Insertar en landed_cost_allocations
        const { error: lcaErr } = await supabase.from('landed_cost_allocations').insert([{
          company_id:       companyId,
          expense_id:       selectedInvoice.id,
          receipt_id:       receipt.id,
          allocated_amount: amount,
          created_by:       userId,
        }]);
        if (lcaErr) throw lcaErr;

        // 2. Prorratear el flete entre los productos de esta recepción
        const recValue = receipt.value;
        for (const mov of receipt.movements) {
          const item      = receipt.poItems.find(i => i.product_id === mov.product_id);
          if (!item) continue;
          const prodValue = Number(mov.quantity) * Number(item.unit_cost);
          const prodShare = recValue > 0 ? (prodValue / recValue) * amount : 0;
          if (prodShare <= 0) continue;

          // 3. Obtener stock y cost_price actuales
          const { data: prod } = await supabase
            .from('products')
            .select('id, stock_quantity, cost_price')
            .eq('id', mov.product_id)
            .single();

          if (!prod || Number(prod.stock_quantity) <= 0) continue;

          // 4. Actualizar costo promedio ponderado
          const currentStock = Number(prod.stock_quantity);
          const currentCost  = Number(prod.cost_price || 0);
          const newCost      = ((currentStock * currentCost) + prodShare) / currentStock;

          await supabase.from('products')
            .update({ cost_price: Math.round(newCost * 100) / 100 })
            .eq('id', prod.id);
        }
      }

      setSuccessMsg(`✓ Prorrateo aplicado correctamente. $${Math.round(selectedInvoice.remaining).toLocaleString('es-CL')} distribuidos entre ${allocation.rows.length} recepción(es).`);
      setAllocation(null);
      setSelectedInvoice(null);
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
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">A · Factura Logística</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Selecciona el gasto a distribuir</p>
            </div>
            <div className="flex-1 overflow-auto divide-y divide-slate-50">
              {logInvoices.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <Anchor size={28} className="mx-auto mb-2 text-slate-200" />
                  <p className="text-xs font-bold uppercase tracking-widest">Sin facturas disponibles</p>
                  <p className="text-[11px] mt-1">Ingresa una Factura Logística primero</p>
                </div>
              ) : logInvoices.map(inv => {
                const isSelected = selectedInvoice?.id === inv.id;
                return (
                  <button
                    key={inv.id}
                    onClick={() => { setSelectedInvoice(isSelected ? null : inv); setAllocation(null); setSelectedReceipts([]); }}
                    className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? 'bg-purple-50 border-l-2' : 'hover:bg-slate-50 border-l-2 border-transparent'}`}
                    style={isSelected ? { borderLeftColor: BRAND_PRIMARY } : {}}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-black text-xs" style={{ color: BRAND_PRIMARY }}>{inv.internal_id}</p>
                        <p className="text-[11px] text-slate-600 mt-0.5">{inv.supplier_name}</p>
                        <p className="text-[10px] text-slate-400">{inv.document_number} · {inv.expense_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-xs text-slate-800">${Number(inv.amount).toLocaleString('es-CL')}</p>
                        {inv.allocated > 0 && (
                          <p className="text-[10px] text-orange-500 font-bold">
                            -${Math.round(inv.allocated).toLocaleString('es-CL')} asig.
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
          </div>
        </div>

        {/* ── SECCIÓN B: Recepciones ── (col 5-9) */}
        <div className="col-span-5 flex flex-col gap-3">
          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
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
            <div className="flex-1 overflow-auto">
              {receipts.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <p className="text-xs font-bold uppercase tracking-widest">Sin recepciones</p>
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-tighter text-slate-500 font-bold sticky top-0">
                    <tr>
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left">OC #</th>
                      <th className="px-3 py-2 text-left">Proveedor</th>
                      <th className="px-3 py-2 text-left">Documento</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {receipts.map(rec => {
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
          <div className="bg-white border border-slate-200 rounded-sm overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">C · Distribución</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Prorrateo por valor</p>
            </div>
            <div className="p-4 flex flex-col gap-3">

              {/* Botón calcular */}
              <button
                onClick={calcAllocation}
                disabled={!selectedInvoice || selectedReceipts.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-sm text-xs font-bold uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed border"
                style={selectedInvoice && selectedReceipts.length > 0
                  ? { backgroundColor: BRAND_PRIMARY, color: 'white', borderColor: BRAND_PRIMARY }
                  : { borderColor: '#d1d5db', color: '#9ca3af' }}
              >
                <Calculator size={13} />
                Calcular Prorrateo
              </button>

              {/* Resumen factura seleccionada */}
              {selectedInvoice && (
                <div className="bg-purple-50 border border-purple-100 rounded-sm p-3 space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-purple-400">Factura seleccionada</p>
                  <p className="font-black text-sm" style={{ color: BRAND_PRIMARY }}>{selectedInvoice.internal_id}</p>
                  <p className="text-[11px] text-slate-600">{selectedInvoice.supplier_name}</p>
                  <div className="border-t border-purple-100 pt-1.5 flex justify-between">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">A distribuir</span>
                    <span className="font-black text-sm" style={{ color: BRAND_PRIMARY }}>
                      ${Math.round(selectedInvoice.remaining).toLocaleString('es-CL')}
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
                    </div>
                    <div className="divide-y divide-slate-50">
                      {allocation.rows.map((row, i) => (
                        <div key={i} className="px-3 py-2">
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-black text-indigo-700">
                              OC #{String(row.receipt.po_number || '').padStart(4, '0')}
                            </p>
                            <p className="font-black text-xs" style={{ color: BRAND_PRIMARY }}>
                              ${Math.round(row.amount).toLocaleString('es-CL')}
                            </p>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            {(row.pct * 100).toFixed(1)}% del total
                          </p>
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
                    onClick={() => setAllocation(null)}
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
