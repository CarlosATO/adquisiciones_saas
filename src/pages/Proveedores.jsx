import { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { Plus, Edit, Copy, Building2, Phone, Mail, CreditCard, X, Landmark, MapPin, UserSquare, Check, Search, Package, ChevronRight, Trash2 } from 'lucide-react';
import CatalogoModal from '../components/CatalogoModal';

const INITIAL_FORM_STATE = {
  rut: '', name: '', legal_name: '', fantasy_name: '', business_line: '', address: '',
  contact_name: '', phone: '', email: '', payment_terms: 'CONTADO',
  bank_name: '', bank_account_type: '', bank_account_number: ''
};

// Función utilitaria para formatear el RUT chileno automáticamente
const formatRut = (value) => {
  if (!value) return '';
  let rut = value.toString().replace(/[^0-9kK]/g, '').toUpperCase();
  if (rut.length === 0) return '';
  if (rut.length <= 1) return rut;
  const vd = rut.slice(-1);
  const cuerpo = rut.slice(0, -1);
  const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpoFormateado}-${vd}`;
};

const BRAND_PRIMARY = '#4f46e5'; // Indigo-600
const BRAND_HOVER = '#4338ca'; // Indigo-700
export default function Proveedores() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'form'
  const [companyId, setCompanyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [copiedId, setCopiedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
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

      if (companyUser) setCompanyId(companyUser.company_id);

      const { data: suppliersData, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('company_id', companyUser.company_id)
        .order('name', { ascending: true });

      if (!error && suppliersData) setSuppliers(suppliersData);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'rut') {
      setFormData({ ...formData, [name]: formatRut(value) });
      return;
    }
    const isEmail = name === 'email';
    setFormData({ ...formData, [name]: isEmail ? value : value.toUpperCase() });
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM_STATE);
    setView('form');
  };

  const handleOpenEdit = (supplier) => {
    setEditingId(supplier.id);
    setFormData({
      rut: supplier.rut || '', name: supplier.name || '', legal_name: supplier.legal_name || '',
      fantasy_name: supplier.fantasy_name || '', business_line: supplier.business_line || '',
      address: supplier.address || '', contact_name: supplier.contact_name || '',
      phone: supplier.phone || '', email: supplier.email || '', payment_terms: supplier.payment_terms || 'CONTADO',
      bank_name: supplier.bank_name || '', bank_account_type: supplier.bank_account_type || '', bank_account_number: supplier.bank_account_number || ''
    });
    setView('form');
  };

  const handleOpenCatalog = (supplier) => {
    setSelectedSupplier(supplier);
    setCatalogModalOpen(true);
  };

  const handleCopy = (s) => {
    const text = `PROVEEDOR: ${s.name}\nRUT: ${s.rut || 'N/A'}\nGIRO: ${s.business_line || 'N/A'}\nDIRECCIÓN: ${s.address || 'N/A'}\nCONTACTO: ${s.contact_name || 'N/A'} (${s.phone || ''})\nEMAIL: ${s.email || 'N/A'}\nBANCO: ${s.bank_name || 'N/A'} / ${s.bank_account_type || ''} / CTA: ${s.bank_account_number || ''}`;
    navigator.clipboard.writeText(text);
    setCopiedId(s.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!companyId) return alert("Error: Empresa no detectada.");
    setSaving(true);

    try {
      const payload = { ...formData, company_id: companyId };
      if (editingId) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert([payload]);
        if (error) throw error;
      }
      setView('list');
      fetchInitialData();
    } catch (error) {
      console.error('Error guardando proveedor:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este proveedor?")) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) alert("Error al eliminar");
    else fetchInitialData();
  };

  const filteredSuppliers = suppliers.filter(s => {
    const q = searchTerm.toLowerCase();
    return (s.name || '').toLowerCase().includes(q) || (s.rut || '').toLowerCase().includes(q);
  });

  if (loading && view === 'list') {
    return <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm font-medium">Cargando proveedores...</div>;
  }

  // --- VISTA FORMULARIO ---
  if (view === 'form') {
    return (
      <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 text-sm overflow-hidden absolute inset-0 z-[60]">
        {/* Control Panel Superior style Odoo */}
        <div className="border-b border-slate-300 px-4 py-1.5 bg-white flex flex-col gap-1 shrink-0">
          <nav className="flex items-center text-[11px] text-slate-500 uppercase tracking-wider font-medium">
            <span className="hover:text-indigo-600 cursor-pointer" onClick={() => setView('list')}>Proveedores</span>
            <ChevronRight size={12} className="mx-1" />
            <span className="text-slate-900">{editingId ? formData.name : 'Nuevo'}</span>
          </nav>
          <div className="flex justify-between items-center">
            <div className="flex gap-1">
              <button 
                onClick={handleSubmit} 
                disabled={saving} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-sm text-xs font-bold transition-colors disabled:opacity-50 uppercase shadow-sm"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setView('list')} className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-3 py-1 rounded-sm text-xs font-bold transition-colors uppercase shadow-sm">
                Descartar
              </button>
            </div>
          </div>
        </div>

        {/* CONTENIDO DEL FORMULARIO Odoo Style */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
          <div className="max-w-6xl mx-auto bg-white border border-slate-300 shadow-sm rounded-sm">
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
              <div className="space-y-3">
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Nombre Comercial</label>
                  <input name="name" required value={formData.name} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Razón Social</label>
                  <input name="legal_name" value={formData.legal_name} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">RUT</label>
                  <input name="rut" required value={formData.rut} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono bg-slate-50/30" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Giro / Actividad</label>
                  <input name="business_line" value={formData.business_line} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Plazos Pago</label>
                  <select name="payment_terms" value={formData.payment_terms} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30">
                    <option value="CONTADO">CONTADO</option>
                    <option value="CREDITO_15_DIAS">CRÉDITO 15D</option>
                    <option value="CREDITO_30_DIAS">CRÉDITO 30D</option>
                    <option value="CREDITO_45_DIAS">CRÉDITO 45D</option>
                    <option value="CONSIGNACION">CONSIGNACIÓN</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 items-start">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 pt-1 uppercase tracking-tighter">Dirección</label>
                  <textarea name="address" value={formData.address} onChange={handleChange} rows={2} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30" placeholder="Calle, Número, Comuna..." />
                </div>
              </div>
            </div>

            <div className="px-8 border-b border-slate-200 bg-slate-50/50">
              <div className="inline-block border-b-2 border-indigo-600 text-indigo-700 px-4 py-2 font-bold text-xs uppercase tracking-widest">Información de Contacto</div>
            </div>

            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
              <div className="space-y-3">
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Contacto</label>
                  <input name="contact_name" value={formData.contact_name} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Teléfono</label>
                  <input name="phone" value={formData.phone} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono bg-slate-50/30" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Email</label>
                  <input name="email" type="email" value={formData.email} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Entidad Bancaria</label>
                  <input name="bank_name" value={formData.bank_name} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Tipo Cuenta</label>
                  <select name="bank_account_type" value={formData.bank_account_type} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30">
                    <option value="">SELECCIONE...</option>
                    <option value="CUENTA CORRIENTE">CUENTA CORRIENTE</option>
                    <option value="CUENTA VISTA">CUENTA VISTA</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">N° de Cuenta</label>
                  <input name="bank_account_number" value={formData.bank_account_number} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono bg-slate-50/30" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-50 font-sans text-slate-800 text-sm overflow-hidden">
      {/* Control Panel List View Odoo */}
      <div className="border-b border-slate-300 px-4 py-1.5 bg-white flex flex-col gap-1 shrink-0">
        <nav className="flex items-center text-[10px] text-slate-500 uppercase tracking-widest font-bold">
          <span className="hover:text-indigo-600 cursor-pointer">Compras</span>
          <ChevronRight size={10} className="mx-1" />
          <span className="text-slate-900">Proveedores</span>
        </nav>
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <button 
               onClick={handleOpenNew} 
               className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-sm text-xs font-bold transition-colors uppercase shadow-sm"
            >
               Nuevo
            </button>
          </div>
          <div className="relative w-64">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar proveedor..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="block w-full rounded-sm border-slate-300 border pl-8 pr-3 py-1 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/50" 
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <div className="border border-slate-300 bg-white">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-slate-100 border-b border-slate-300 text-[10px] uppercase tracking-tighter text-slate-600 font-bold">
              <tr>
                <th className="px-2 py-1.5 w-1/3">Nombre / Razón Social</th>
                <th className="px-2 py-1.5">Persona de Contacto</th>
                <th className="px-2 py-1.5">Datos de Pago</th>
                <th className="px-2 py-1.5 text-center w-24">Condición</th>
                <th className="px-2 py-1.5 text-center w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSuppliers.map((s) => (
                <tr key={s.id} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer text-xs" onClick={() => handleOpenEdit(s)}>
                  <td className="px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                    <div className="font-bold text-slate-900">{s.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{formatRut(s.rut) || '-'}</div>
                  </td>
                  <td className="px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                    <div className="text-slate-700 font-medium">{s.contact_name || '-'}</div>
                    <div className="text-[10px] text-slate-500">{s.phone}</div>
                  </td>
                  <td className="px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                    <div className="text-slate-700">{s.bank_name || '-'}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{s.bank_account_number}</div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="inline-flex px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-700 text-[9px] font-black uppercase border border-slate-300">{s.payment_terms}</span>
                  </td>
                  <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleOpenCatalog(s)} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Ver Catálogo"><Package size={14} /></button>
                      <button onClick={() => handleCopy(s)} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Copiar Datos">{copiedId === s.id ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}</button>
                      <button onClick={() => handleDelete(s.id)} className="text-slate-300 hover:text-red-600 transition-colors" title="Eliminar"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CatalogoModal isOpen={catalogModalOpen} onClose={() => setCatalogModalOpen(false)} supplier={selectedSupplier} companyId={companyId} />
    </div>
  );
}