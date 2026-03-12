import { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { Plus, ShoppingCart, Trash2, ArrowLeft, CheckCircle, Clock, FileEdit } from 'lucide-react';
import SearchableSelect from '../components/ui/SearchableSelect';

export default function OrdenesCompra() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState(null);
  const [userId, setUserId] = useState(null);

  // Control de Vistas: 'list' | 'form'
  const [view, setView] = useState('list');

  // Estados del Formulario (Estilo Odoo)
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]); // Lista global de productos del POS
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [lines, setLines] = useState([]); // [{ tempId, product_id, quantity, unit_cost }]

  useEffect(() => {
    fetchInitialData();
  }, [view]); // Recargar al cambiar de vista

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: companyUser } = await supabase.from('company_users').select('company_id').eq('user_id', user.id).single();
      if (!companyUser) return;
      setCompanyId(companyUser.company_id);

      if (view === 'list') {
        const { data: ordersData } = await supabase
          .from('purchase_orders')
          .select('*, suppliers(business_name, name)')
          .order('created_at', { ascending: false });
        if (ordersData) setOrders(ordersData);
      } else {
        // Cargar Proveedores
        const { data: supData } = await supabase.from('suppliers').select('id, business_name, name').eq('company_id', companyUser.company_id);
        if (supData) setSuppliers(supData);
        // Cargar TODOS los productos del POS para la grilla
        const { data: prodData } = await supabase.from('products').select('id, name, barcode, cost_price').eq('company_id', companyUser.company_id).order('name');
        if (prodData) setProducts(prodData);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- Lógica de la Grilla Dinámica ---
  const handleAddLine = () => {
    setLines([...lines, { tempId: Date.now(), product_id: '', quantity: 1, unit_cost: 0 }]);
  };

  const handleRemoveLine = (tempId) => {
    setLines(lines.filter(l => l.tempId !== tempId));
  };

  const handleLineChange = (tempId, field, value) => {
    setLines(lines.map(line => {
      if (line.tempId === tempId) {
        const updatedLine = { ...line, [field]: value };
        // Magia Odoo: Al elegir un producto, auto-completar su precio de costo
        if (field === 'product_id') {
          const p = products.find(prod => prod.id === value);
          if (p) updatedLine.unit_cost = p.cost_price || 0;
        }
        return updatedLine;
      }
      return line;
    }));
  };

  const calculateTotals = () => {
    let subtotal = 0;
    lines.forEach(l => { subtotal += (Number(l.quantity) * Number(l.unit_cost)); });
    const tax = subtotal * 0.19; // IVA
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSaveOrder = async (orderStatus) => {
    if (!selectedSupplier) return alert("Selecciona un proveedor.");
    const validLines = lines.filter(l => l.product_id && l.quantity > 0);
    if (validLines.length === 0) return alert("La orden debe tener al menos un producto válido.");

    const totals = calculateTotals();

    try {
      const { data: newOrder, error: orderError } = await supabase
        .from('purchase_orders')
        .insert([{
          company_id: companyId,
          supplier_id: selectedSupplier,
          created_by: userId,
          status: orderStatus, // 'DRAFT' o 'PENDING'
          issue_date: issueDate,
          expected_delivery_date: expectedDate || null,
          subtotal: totals.subtotal,
          tax_amount: totals.tax,
          total_amount: totals.total
        }])
        .select('id, po_number')
        .single();

      if (orderError) throw orderError;

      const itemsPayload = validLines.map(l => ({
        po_id: newOrder.id,
        product_id: l.product_id,
        quantity: Number(l.quantity),
        unit_cost: Number(l.unit_cost),
        total_cost: Number(l.quantity) * Number(l.unit_cost)
      }));

      const { error: linesError } = await supabase.from('purchase_order_items').insert(itemsPayload);
      if (linesError) throw linesError;

      alert(`${orderStatus === 'DRAFT' ? 'Presupuesto' : 'Orden'} #${String(newOrder.po_number).padStart(4, '0')} guardada correctamente.`);

      setLines([]);
      setSelectedSupplier('');
      setView('list');
    } catch (error) {
      console.error(error);
      alert("Hubo un error al guardar.");
    }
  };

  if (view === 'form') {
    return (
      <div className="h-full flex flex-col bg-slate-50 absolute inset-0 z-40">
        {/* Topbar estilo Odoo */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setView('list')} className="text-slate-500 hover:text-slate-800 transition-colors">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-bold text-slate-800">Nueva Orden de Compra</h1>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setView('list')} className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors">Descartar</button>
            <button onClick={() => handleSaveOrder('DRAFT')} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-2 rounded-lg font-bold shadow-sm transition-colors">Guardar Presupuesto</button>
            <button onClick={() => handleSaveOrder('PENDING')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold shadow-md transition-colors">Confirmar Pedido</button>
          </div>
        </div>

        {/* Formulario Principal */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto bg-white rounded-xl border border-slate-200 shadow-sm">

            {/* Encabezado del Formulario */}
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-slate-200">
              <div className="z-50">
                <label className="block text-sm font-bold text-slate-700 mb-2">Proveedor *</label>
                <SearchableSelect 
                  options={suppliers.map(s => ({
                    value: s.id,
                    label: s.business_name || s.name
                  }))}
                  value={selectedSupplier}
                  onChange={(val) => setSelectedSupplier(val)}
                  placeholder="Selecciona un proveedor..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Fecha de Orden</label>
                  <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="w-full border-b border-slate-200 py-2 outline-none focus:border-indigo-600 bg-transparent text-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Entrega Esperada</label>
                  <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="w-full border-b border-slate-200 py-2 outline-none focus:border-indigo-600 bg-transparent text-slate-800" />
                </div>
              </div>
            </div>

            {/* Pestañas (Simulado Odoo) */}
            <div className="px-8 pt-4 bg-slate-50 border-b border-slate-200">
              <span className="inline-block px-4 py-2 border-b-2 border-indigo-600 text-indigo-700 font-bold text-sm">Productos</span>
            </div>

            {/* Grilla Dinámica */}
            <div className="p-0 pb-32">
              <table className="w-full text-left text-sm relative">
                <thead className="bg-white text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-8 py-3 font-medium w-1/2">Producto</th>
                    <th className="px-4 py-3 font-medium w-32">Cantidad</th>
                    <th className="px-4 py-3 font-medium">Precio Unit. (Neto)</th>
                    <th className="px-4 py-3 font-medium text-right">Subtotal</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, index) => (
                    <tr key={line.tempId} className="hover:bg-slate-50 group">
                      <td className="px-8 py-3">
                        <SearchableSelect 
                          options={products.map(p => ({ 
                            value: p.id, 
                            label: p.name,
                            subLabel: p.barcode ? `Cód: ${p.barcode} | Costo Ref: $${p.cost_price}` : `Costo Ref: $${p.cost_price}`
                          }))}
                          value={line.product_id}
                          onChange={(val) => handleLineChange(line.tempId, 'product_id', val)}
                          placeholder="Escriba para buscar producto..."
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min="1" value={line.quantity} onChange={e => handleLineChange(line.tempId, 'quantity', e.target.value)} className="w-full border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-2 py-1 outline-none text-center font-bold" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min="0" step="0.01" value={line.unit_cost} onChange={e => handleLineChange(line.tempId, 'unit_cost', e.target.value)} className="w-full border border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-2 py-1 outline-none font-mono" />
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-slate-700">
                        ${(Number(line.quantity) * Number(line.unit_cost)).toLocaleString('es-CL')}
                      </td>
                      <td className="px-4 py-2 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleRemoveLine(line.tempId)} className="text-rose-500 hover:bg-rose-50 p-1.5 rounded"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Botón Agregar Línea */}
              <div className="px-8 py-4 border-b border-slate-200">
                <button onClick={handleAddLine} className="text-indigo-600 hover:text-indigo-800 font-bold text-sm flex items-center gap-1">
                  <Plus size={16} /> Agregar un producto
                </button>
              </div>

              {/* Totales */}
              <div className="p-8 bg-white flex justify-end">
                <div className="w-72 space-y-3 text-right">
                  <div className="flex justify-between text-slate-500"><span>Subtotal:</span> <span className="font-mono">${calculateTotals().subtotal.toLocaleString('es-CL')}</span></div>
                  <div className="flex justify-between text-slate-500 border-b border-slate-200 pb-3"><span>IVA (19%):</span> <span className="font-mono">${calculateTotals().tax.toLocaleString('es-CL')}</span></div>
                  <div className="flex justify-between text-slate-800 font-bold text-xl pt-2"><span>Total:</span> <span className="font-mono text-indigo-700">${calculateTotals().total.toLocaleString('es-CL')}</span></div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Vista Lista (Por defecto) ---
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Órdenes de Compra</h1>
          <p className="text-sm text-slate-500 mt-1">Historial de abastecimiento.</p>
        </div>
        <button onClick={() => setView('form')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-colors">
          <Plus size={18} /> Nueva Orden
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Cargando...</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart size={48} className="text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-700">No hay órdenes</h3>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Ref / Fecha</th>
                <th className="px-6 py-4">Proveedor</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800">#{String(o.po_number).padStart(4, '0')}</div>
                    <div className="text-xs text-slate-500">{o.issue_date}</div>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900">{o.suppliers?.business_name || o.suppliers?.name}</td>
                  <td className="px-6 py-4 font-mono font-medium text-indigo-700">${Number(o.total_amount).toLocaleString('es-CL')}</td>
                  <td className="px-6 py-4">
                    {o.status === 'PENDING' && <span className="inline-flex gap-1 items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200"><CheckCircle size={12}/> ORDEN EMITIDA</span>}
                    {o.status === 'DRAFT' && <span className="inline-flex gap-1 items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300"><FileEdit size={12}/> PRESUPUESTO</span>}
                    {o.status === 'RECEIVED' && <span className="inline-flex gap-1 items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><CheckCircle size={12}/> RECIBIDA</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}