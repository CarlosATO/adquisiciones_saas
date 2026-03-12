import { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { X, Package, Plus, Trash2, Tag } from 'lucide-react';

export default function CatalogoModal({ isOpen, onClose, supplier, companyId }) {
  const [posProducts, setPosProducts] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estado del formulario
  const [selectedProductId, setSelectedProductId] = useState('');
  const [supplierSku, setSupplierSku] = useState('');
  const [costPrice, setCostPrice] = useState('');

  useEffect(() => {
    if (isOpen && supplier) {
      fetchData();
    }
  }, [isOpen, supplier]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Traer todos los productos del POS de esta empresa
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name, barcode, cost_price')
        .eq('company_id', companyId)
        .eq('active', true) // Asegurar traer solo activos
        .order('name', { ascending: true });
      
      if (prodError) console.error("Error products:", prodError);
      if (products) setPosProducts(products);

      // 2. Traer el catálogo actual de este proveedor
      fetchCatalogItems();
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogItems = async () => {
    const { data: items, error: itemsError } = await supabase
      .from('supplier_products')
      .select('*, products(name, barcode)')
      .eq('supplier_id', supplier.id)
      .order('last_updated', { ascending: false });
    
    if (itemsError) console.error("Error items:", itemsError);
    if (items) setCatalogItems(items);
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!selectedProductId || !costPrice) return;

    const posProduct = posProducts.find(p => p.id === selectedProductId);

    const payload = {
      company_id: companyId,
      supplier_id: supplier.id,
      product_id: selectedProductId,
      product_name: posProduct.name, // El schema dice 'product_name'
      supplier_sku: supplierSku ? supplierSku.toUpperCase() : null,
      cost_price: parseFloat(costPrice)
    };

    try {
      const { error } = await supabase.from('supplier_products').insert([payload]);
      if (error) throw error;
      
      // Limpiar formulario y recargar tabla
      setSelectedProductId('');
      setSupplierSku('');
      setCostPrice('');
      fetchCatalogItems();
    } catch (error) {
      alert("Error al agregar producto al catálogo. Es posible que ya exista.");
      console.error(error);
    }
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm("¿Quitar producto de este catálogo?")) return;
    await supabase.from('supplier_products').delete().eq('id', id);
    fetchCatalogItems();
  };

  if (!isOpen || !supplier) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Package className="text-indigo-600" />
              Catálogo de Compra
            </h2>
            <p className="text-sm text-slate-500 mt-1">Proveedor: <span className="font-semibold text-slate-700">{supplier.name}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Lado Izquierdo: Formulario */}
          <div className="w-full md:w-1/3 bg-slate-50 p-6 border-r border-slate-200 overflow-y-auto">
            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Vincular Producto</h3>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Producto del Local *</label>
                <select 
                  required 
                  value={selectedProductId} 
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 bg-white text-sm"
                >
                  <option value="">Seleccione un producto...</option>
                  {posProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} {p.barcode ? `(${p.barcode})` : ''}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Costo Neto Cotizado ($) *</label>
                <input 
                  type="number" 
                  required 
                  min="0"
                  step="0.01"
                  value={costPrice} 
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 font-mono text-sm" 
                  placeholder="Ej: 1200" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">SKU Proveedor (Opcional)</label>
                <input 
                  type="text" 
                  value={supplierSku} 
                  onChange={(e) => setSupplierSku(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-sm" 
                  placeholder="Código interno del proveedor" 
                />
              </div>

              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors mt-2">
                <Plus size={18} /> Agregar al Catálogo
              </button>
            </form>
          </div>

          {/* Lado Derecho: Lista del Catálogo */}
          <div className="w-full md:w-2/3 p-6 overflow-y-auto bg-white">
            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider flex items-center gap-2">
              <Tag size={16} className="text-indigo-500"/> Productos Vinculados
            </h3>
            
            {loading ? (
              <div className="text-center text-slate-500 py-8">Cargando catálogo...</div>
            ) : catalogItems.length === 0 ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-xl">
                <Package size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-600 font-medium">Catálogo vacío</p>
                <p className="text-sm text-slate-400 mt-1">Este proveedor aún no tiene productos asignados a su lista de compras.</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-medium">Producto</th>
                      <th className="px-4 py-3 font-medium">SKU Prov.</th>
                      <th className="px-4 py-3 font-medium text-right">Costo Neto</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {catalogItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{item.product_name}</div>
                          <div className="text-xs text-slate-500">{item.products?.barcode || 'Sin CB'}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{item.supplier_sku || '-'}</td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-indigo-700">
                          ${Number(item.cost_price).toLocaleString('es-CL')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDeleteItem(item.id)} className="text-rose-400 hover:text-rose-600 p-1 rounded transition-colors" title="Quitar">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
