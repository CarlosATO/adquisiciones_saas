import { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { Plus, ShoppingCart, Trash2, ArrowLeft, CheckCircle, Clock, FileEdit, Search, ChevronRight, History } from 'lucide-react';
import SearchableSelect from '../components/ui/SearchableSelect';

const BRAND_PRIMARY = '#4C3073';

export default function OrdenesCompra() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState(null);
  const [userId, setUserId] = useState(null);

  // Control de Vistas: 'list' | 'form'
  const [view, setView] = useState('list');
  const [searchTerm, setSearchTerm] = useState('');

  // Estados del Formulario
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]); 
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [lines, setLines] = useState([]); 
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, [view]);

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
        const { data: supData } = await supabase.from('suppliers').select('id, business_name, name').eq('company_id', companyUser.company_id);
        if (supData) setSuppliers(supData);
        const { data: prodData } = await supabase.from('products').select('id, name, barcode, cost_price').eq('company_id', companyUser.company_id).order('name');
        if (prodData) setProducts(prodData);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

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
    const tax = subtotal * 0.19; 
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSaveOrder = async (orderStatus) => {
    if (!selectedSupplier) return alert("Selecciona un proveedor.");
    const validLines = lines.filter(l => l.product_id && l.quantity > 0);
    if (validLines.length === 0) return alert("La orden debe tener al menos un producto válido.");

    setSaving(true);
    const totals = calculateTotals();

    try {
      const { data: newOrder, error: orderError } = await supabase
        .from('purchase_orders')
        .insert([{
          company_id: companyId,
          supplier_id: selectedSupplier,
          created_by: userId,
          status: orderStatus,
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
    } finally {
      setSaving(false);
    }
  };

  const filteredOrders = orders.filter(o => {
    const search = searchTerm.toLowerCase();
    const supName = (o.suppliers?.business_name || o.suppliers?.name || '').toLowerCase();
    const poNum = String(o.po_number).toLowerCase();
    return supName.includes(search) || poNum.includes(search);
  });

  if (loading && view === 'list') {
    return <div className="h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm font-medium">Cargando órdenes...</div>;
  }

  // --- VISTA FORMULARIO ---
  if (view === 'form') {
    const totals = calculateTotals();
    return (
      <div className="flex flex-col h-screen bg-white font-sans text-gray-800 text-sm overflow-hidden absolute inset-0 z-[60]">
        
        {/* CONTROL PANEL SUPERIOR (Odoo Page Structure) */}
        <div className="border-b border-gray-200 px-4 py-2 bg-white flex flex-col gap-2 shadow-sm shrink-0">
            <div className="flex items-center text-sm text-gray-600">
                <span className="hover:text-gray-900 cursor-pointer" onClick={() => setView('list')}>Órdenes de Compra</span>
                <ChevronRight size={14} className="mx-1" />
                <span className="font-semibold text-gray-800">Nueva Orden</span>
            </div>
            
            <div className="flex justify-between items-center mt-1">
                <div className="flex gap-2">
                    <button 
                        onClick={() => handleSaveOrder('PENDING')}
                        disabled={saving}
                        style={{ backgroundColor: BRAND_PRIMARY }} className="bg-brand-primary hover:bg-brand-primary-dark text-white px-4 py-1.5 rounded-sm text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {saving ? 'Confirmando...' : 'Confirmar Pedido'}
                    </button>
                    <button
                        onClick={() => handleSaveOrder('DRAFT')}
                        disabled={saving}
                        className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-1.5 rounded-sm text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        Guardar Presupuesto
                    </button>
                    <button
                        onClick={() => setView('list')}
                        className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-1.5 rounded-sm text-sm font-medium transition-colors"
                    >
                        Descartar
                    </button>
                </div>
            </div>
        </div>

        {/* CONTENIDO DEL FORMULARIO */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-5xl mx-auto bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden">
            
            {/* Header del Formulario estilo Odoo 2 columnas */}
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                {/* Columna Izquierda */}
                <div className="space-y-4">
                    <div className="grid grid-cols-3 items-center">
                        <label className="text-gray-600 font-medium text-right pr-4">Proveedor</label>
                        <div className="col-span-2">
                            <SearchableSelect 
                                options={suppliers.map(s => ({
                                    value: s.id,
                                    label: s.business_name || s.name
                                }))}
                                value={selectedSupplier}
                                onChange={(val) => setSelectedSupplier(val)}
                                placeholder="Seleccionar..."
                            />
                        </div>
                    </div>
                </div>

                {/* Columna Derecha */}
                <div className="space-y-4">
                    <div className="grid grid-cols-3 items-center">
                        <label className="text-gray-600 font-medium text-right pr-4">Fecha Orden</label>
                        <input 
                            type="date" 
                            value={issueDate} 
                            onChange={e => setIssueDate(e.target.value)} 
                            className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none"
                        />
                    </div>
                    <div className="grid grid-cols-3 items-center">
                        <label className="text-gray-600 font-medium text-right pr-4">Entrega Esperada</label>
                        <input 
                            type="date" 
                            value={expectedDate} 
                            onChange={e => setExpectedDate(e.target.value)} 
                            className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Pestañas */}
            <div className="px-8 border-b border-gray-200 bg-white">
                <div className="inline-block border-b-2 border-brand-primary text-brand-primary px-4 py-2 font-medium text-sm">
                    Líneas de la Orden
                </div>
            </div>

            {/* Grilla de Productos */}
            <div className="p-0 min-h-[300px]">
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-8 py-2 text-gray-600 font-medium">Producto</th>
                            <th className="px-4 py-2 text-gray-600 font-medium w-32 text-right">Cantidad</th>
                            <th className="px-4 py-2 text-gray-600 font-medium w-40 text-right">Costo Unit.</th>
                            <th className="px-4 py-2 text-gray-600 font-medium w-40 text-right">Subtotal</th>
                            <th className="px-4 py-2 w-12"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {lines.map((line) => (
                            <tr key={line.tempId} className="hover:bg-gray-50 group">
                                <td className="px-8 py-2">
                                    <SearchableSelect 
                                        options={products.map(p => ({ 
                                            value: p.id, 
                                            label: p.name,
                                            subLabel: p.barcode ? `SKU: ${p.barcode}` : ""
                                        }))}
                                        value={line.product_id}
                                        onChange={(val) => handleLineChange(line.tempId, 'product_id', val)}
                                        placeholder="Buscar producto..."
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <input 
                                        type="number" 
                                        value={line.quantity} 
                                        onChange={e => handleLineChange(line.tempId, 'quantity', e.target.value)} 
                                        className="w-full text-right bg-transparent border-b border-transparent focus:border-brand-primary outline-none px-1"
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <input 
                                        type="number" 
                                        value={line.unit_cost} 
                                        onChange={e => handleLineChange(line.tempId, 'unit_cost', e.target.value)} 
                                        className="w-full text-right bg-transparent border-b border-transparent focus:border-brand-primary outline-none px-1"
                                    />
                                </td>
                                <td className="px-4 py-2 text-right font-medium text-gray-700">
                                    ${(Number(line.quantity) * Number(line.unit_cost)).toLocaleString('es-CL')}
                                </td>
                                <td className="px-4 py-2 text-center text-gray-300 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveLine(line.tempId)}>
                                    <Trash2 size={14} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="px-8 py-3 bg-white">
                    <button 
                        onClick={handleAddLine} 
                        className="text-brand-primary hover:text-brand-primary-dark font-medium text-sm flex items-center gap-1 transition-colors"
                    >
                        <Plus size={16} /> Agregar línea
                    </button>
                </div>

                {/* Totales estilo Odoo */}
                <div className="p-8 flex justify-end">
                    <div className="w-80 space-y-1 text-right border-t border-gray-100 pt-4">
                        <div className="flex justify-between text-gray-600">
                            <span>Subtotal:</span>
                            <span>${totals.subtotal.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                            <span>IVA (19%):</span>
                            <span>${totals.tax.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="flex justify-between text-gray-900 font-bold text-lg pt-2 border-t border-gray-200 mt-2">
                            <span>Total:</span>
                            <span className="text-brand-primary">${totals.total.toLocaleString('es-CL')}</span>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- VISTA LISTA (Estilo Odoo List View) ---
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-white font-sans text-gray-800 text-sm overflow-hidden">
      
        {/* Control Panel Superior */}
        <div className="border-b border-gray-200 px-4 py-2 bg-white flex flex-col gap-2 shrink-0">
            <div className="flex items-center text-sm text-gray-600">
                <span className="hover:text-gray-900 cursor-pointer">Compras</span>
                <ChevronRight size={14} className="mx-1" />
                <span className="font-semibold text-gray-800">Órdenes de Compra</span>
            </div>
            
            <div className="flex justify-between items-center mt-1">
                <div className="flex gap-2">
                    <button 
                        onClick={() => { setView('form'); setLines([{ tempId: Date.now(), product_id: '', quantity: 1, unit_cost: 0 }]); }}
                        style={{ backgroundColor: BRAND_PRIMARY }} className="bg-brand-primary hover:bg-brand-primary-dark text-white px-4 py-1.5 rounded-sm text-sm font-medium transition-colors"
                    >
                        Nuevo
                    </button>
                </div>

                <div className="relative w-72">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por referencia o proveedor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full rounded-sm border-gray-300 border pl-8 pr-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none"
                    />
                </div>
            </div>
        </div>

        {/* Tabla List View */}
        <div className="flex-1 overflow-auto bg-white p-4">
            <div className="border border-gray-200 rounded-sm">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-3 py-2 text-gray-600 font-medium w-32">Referencia</th>
                            <th className="px-3 py-2 text-gray-600 font-medium">Proveedor</th>
                            <th className="px-3 py-2 text-gray-600 font-medium">Fecha</th>
                            <th className="px-3 py-2 text-gray-600 font-medium text-right">Total</th>
                            <th className="px-3 py-2 text-gray-600 font-medium text-center">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-12 text-center text-gray-500">
                                    <ShoppingCart size={40} className="mx-auto text-gray-200 mb-3" />
                                    No se encontraron órdenes de compra.
                                </td>
                            </tr>
                        ) : (
                            filteredOrders.map(o => (
                                <tr key={o.id} className="hover:bg-gray-50 transition-colors group cursor-pointer">
                                    <td className="px-3 py-2 font-semibold text-gray-700">
                                        #{String(o.po_number).padStart(4, '0')}
                                    </td>
                                    <td className="px-3 py-2 text-gray-800 font-medium">
                                        {o.suppliers?.business_name || o.suppliers?.name}
                                    </td>
                                    <td className="px-3 py-2 text-gray-600">
                                        {o.issue_date}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                                        ${Number(o.total_amount).toLocaleString('es-CL')}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {o.status === 'PENDING' && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase tracking-wider">
                                                Orden Emitida
                                            </span>
                                        )}
                                        {o.status === 'DRAFT' && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200 uppercase tracking-wider">
                                                Presupuesto
                                            </span>
                                        )}
                                        {o.status === 'RECEIVED' && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold bg-green-50 text-green-700 border border-green-100 uppercase tracking-wider">
                                                Recibida
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
}