import { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { Plus, Edit, Copy, Building2, Phone, Mail, CreditCard, X, Landmark, MapPin, UserSquare, Check, Search, Package } from 'lucide-react';
import CatalogoModal from '../components/CatalogoModal';

const INITIAL_FORM_STATE = {
  rut: '', business_name: '', fantasy_name: '', giro: '', address: '',
  contact_person: '', phone: '', email: '', payment_terms: 'AL CONTADO',
  bank_name: '', bank_account_type: '', bank_account_number: ''
};

// Función utilitaria para formatear el RUT chileno automáticamente
const formatRut = (value) => {
  if (!value) return '';
  // Elimina cualquier caracter que no sea número o k/K
  let rut = value.toString().replace(/[^0-9kK]/g, '').toUpperCase();
  if (rut.length === 0) return '';
  
  if (rut.length <= 1) return rut;
  
  // Extrae el dígito verificador y el cuerpo
  const vd = rut.slice(-1);
  const cuerpo = rut.slice(0, -1);
  
  // Aplica separadores de miles al cuerpo
  const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  
  return `${cuerpoFormateado}-${vd}`;
};

export default function Proveedores() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [companyId, setCompanyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [copiedId, setCopiedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

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
        .order('name', { ascending: true }); // Nota: Cambiamos business_name a name aquí

      if (!error && suppliersData) setSuppliers(suppliersData);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Manejador que fuerza mayúsculas excepto en el email, y formatea RUT
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'rut') {
      setFormData({
        ...formData,
        [name]: formatRut(value)
      });
      return;
    }
    
    const isEmail = name === 'email';
    setFormData({
      ...formData,
      [name]: isEmail ? value : value.toUpperCase()
    });
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM_STATE);
    setShowModal(true);
  };

  const handleOpenEdit = (supplier) => {
    setEditingId(supplier.id);
    setFormData({
      rut: supplier.rut || '', business_name: supplier.name || '', fantasy_name: supplier.fantasy_name || '',
      giro: supplier.giro || '', address: supplier.address || '', contact_person: supplier.contact_person || '',
      phone: supplier.phone || '', email: supplier.email || '', payment_terms: supplier.payment_terms || 'AL CONTADO',
      bank_name: supplier.bank_name || '', bank_account_type: supplier.bank_account_type || '', bank_account_number: supplier.bank_account_number || ''
    });
    setShowModal(true);
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

    try {
      const payload = { 
        ...formData, 
        name: formData.business_name, // La BD espera la columna "name"
        company_id: companyId 
      };
      
      // Eliminamos business_name del payload ya que la BD espera solo 'name'
      delete payload.business_name;

      if (editingId) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert([payload]);
        if (error) throw error;
      }

      setShowModal(false);
      fetchInitialData();
    } catch (error) {
      console.error('Error guardando proveedor:', error);
      alert(`Error en Base de Datos:\n${error.message || 'Error desconocido'}\n${error.details || ''}\n${error.hint || ''}`);
    }
  };

  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase();
    return (s.name || '').toLowerCase().includes(q) ||
           (s.rut || '').toLowerCase().includes(q) ||
           (s.fantasy_name || '').toLowerCase().includes(q);
  });

  return (
    <div className="max-w-7xl mx-auto">
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Directorio de Proveedores</h1>
          <p className="text-sm text-slate-500 mt-1">Información comercial, contactos y datos de facturación.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Buscar por nombre o RUT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-full md:w-64 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
          <button onClick={handleOpenNew} className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-colors">
            <Plus size={18} /> Nuevo Proveedor
          </button>
        </div>
      </div>

      {/* Tabla de Datos */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Cargando proveedores...</div>
        ) : suppliers.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <Building2 size={48} className="text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-700">No hay proveedores</h3>
            <p className="text-slate-500 mt-1">Comienza agregando tu primer proveedor a la base de datos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Razón Social / RUT</th>
                  <th className="px-6 py-4">Contacto Principal</th>
                  <th className="px-6 py-4">Datos Bancarios</th>
                  <th className="px-6 py-4">Condición</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredSuppliers.length > 0 ? (
                  filteredSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{s.name}</div>
                        <div className="text-xs text-slate-500">{formatRut(s.rut) || 'Sin RUT'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">{s.contact_person || '-'}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1"><Phone size={12} /> {s.phone || 'S/N'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-800 font-medium">{s.bank_name || 'No registrado'}</div>
                        <div className="text-xs text-slate-500">{s.bank_account_number}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {s.payment_terms}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleOpenCatalog(s)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Catálogo B2B">
                            <Package size={18} />
                          </button>
                          <button onClick={() => handleCopy(s)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Copiar Datos">
                            {copiedId === s.id ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
                          </button>
                          <button onClick={() => handleOpenEdit(s)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar Proveedor">
                            <Edit size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                      No se encontraron proveedores que coincidan con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Súper Completo */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Building2 className="text-indigo-600" />
                {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form id="supplierForm" onSubmit={handleSubmit} className="space-y-8">

                {/* Sección 1: Datos Legales */}
                <div>
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-4 border-b pb-2">Información Legal y Comercial</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">RUT *</label>
                      <input type="text" name="rut" required value={formData.rut} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono" placeholder="76.123.456-7" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Razón Social *</label>
                      <input type="text" name="business_name" required value={formData.business_name} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de Fantasía</label>
                      <input type="text" name="fantasy_name" value={formData.fantasy_name} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Giro / Actividad</label>
                      <input type="text" name="giro" value={formData.giro} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Condición de Pago</label>
                      <select name="payment_terms" value={formData.payment_terms} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white">
                        <option value="AL CONTADO">AL CONTADO</option>
                        <option value="15 DIAS">15 DÍAS</option>
                        <option value="30 DIAS">30 DÍAS</option>
                        <option value="45 DIAS">45 DÍAS</option>
                        <option value="CONSIGNACION">CONSIGNACIÓN</option>
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><MapPin size={14} /> Dirección de Casa Matriz</label>
                      <input type="text" name="address" value={formData.address} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="CALLE, NUMERO, COMUNA" />
                    </div>
                  </div>
                </div>

                {/* Sección 2: Contacto */}
                <div>
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-4 border-b pb-2 flex items-center gap-2"><UserSquare size={16} /> Información de Contacto</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Contacto</label>
                      <input type="text" name="contact_person" value={formData.contact_person} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="EJ: JUAN PÉREZ" />
                    </div>
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono / WhatsApp</label>
                      <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
                      <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="ventas@empresa.cl" />
                    </div>
                  </div>
                </div>

                {/* Sección 3: Datos Bancarios */}
                <div>
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-4 border-b pb-2 flex items-center gap-2"><Landmark size={16} /> Datos de Transferencia (Finanzas)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Banco</label>
                      <input type="text" name="bank_name" value={formData.bank_name} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="EJ: BANCO ESTADO" />
                    </div>
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Cuenta</label>
                      <select name="bank_account_type" value={formData.bank_account_type} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white">
                        <option value="">SELECCIONE...</option>
                        <option value="CUENTA CORRIENTE">CUENTA CORRIENTE</option>
                        <option value="CUENTA VISTA">CUENTA VISTA</option>
                        <option value="CUENTA RUT">CUENTA RUT</option>
                        <option value="CUENTA AHORRO">CUENTA AHORRO</option>
                      </select>
                    </div>
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Número de Cuenta</label>
                      <input type="text" name="bank_account_number" value={formData.bank_account_number} onChange={handleChange} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono" />
                    </div>
                  </div>
                </div>

              </form>
            </div>

            <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
              <button form="supplierForm" type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-lg font-bold transition-colors shadow-md">
                {editingId ? 'Guardar Cambios' : 'Registrar Proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal del Catálogo B2B */}
      <CatalogoModal 
        isOpen={catalogModalOpen} 
        onClose={() => setCatalogModalOpen(false)} 
        supplier={selectedSupplier}
        companyId={companyId}
      />
    </div>
  );
}