import { useState, useEffect, useRef } from 'react';
import { supabase } from '../api/supabaseClient';
import { 
  Plus, 
  Search, 
  ChevronRight, 
  Trash2, 
  Package, 
  Barcode, 
  DollarSign, 
  LayoutGrid,
  Edit,
  ClipboardList,
  Truck,
  Info,
  Layers,
  CheckCircle2,
  ShoppingCart,
  ChevronDown,
  Check,
  Tag,
  AlertTriangle,
  Coins
} from 'lucide-react';

const INITIAL_FORM_STATE = {
  name: '',
  barcode: '',
  internal_reference: '',
  product_type: 'STORABLE',
  can_be_purchased: true,
  can_be_sold: true,
  cost_price: 0,
  price: 0,
  unit_type: 'UN',
  weight: 0,
  volume: 0,
  supplier_lead_time: 0,
  purchase_notes: '',
  receipt_notes: '',
  category_id: null,
  currency: 'CLP'
};

const UNIT_TYPES = ['UN', 'KG', 'LT', 'MT', 'PACK'];
const CURRENCIES = ['CLP', 'USD', 'EUR', 'UF'];
const PRODUCT_TYPES = [
  { id: 'STORABLE', label: 'Almacenable' },
  { id: 'CONSUMABLE', label: 'Consumible' },
  { id: 'SERVICE', label: 'Servicio' }
];

// --- COMPONENTES AUXILIARES ---

