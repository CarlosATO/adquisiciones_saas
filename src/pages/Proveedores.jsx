import { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { Plus, Edit, Copy, Building2, Phone, Mail, CreditCard, X, Landmark, MapPin, UserSquare, Check, Search, Package, ChevronRight, Trash2 } from 'lucide-react';
import CatalogoModal from '../components/CatalogoModal';

const INITIAL_FORM_STATE = {
  rut: '', name: '', fantasy_name: '', giro: '', address: '',
  contact_person: '', phone: '', email: '', payment_terms: 'AL CONTADO',
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

const BRAND_PRIMARY = '#4C3073';
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
      rut: supplier.rut || '', name: supplier.name || '', fantasy_name: supplier.fantasy_name || '',
      giro: supplier.giro || '', address: supplier.address || '', contact_person: supplier.contact_person || '',
      phone: supplier.phone || '', email: supplier.email || '', payment_terms: supplier.payment_terms || 'AL CONTADO',
      bank_name: supplier.bank_name || '', bank_account_type: supplier.bank_account_type || '', bank_account_number: supplier.bank_account_number || ''
    });
    setView('form');
  };

  const handleOpenCatalog = (supplier) => {
    setSelectedSupplier(supplier);
    setCatalogModalOpen(true);
  };

  const handleCopy = (s) => {
    const text = `PROVEEDOR: ${s.name}\nRUT: ${s.rut || 'N/A'}\nGIRO: ${s.giro || 'N/A'}\nDIRECCIÓN: ${s.address || 'N/A'}\nCONTACTO: ${s.contact_person || 'N/A'} (${s.phone || ''})\nEMAIL: ${s.email || 'N/A'}\nBANCO: ${s.bank_name || 'N/A'} / ${s.bank_account_type || ''} / CTA: ${s.bank_account_number || ''}`;
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
    return <div className="h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm font-medium">Cargando proveedores...</div>;
  }

  // --- VISTA FORMULARIO ---
  if (view === 'form') {
    return (
      <div className="flex flex-col h-screen bg-white font-sans text-gray-800 text-sm overflow-hidden absolute inset-0 z-[60]">
        {/* Control Panel Superior */}
        <div className="border-b border-gray-200 px-4 py-2 bg-white flex flex-col gap-2 shadow-sm shrink-0">
          <div className="flex items-center text-sm text-gray-600">
            <span className="hover:text-gray-900 cursor-pointer" onClick={() => setView('list')}>Proveedores</span>
            <ChevronRight size={14} className="mx-1" />
            <span className="font-semibold text-gray-800">{editingId ? 'Editar' : 'Nuevo'}</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <div className="flex gap-2">
              <button 
                onClick={handleSubmit} 
                disabled={saving} 
                style={{ backgroundColor: BRAND_PRIMARY }}
                className="hover:bg-brand-primary-dark text-white px-4 py-1.5 rounded-sm text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setView('list')} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-1.5 rounded-sm text-sm font-medium transition-colors">
                Descartar
              </button>
            </div>
          </div>
        </div>

        {/* CONTENIDO DEL FORMULARIO */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-5xl mx-auto bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden">
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">Razón Social *</label>
                  <input name="name" required value={formData.name} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">RUT *</label>
                  <input name="rut" required value={formData.rut} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none font-mono" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">Nombre Fantasía</label>
                  <input name="fantasy_name" value={formData.fantasy_name} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">Giro</label>
                  <input name="giro" value={formData.giro} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">Condición Pago</label>
                  <select name="payment_terms" value={formData.payment_terms} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none bg-white">
                    <option value="AL CONTADO">AL CONTADO</option>
                    <option value="15 DIAS">15 DÍAS</option>
                    <option value="30 DIAS">30 DÍAS</option>
                    <option value="45 DIAS">45 DÍAS</option>
                    <option value="CONSIGNACION">CONSIGNACIÓN</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">Dirección</label>
                  <input name="address" value={formData.address} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none" placeholder="CALLE, NUMERO, COMUNA" />
                </div>
              </div>
            </div>

            <div className="px-8 border-b border-gray-200 bg-white">
              <div className="inline-block border-b-2 border-brand-primary text-brand-primary px-4 py-2 font-medium text-sm">Contacto y Finanzas</div>
            </div>

            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">Nombre Contacto</label>
                  <input name="contact_person" value={formData.contact_person} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">Teléfono</label>
                  <input name="phone" value={formData.phone} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">Email</label>
                  <input name="email" type="email" value={formData.email} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">Banco</label>
                  <input name="bank_name" value={formData.bank_name} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none" />
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">Tipo Cuenta</label>
                  <select name="bank_account_type" value={formData.bank_account_type} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none bg-white">
                    <option value="">SELECCIONE...</option>
                    <option value="CUENTA CORRIENTE">CUENTA CORRIENTE</option>
                    <option value="CUENTA VISTA">CUENTA VISTA</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 items-center">
                  <label className="text-gray-600 font-medium text-right pr-4">N° Cuenta</label>
                  <input name="bank_account_number" value={formData.bank_account_number} onChange={handleChange} className="col-span-2 block w-full rounded-sm border-gray-300 border px-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none font-mono" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-white font-sans text-gray-800 text-sm overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-2 bg-white flex flex-col gap-2 shrink-0">
        <div className="flex items-center text-sm text-gray-600">
          <span className="hover:text-gray-900 cursor-pointer">Compras</span>
          <ChevronRight size={14} className="mx-1" />
          <span className="font-semibold text-gray-800">Proveedores</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            <button 
               onClick={handleOpenNew} 
               style={{ backgroundColor: BRAND_PRIMARY }}
               className="hover:bg-brand-primary-dark text-white px-4 py-1.5 rounded-sm text-sm font-medium transition-colors"
            >
               Nuevo
            </button>
          </div>
          <div className="relative w-72">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar por nombre o RUT..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full rounded-sm border-gray-300 border pl-8 pr-3 py-1.5 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white p-4">
        <div className="border border-gray-200 rounded-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-gray-600 font-medium">Razón Social / RUT</th>
                <th className="px-3 py-2 text-gray-600 font-medium">Contacto Principal</th>
                <th className="px-3 py-2 text-gray-600 font-medium">Datos Bancarios</th>
                <th className="px-3 py-2 text-gray-600 font-medium text-center">Condición</th>
                <th className="px-3 py-2 text-center w-28">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSuppliers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => handleOpenEdit(s)}>
                  <td className="px-3 py-2">
                    <div className="font-bold text-gray-800">{s.name}</div>
                    <div className="text-xs text-gray-500">{formatRut(s.rut) || '-'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-gray-700">{s.contact_person || '-'}</div>
                    <div className="text-xs text-gray-500">{s.phone}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-gray-700">{s.bank_name || '-'}</div>
                    <div className="text-xs text-gray-500">{s.bank_account_number}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex px-2 py-0.5 rounded-sm bg-gray-100 text-gray-600 text-[10px] font-bold uppercase border border-gray-200">{s.payment_terms}</span>
                  </td>
                  <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2 transition-opacity">
                      <button onClick={() => handleOpenCatalog(s)} className="text-brand-primary-light hover:text-brand-primary transition-colors" title="Catálogo"><Package size={16} /></button>
                      <button onClick={() => handleCopy(s)} className="text-brand-primary-light hover:text-brand-primary transition-colors" title="Copiar">{copiedId === s.id ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}</button>
                      <button onClick={() => handleDelete(s.id)} className="text-gray-300 hover:text-brand-danger transition-colors" title="Eliminar"><Trash2 size={16} /></button>
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