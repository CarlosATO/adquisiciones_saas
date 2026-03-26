import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabaseClient';
import { Settings, ChevronRight, Save, X, CheckCircle, AlertCircle, Building2, ShoppingCart, Info } from 'lucide-react';

const BRAND_PRIMARY = '#4C3073';

export default function Configuracion() {
  const navigate = useNavigate();
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [companyId, setCompanyId]   = useState(null);
  const [isOwner, setIsOwner]       = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg]     = useState('');

  // Datos empresa (solo lectura)
  const [companyInfo, setCompanyInfo] = useState({
    name: '', legal_name: '', rut: '', address: '', city: '', phone: '',
  });

  // Configuraciones editables
  const [threshold, setThreshold] = useState('');
  const [thresholdDirty, setThresholdDirty] = useState(false);
  const [originalThreshold, setOriginalThreshold] = useState('');

  useEffect(() => { init(); }, []);

  const init = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/'); return; }

      // 🔥 NUEVA ARQUITECTURA: Identidad vía JWT
      const jwtCompanyId = user.app_metadata?.company_id;
      const jwtRole      = user.app_metadata?.role; // Asumiendo que el trigger inyecta el rol o lo sacamos de la tabla

      if (!jwtCompanyId) { navigate('/'); return; }
      setCompanyId(jwtCompanyId);

      // Verificamos el rol desde la tabla (para mayor seguridad en UI)
      const { data: cu } = await supabase
        .from('company_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('company_id', jwtCompanyId)
        .single();
      
      if (!cu || cu.role !== 'OWNER') { navigate('/'); return; }

      setIsOwner(true);

      const { data: co } = await supabase
        .from('companies')
        .select('name, legal_name, rut, address, city, phone, po_approval_threshold')
        .single(); // RLS filtrará automáticamente por el ID de la empresa del usuario

      if (co) {
        setCompanyInfo({
          name:        co.name        || '',
          legal_name:  co.legal_name  || '',
          rut:         co.rut         || '',
          address:     co.address     || '',
          city:        co.city        || '',
          phone:       co.phone       || '',
        });
        const t = String(co.po_approval_threshold || 0);
        setThreshold(t);
        setOriginalThreshold(t);
      }
    } catch (err) {
      console.error(err);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveThreshold = async () => {
    const val = Number(threshold);
    if (isNaN(val) || val < 0) {
      setErrorMsg('Ingresa un monto válido (0 o mayor).');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const { error } = await supabase
        .from('companies')
        .update({ po_approval_threshold: val })
        .eq('id', companyId); // Mantenemos el ID por ser Primary Key del Update
      if (error) throw error;
      setOriginalThreshold(String(val));
      setThresholdDirty(false);
      setSuccessMsg(val === 0
        ? 'Umbral desactivado. Todas las órdenes se confirman sin aprobación.'
        : `Umbral configurado. Órdenes ≥ $${val.toLocaleString('es-CL')} requerirán aprobación.`
      );
      setTimeout(() => setSuccessMsg(''), 6000);
    } catch (err) {
      setErrorMsg('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setThreshold(originalThreshold);
    setThresholdDirty(false);
    setErrorMsg('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: BRAND_PRIMARY }}></div>
      </div>
    );
  }

  const thresholdNum = Number(threshold);

  return (
    <div className="flex flex-col min-h-[calc(100vh-40px)] bg-slate-50 font-sans text-slate-800 text-sm">

      {/* Control Panel */}
      <div className="border-b border-slate-300 px-6 py-2 bg-white shadow-sm flex items-center justify-between shrink-0">
        <nav className="flex items-center text-[11px] text-slate-500 uppercase tracking-widest font-medium gap-1">
          <span className="text-slate-400">Adquisiciones</span>
          <ChevronRight size={11} className="text-slate-300" />
          <span className="text-slate-900 font-black">Configuración</span>
        </nav>
        <div className="flex items-center gap-1.5">
          <Settings size={13} className="text-slate-400" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Solo visible para Owner</span>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto w-full space-y-6">

        {/* Success / Error banners */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-sm px-4 py-2.5">
            <CheckCircle size={14} className="text-green-600 shrink-0" />
            <p className="text-[11px] text-green-700 font-bold flex-1">{successMsg}</p>
            <button onClick={() => setSuccessMsg('')}><X size={13} className="text-green-400" /></button>
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-sm px-4 py-2.5">
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-[11px] text-red-700 font-bold flex-1">{errorMsg}</p>
            <button onClick={() => setErrorMsg('')}><X size={13} className="text-red-400" /></button>
          </div>
        )}

        {/* ── SECCIÓN 1: Información de Empresa (solo lectura) ── */}
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center gap-2">
            <Building2 size={14} style={{ color: BRAND_PRIMARY }} />
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: BRAND_PRIMARY }}>
                Información de la Empresa
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Solo lectura · Editable desde el panel de administración</p>
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-4">
            {[
              { label: 'Nombre Comercial',  value: companyInfo.name },
              { label: 'Razón Social',      value: companyInfo.legal_name },
              { label: 'RUT / Tax ID',      value: companyInfo.rut },
              { label: 'Teléfono',          value: companyInfo.phone },
              { label: 'Dirección',         value: companyInfo.address },
              { label: 'Ciudad',            value: companyInfo.city },
            ].map(f => (
              <div key={f.label}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{f.label}</p>
                <p className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-sm px-3 py-1.5 min-h-[30px]">
                  {f.value || <span className="text-slate-300 italic">No configurado</span>}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECCIÓN 2: Configuración de Adquisiciones ── */}
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center gap-2">
            <ShoppingCart size={14} style={{ color: BRAND_PRIMARY }} />
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: BRAND_PRIMARY }}>
                Flujo de Aprobaciones · Adquisiciones
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">Define cuándo una Orden de Compra requiere aprobación de un Manager</p>
            </div>
          </div>
          <div className="p-5 space-y-5">

            {/* Toolbar guardar/descartar — aparece solo si hay cambios */}
            {thresholdDirty && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-sm px-4 py-2 -mt-1">
                <span className="text-[11px] text-amber-700 font-bold flex-1">Tienes cambios sin guardar</span>
                <button
                  onClick={handleSaveThreshold}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-black uppercase rounded-sm text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: BRAND_PRIMARY }}
                >
                  <Save size={12} /> {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={handleDiscard}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-black uppercase rounded-sm border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                >
                  Descartar
                </button>
              </div>
            )}

            {/* Campo umbral */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Umbral de Aprobación
              </label>
              <div className="flex items-center gap-3">
                <div className="relative w-56">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={threshold}
                    onChange={(e) => {
                      setThreshold(e.target.value);
                      setThresholdDirty(e.target.value !== originalThreshold);
                    }}
                    className="w-full border border-slate-300 rounded-sm pl-7 pr-4 py-2 text-sm font-mono focus:outline-none focus:border-[#4C3073] appearance-none"
                    style={{ MozAppearance: 'textfield' }}
                    placeholder="0"
                  />
                </div>
                <div className="text-xs text-slate-500">
                  {thresholdNum === 0
                    ? <span className="text-green-600 font-bold">✓ Sin umbral — todas las OC se confirman directo</span>
                    : <span style={{ color: BRAND_PRIMARY }} className="font-bold">
                        OC ≥ ${thresholdNum.toLocaleString('es-CL')} → Requieren aprobación
                      </span>
                  }
                </div>
              </div>
            </div>

            {/* Ayuda visual */}
            <div className="bg-slate-50 border border-slate-200 rounded-sm p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                <Info size={11} /> ¿Cómo funciona?
              </p>
              <div className="space-y-1.5 text-[11px] text-slate-600">
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">✓</span>
                  <span><strong>Umbral = $0</strong> → Cualquier comprador confirma órdenes directamente a estado "Confirmada"</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">⏳</span>
                  <span><strong>Umbral = $500.000</strong> → OC bajo $500k pasan directo; OC ≥ $500k van a "Esperando Aprobación" hasta que un Manager las apruebe o rechace</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">i</span>
                  <span>Los Managers pueden revisar las órdenes pendientes en la sección <strong>"Aprobaciones"</strong> del menú</span>
                </div>
              </div>
            </div>

            {/* Guardar (también al pie si no hay cambios pendientes en banner) */}
            {!thresholdDirty && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleSaveThreshold}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-black uppercase rounded-sm text-white disabled:opacity-50 hover:opacity-90 transition-opacity shadow-sm"
                  style={{ backgroundColor: BRAND_PRIMARY }}
                >
                  <Save size={12} /> {saving ? 'Guardando...' : 'Guardar Configuración'}
                </button>
                <span className="text-[10px] text-slate-400">
                  Umbral actual: <strong className="text-slate-600">
                    {Number(originalThreshold) === 0 ? 'Sin umbral' : `$${Number(originalThreshold).toLocaleString('es-CL')}`}
                  </strong>
                </span>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