// Input Numérico con Separador de Miles
function PriceInput({ value, onChange, name, className = "" }) {
  // Formatear el valor inicial (ej: 1000000 -> 1.000.000)
  const formatValue = (val) => {
    if (val === undefined || val === null || val === '') return '';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const [displayValue, setDisplayValue] = useState(formatValue(value));

  useEffect(() => {
    setDisplayValue(formatValue(value));
  }, [value]);

  const handleInputChange = (e) => {
    let rawValue = e.target.value.replace(/\./g, ''); // Quitar puntos existentes
    
    // Solo permitir números
    if (rawValue !== '' && !/^\d+$/.test(rawValue)) return;

    // Actualizar vista local con puntos
    const formatted = formatValue(rawValue);
    setDisplayValue(formatted);

    // Notificar cambio al padre como número
    onChange({
      target: {
        name: name,
        value: rawValue === '' ? 0 : Number(rawValue)
      }
    });
  };

  return (
    <input
      type="text"
      name={name}
      value={displayValue}
      onChange={handleInputChange}
      className={`w-full rounded-sm border-slate-300 border px-2 py-1.5 text-sm font-black focus:border-indigo-500 outline-none ${className}`}
      placeholder="0"
    />
  );
}

// Selector de Categorías con "Crear al Vuelo"
function CategorySelector({ companyId, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (companyId) fetchCategories();
    
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [companyId]);

  const fetchCategories = async () => {
    const { data } = await supabase.from('product_categories').select('*').eq('company_id', companyId).order('name');
    if (data) setCategories(data);
  };

  const handleCreate = async () => {
    if (!searchTerm) return;
    setLoading(true);
    const upperName = searchTerm.toUpperCase().trim();
    try {
      const exists = categories.find(c => c.name === upperName);
      if (exists) {
        onChange(exists.id);
        setIsOpen(false);
        setSearchTerm("");
        return;
      }

      const { data, error } = await supabase
        .from('product_categories')
        .insert([{ name: upperName, company_id: companyId }])
        .select()
        .single();
      
      if (error) throw error;
      setCategories([...categories, data].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(data.id);
      setIsOpen(false);
      setSearchTerm("");
    } catch (error) {
      alert("Error al crear categoría: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedCat = categories.find(c => c.id === value);
  const filtered = categories.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between border border-slate-300 rounded-sm px-2 py-1.5 bg-white cursor-pointer hover:border-indigo-500 transition-colors"
      >
        <span className={`text-sm ${!selectedCat ? 'text-slate-400 italic' : 'text-slate-900 font-bold'}`}>
          {selectedCat ? selectedCat.name : 'Seleccionar categoría...'}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </div>

      {isOpen && (
        <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-sm shadow-xl max-h-64 overflow-y-auto">
          <div className="sticky top-0 bg-slate-50 p-2 border-b border-slate-200 flex items-center gap-2">
            <Search size={14} className="text-slate-400" />
            <input 
              autoFocus
              className="w-full bg-transparent outline-none text-xs"
              placeholder="Buscar o crear..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="py-1">
            {filtered.map(cat => (
              <div 
                key={cat.id}
                onClick={() => { onChange(cat.id); setIsOpen(false); setSearchTerm(""); }}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between hover:bg-indigo-50 hover:text-indigo-700 ${value === cat.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700'}`}
              >
                {cat.name}
                {value === cat.id && <Check size={14} />}
              </div>
            ))}
            
            {searchTerm && !filtered.find(c => c.name.toLowerCase() === searchTerm.toLowerCase()) && (
              <button 
                onClick={handleCreate}
                disabled={loading}
                className="w-full text-left px-3 py-2 text-xs text-indigo-600 font-bold hover:bg-indigo-50 border-t border-slate-100 flex items-center gap-2"
              >
                <Plus size={14} />
                {loading ? 'Creando...' : `Crear "${searchTerm.toUpperCase()}"`}
              </button>
            )}
            
            {filtered.length === 0 && !searchTerm && (
              <div className="px-3 py-4 text-xs text-slate-400 text-center italic">No hay categorías. Escribe para crear una.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- COMPONENTE PRINCIPAL ---

export default function Productos() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'form'
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'purchase' | 'logistic'
  const [companyId, setCompanyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (companyUser && companyUser.company_id) {
        setCompanyId(companyUser.company_id);
        
        const { data: productsData, error } = await supabase
          .from('products')
          .select('*, product_categories(name)')
          .eq('company_id', companyUser.company_id)
          .order('name', { ascending: true });

        if (!error && productsData) {
          setProducts(productsData);
        } else {
          setProducts([]);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let newValue = value;
    
    if (type === 'checkbox') {
      newValue = checked;
    } else if (name === 'name' || name === 'barcode' || name === 'internal_reference' || name === 'unit_type') {
      newValue = value.toUpperCase();
    }

    setFormData({ ...formData, [name]: newValue });
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM_STATE);
    setActiveTab('general');
    setView('form');
  };

  const handleOpenEdit = (product) => {
    setEditingId(product.id);
    setFormData({
      name: product.name || '',
      barcode: product.barcode || '',
      internal_reference: product.internal_reference || '',
      product_type: product.product_type || 'STORABLE',
      can_be_purchased: product.can_be_purchased !== false,
      can_be_sold: product.can_be_sold !== false,
      cost_price: product.cost_price || 0,
      price: product.price || 0,
      unit_type: product.unit_type || 'UN',
      weight: product.weight || 0,
      volume: product.volume || 0,
      supplier_lead_time: product.supplier_lead_time || 0,
      purchase_notes: product.purchase_notes || '',
      receipt_notes: product.receipt_notes || '',
      category_id: product.category_id || null,
      currency: product.currency || 'CLP'
    });
    setActiveTab('general');
    setView('form');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!companyId) return alert("Error: Empresa no detectada.");
    
    const upperName = formData.name.trim().toUpperCase();
    const isDuplicate = products.some(p => 
      p.id !== editingId && 
      p.name.trim().toUpperCase() === upperName &&
      p.category_id === formData.category_id
    );

    if (isDuplicate) {
      return alert("YA EXISTE UN PRODUCTO CON ESTE NOMBRE EN LA CATEGORÍA SELECCIONADA.");
    }

    setSaving(true);
    try {
      const payload = { ...formData, name: upperName, company_id: companyId };
      if (editingId) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert([payload]);
        if (error) throw error;
      }
      setView('list');
      fetchInitialData();
    } catch (error) {
      console.error('Error guardando producto:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este producto?")) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) alert("Error al eliminar");
    else fetchInitialData();
  };

  const filteredProducts = products.filter(p => {
    const q = searchTerm.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q) || (p.internal_reference || '').toLowerCase().includes(q);
  });

  const formatCurrency = (val, curr) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: curr || 'CLP',
      minimumFractionDigits: curr === 'CLP' ? 0 : 2
    }).format(val || 0);
  };

  if (loading && view === 'list') {
    return <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm font-medium italic">Sincronizando productos...</div>;
  }

  // --- VISTA FORMULARIO ---
  if (view === 'form') {
    return (
      <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 text-sm overflow-hidden absolute inset-0 z-[60]">
        <div className="border-b border-slate-300 px-4 py-1.5 bg-white flex flex-col gap-1 shrink-0 shadow-sm z-10">
          <nav className="flex items-center text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            <span className="hover:text-indigo-600 cursor-pointer" onClick={() => setView('list')}>Inventario</span>
            <ChevronRight size={12} className="mx-1 text-slate-300" />
            <span className="text-slate-900">{editingId ? formData.name : 'Nuevo Producto'}</span>
          </nav>
          
          <div className="flex justify-between items-center h-10">
            <div className="flex gap-2">
              <button 
                onClick={handleSubmit} 
                disabled={saving} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1 rounded-sm text-xs font-black transition-all disabled:opacity-50 uppercase shadow-md flex items-center gap-2 active:scale-95"
              >
                <CheckCircle2 size={16} />
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setView('list')} className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-1 rounded-sm text-xs font-black transition-all uppercase shadow-sm">
                Descartar
              </button>
            </div>

            {/* Selector de Moneda Centralizado */}
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-6 py-1.5 rounded-full shadow-inner">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-tighter">
                <Coins size={14} className="text-indigo-500" />
                <span>Moneda de la Ficha:</span>
              </div>
              <div className="flex gap-1">
                {CURRENCIES.map(curr => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setFormData({...formData, currency: curr})}
                    className={`px-3 py-0.5 rounded-full text-[10px] font-black transition-all border ${
                      formData.currency === curr 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                        : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-48 invisible">Spacer</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100/50 p-6">
          <div className="max-w-5xl mx-auto bg-white border border-slate-300 shadow-2xl rounded-sm overflow-hidden min-h-[700px]">
            <div className="p-10 pb-0">
              <div className="flex justify-between items-start mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Tag size={12} className="text-indigo-500" />
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Nombre del Producto</label>
                  </div>
                  <input 
                    name="name" 
                    required 
                    autoFocus
                    value={formData.name} 
                    onChange={handleChange} 
                    className="text-4xl font-black text-slate-900 border-b-2 border-slate-100 w-full focus:border-indigo-600 outline-none pb-2 placeholder:text-slate-100 uppercase transition-all"
                    placeholder="CARGAR NOMBRE ITEM..."
                  />
                  <div className="flex gap-6 mt-4">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        name="can_be_sold" 
                        checked={formData.can_be_sold} 
                        onChange={handleChange}
                        className="w-4 h-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-transparent active:scale-90 transition-transform"
                      />
                      <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Puede ser vendido</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        name="can_be_purchased" 
                        checked={formData.can_be_purchased} 
                        onChange={handleChange}
                        className="w-4 h-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-transparent active:scale-90 transition-transform"
                      />
                      <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Puede ser comprado</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex border-b-2 border-slate-100 mt-10 gap-10">
                {[
                  { id: 'general', label: 'Información General', icon: Info },
                  { id: 'purchase', label: 'Adquisiciones', icon: ShoppingCart },
                  { id: 'logistic', label: 'Logística', icon: Truck }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`pb-3 text-xs font-black uppercase tracking-[0.15em] flex items-center gap-2 transition-all border-b-4 -mb-[2px] ${
                      activeTab === tab.id 
                        ? 'border-indigo-600 text-indigo-600' 
                        : 'border-transparent text-slate-400 hover:text-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-10 pt-10">
              {activeTab === 'general' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 items-center">
                      <label className="text-slate-500 font-bold text-[11px] uppercase tracking-tighter">Tipo Producto</label>
                      <select 
                        name="product_type" 
                        value={formData.product_type} 
                        onChange={handleChange} 
                        className="col-span-2 block w-full rounded-sm border-slate-300 border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/50 font-black uppercase shadow-sm"
                      >
                        {PRODUCT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-3 items-center">
                      <label className="text-slate-500 font-bold text-[11px] uppercase tracking-tighter">Categoría</label>
                      <div className="col-span-2">
                        <CategorySelector 
                          companyId={companyId} 
                          value={formData.category_id} 
                          onChange={(val) => setFormData({...formData, category_id: val})} 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 bg-slate-50 border border-slate-200 p-8 rounded-sm shadow-inner overflow-hidden relative">
                    <div className="absolute top-2 right-2 opacity-5">
                       <Coins size={100} className="text-indigo-900" />
                    </div>
                    
                    <div className="grid grid-cols-3 items-center relative z-10">
                      <label className="text-slate-500 font-bold text-[11px] uppercase tracking-tighter">Venta Sugerido</label>
                      <div className="col-span-2 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-black uppercase">{formData.currency}</span>
                        <PriceInput 
                           name="price"
                           value={formData.price}
                           onChange={handleChange}
                           className="pl-12 text-lg text-slate-900 border-2"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 items-center relative z-10">
                      <label className="text-slate-500 font-bold text-[11px] uppercase tracking-tighter">Costo Compra</label>
                      <div className="col-span-2 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-black uppercase">{formData.currency}</span>
                        <PriceInput 
                           name="cost_price"
                           value={formData.cost_price}
                           onChange={handleChange}
                           className="pl-12 text-lg text-indigo-700 border-2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 items-center mt-4 pt-4 border-t border-slate-200 relative z-10">
                      <label className="text-slate-500 font-bold text-[11px] uppercase tracking-tighter">Unidad Medida</label>
                      <select 
                        name="unit_type" 
                        value={formData.unit_type} 
                        onChange={handleChange} 
                        className="col-span-2 block w-full rounded-sm border-slate-300 border px-3 py-2 text-sm font-black bg-white shadow-sm uppercase"
                      >
                        {UNIT_TYPES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'purchase' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 items-center">
                      <label className="text-slate-500 font-bold text-[11px] uppercase tracking-tighter">Ref. Interna (SKU)</label>
                      <input 
                        name="internal_reference" 
                        value={formData.internal_reference} 
                        onChange={handleChange} 
                        className="col-span-2 w-full rounded-sm border-slate-300 border px-3 py-2 text-sm focus:border-indigo-500 outline-none font-mono font-bold uppercase bg-slate-50/30"
                        placeholder="ITEM-XX-001"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center">
                      <label className="text-slate-500 font-bold text-[11px] uppercase tracking-tighter">Código Barras</label>
                      <div className="col-span-2 relative">
                        <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          name="barcode" 
                          value={formData.barcode} 
                          onChange={handleChange} 
                          className="w-full rounded-sm border-slate-300 border pl-10 pr-3 py-2 text-sm focus:border-indigo-500 outline-none font-mono font-bold uppercase bg-slate-50/30"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 items-center">
                      <label className="text-slate-500 font-bold text-[11px] uppercase tracking-tighter">Lead Time</label>
                      <div className="col-span-2 flex items-center gap-3">
                        <input 
                          name="supplier_lead_time" 
                          type="number"
                          value={formData.supplier_lead_time} 
                          onChange={handleChange} 
                          className="w-24 rounded-sm border-slate-300 border px-3 py-2 text-sm focus:border-indigo-500 outline-none font-black text-slate-700 bg-slate-50/30"
                        />
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Días</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                       Notas para la Orden de Compra
                    </label>
                    <textarea 
                      name="purchase_notes"
                      value={formData.purchase_notes}
                      onChange={handleChange}
                      rows={6}
                      className="w-full rounded-sm border-slate-300 border p-4 text-sm focus:border-indigo-500 outline-none resize-none bg-slate-50/50 shadow-inner placeholder:italic"
                      placeholder="Indicar requerimientos especiales que deben ir impresos en la OC..."
                    />
                  </div>
                </div>
              )}

              {activeTab === 'logistic' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="grid grid-cols-1 gap-6">
                    <div className="bg-slate-50 p-8 rounded-sm border border-slate-200 shadow-inner space-y-6">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] border-b border-white pb-3 mb-6 flex items-center gap-2">
                         Atributos de Producto
                      </h4>
                      <div className="grid grid-cols-3 items-center">
                        <label className="text-slate-500 font-bold text-[11px] uppercase tracking-tighter">Peso (KG)</label>
                        <div className="col-span-2 flex items-center gap-3">
                          <input 
                            name="weight" 
                            type="number"
                            step="0.01"
                            value={formData.weight} 
                            onChange={handleChange} 
                            className="w-32 rounded-sm border-slate-300 border px-3 py-2 text-sm font-black bg-white shadow-sm"
                          />
                          <span className="text-[10px] text-slate-400 font-black uppercase">kg</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 items-center">
                        <label className="text-slate-500 font-bold text-[11px] uppercase tracking-tighter">Volumen (M³)</label>
                        <div className="col-span-2 flex items-center gap-3">
                          <input 
                            name="volume" 
                            type="number"
                            step="0.001"
                            value={formData.volume} 
                            onChange={handleChange} 
                            className="w-32 rounded-sm border-slate-300 border px-3 py-2 text-sm font-black bg-white shadow-sm"
                          />
                          <span className="text-[10px] text-slate-400 font-black uppercase">m³</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                       Alertas para Recepción (Bodega)
                    </label>
                    <textarea 
                      name="receipt_notes"
                      value={formData.receipt_notes}
                      onChange={handleChange}
                      rows={6}
                      className="w-full rounded-sm border-slate-300 border p-4 text-sm focus:border-indigo-500 outline-none resize-none bg-indigo-50/10 shadow-inner placeholder:italic border-indigo-100"
                      placeholder="Instrucciones críticas para el equipo de almacén..."
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- VISTA LISTA ---
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-50 font-sans text-slate-800 text-sm overflow-hidden">
      <div className="border-b border-slate-300 px-4 py-2 bg-white flex flex-col gap-1 shrink-0 shadow-sm">
        <div className="flex items-center text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">
          <span>Inventario</span>
          <ChevronRight size={12} className="mx-2 text-slate-300" />
          <span className="text-slate-900 border-b-2 border-indigo-600 pb-0.5">Gestión de Productos</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            <button 
               onClick={handleOpenNew} 
               className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-1.5 rounded-sm text-xs font-black transition-all uppercase shadow-lg flex items-center gap-2 active:scale-95"
            >
               <Plus size={16} />
               Nuevo Item
            </button>
          </div>
          <div className="relative w-96 group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="BUSCAR ITEM, SKU O CÓDIGO BARRAS..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="block w-full rounded-sm border-slate-300 border pl-10 pr-4 py-2 text-xs font-bold focus:border-indigo-500 outline-none bg-slate-50 focus:bg-white transition-all uppercase shadow-inner" 
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 scrollbar-thin">
        <div className="border border-slate-300 bg-white shadow-xl rounded-sm overflow-hidden">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-slate-50 border-b-2 border-slate-100 text-[10px] uppercase tracking-[0.1em] text-slate-500 font-black">
              <tr>
                <th className="px-6 py-4 w-1/3">Descripción del Producto</th>
                <th className="px-6 py-4 w-1/4">Ref. / Barcode</th>
                <th className="px-6 py-4 text-right">Costo Neto</th>
                <th className="px-6 py-4 text-right">Precio Venta</th>
                <th className="px-6 py-4 text-center w-24">Unidad</th>
                <th className="px-6 py-4 text-center w-28">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                   <td colSpan="6" className="p-32 text-center text-slate-300 italic flex flex-col items-center gap-4">
                     <Package size={64} className="text-slate-100" />
                     <span className="text-sm font-black uppercase tracking-widest">Sin registros encontrados</span>
                   </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-indigo-50/30 transition-all group cursor-pointer" onClick={() => handleOpenEdit(p)}>
                    <td className="px-6 py-4 border-r border-slate-50">
                      <div className="font-black text-slate-900 text-sm overflow-hidden text-ellipsis whitespace-nowrap uppercase tracking-tighter">{p.name}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Tag size={12} className="text-indigo-400" />
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                          {p.product_categories?.name || 'GENÉRICO'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                      <div className="text-indigo-600 font-black uppercase tracking-wider">{p.internal_reference || 'REF-TBD'}</div>
                      <div className="text-[10px] mt-0.5 font-bold uppercase opacity-60">{p.barcode || 'NO-BARCODE'}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <span className="text-[10px] mr-1.5 text-slate-400 font-black uppercase align-middle">{p.currency || 'CLP'}</span>
                       <span className="font-black text-slate-700 text-sm">{p.cost_price?.toLocaleString('es-CL')}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       {p.can_be_sold ? (
                         <div className="font-black text-indigo-700 text-base">
                           <span className="text-[10px] mr-1.5 text-slate-400 font-black uppercase align-top mt-1">{p.currency || 'CLP'}</span>
                           {p.price?.toLocaleString('es-CL')}
                         </div>
                       ) : (
                         <span className="text-slate-200 text-[9px] font-black uppercase border border-slate-100 px-2 py-1 rounded-sm tracking-widest">No Vendible</span>
                       )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-3 py-1 rounded-sm bg-slate-900 text-white text-[9px] font-black tracking-widest uppercase">
                        {p.unit_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-5 translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                        <button onClick={() => handleOpenEdit(p)} className="p-2 bg-slate-50 rounded-sm text-slate-400 hover:text-indigo-600 hover:bg-white hover:shadow-md transition-all active:scale-95" title="Ver Detalles"><Edit size={16} /></button>
                        <button onClick={() => handleDelete(p.id)} className="p-2 bg-slate-50 rounded-sm text-slate-200 hover:text-red-600 hover:bg-white hover:shadow-md transition-all active:scale-95" title="Eliminar Item"><Trash2 size={16} /></button>
                      </div>
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
