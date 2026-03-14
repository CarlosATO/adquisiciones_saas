import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../api/supabaseClient';
import { Plus, ShoppingCart, Trash2, ArrowLeft, CheckCircle, Clock, FileEdit, Search, ChevronRight, History, Download, Mail, Truck, X, RotateCcw } from 'lucide-react';
import SearchableSelect from '../components/ui/SearchableSelect';
import { PDFDownloadLink, pdf } from '@react-pdf/renderer';
import PurchaseOrderPDF from '../components/PurchaseOrderPDF';

const BRAND_PRIMARY = '#4C3073'; // Púrpura Profundo
const BRAND_ACCENT = '#8E43D9';
const BRAND_LIGHT = '#BC91D9';
const BRAND_DANGER = '#730202';

export default function OrdenesCompra() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState('');
  const [companyName, setCompanyName] = useState('');

  // Control de Vistas: 'list' | 'form' | 'detail'
  const [view, setView] = useState('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderLines, setOrderLines] = useState([]);

  // Estados del Formulario
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]); 
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [lines, setLines] = useState([]); 
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // Estados para Recepción
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState({
    document_type: 'GUIA_DESPACHO',
    document_number: '',
    notes: '',
    finish_order: false
  });
  const [receivingLines, setReceivingLines] = useState([]);

  // Estados para Devolución
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnData, setReturnData] = useState({ document_type: 'NOTA_CREDITO', document_number: '', notes: '' });
  const [returningLines, setReturningLines] = useState([]);

  useEffect(() => {
    fetchInitialData();
  }, [view]);

  const handleSendEmail = async () => {
    if (!selectedOrder || !orderLines.length) return;
    setSendingEmail(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      // Generar PDF Blob
      const blob = await pdf(<PurchaseOrderPDF order={selectedOrder} lines={orderLines} />).toBlob();
      
      // Convertir a Base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          if (typeof result === 'string') {
            resolve(result.split(',')[1]);
          } else {
            reject(new Error("Failed to convert PDF to base64"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const isDraft = selectedOrder.status === 'DRAFT';
      const subject = `${isDraft ? 'Solicitud de Presupuesto' : 'Orden de Compra'} #${String(selectedOrder.po_number).padStart(4, '0')} - ${companyName}`;
      const supplierEmail = selectedOrder.suppliers?.email || prompt("El proveedor no tiene email configurado. Ingrese el email:");
      const contactName = selectedOrder.suppliers?.contact_person || 'Proveedor';
      
      if (!supplierEmail) {
        setSendingEmail(false);
        return;
      }

      // Definir el mensaje según el estado
      const mainMessage = isDraft 
        ? `<b>${companyName}</b> tiene el agrado de solicitar una cotización para los productos detallados en el documento adjunto.`
        : `<b>${companyName}</b> tiene el agrado de enviar la presente <b>Orden de Compra</b> según el detalle adjunto.`;
      
      const secondaryMessage = isDraft
        ? `Agradeceríamos nos envíe su mejor propuesta comercial y plazos de entrega estimados. Quedamos atentos a sus comentarios.`
        : `Esta orden de compra está bajo las condiciones que se acuerdan en el documento. Quedamos atentos a sus comentarios para proceder con el despacho.`;

      const { data, error } = await supabase.functions.invoke('send-po-email', {
        body: {
          to: supplierEmail,
          reply_to: user.email,
          subject: subject,
          senderName: userName,
          companyName: companyName,
          html_content: `
            <div style="font-family: sans-serif; color: #334155; line-height: 1.6; max-width: 600px;">
              <h2 style="color: #4f46e5; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">
                ${isDraft ? 'Solicitud de Presupuesto' : 'Orden de Compra'}
              </h2>
              <p>Estimado/a <b>${contactName}</b>,</p>
              <p>${mainMessage}</p>
              <p>${secondaryMessage}</p>
              <br/>
              <div style="margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                <p style="margin: 0;">Atentamente,</p>
                <p style="margin: 0; color: #4f46e5; font-weight: bold;">${userName}</p>
                <p style="margin: 0; font-size: 12px; color: #64748b;">${companyName}</p>
              </div>
            </div>
          `,
          attachment: base64,
          filename: `${isDraft ? 'Presupuesto' : 'Orden'}_${String(selectedOrder.po_number).padStart(4, '0')}.pdf`
        }
      });

      if (error) throw error;
      alert("Correo enviado exitosamente.");
    } catch (error) {
      console.error("Error enviando email:", error);
      alert(`Error al enviar el correo: ${error.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!selectedOrder || !orderLines.length) return;
    try {
      const blob = await pdf(<PurchaseOrderPDF order={selectedOrder} lines={orderLines} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedOrder.status === 'DRAFT' ? 'Presupuesto' : 'Orden'}_${String(selectedOrder.po_number).padStart(4, '0')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      alert("Error al generar el PDF.");
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: companyUser } = await supabase.from('company_users').select('company_id, full_name').eq('user_id', user.id).single();
      if (!companyUser) return;
      setCompanyId(companyUser.company_id);
      setUserName(companyUser.full_name || '');

      const { data: compInfo } = await supabase.from('companies').select('name').eq('id', companyUser.company_id).single();
      if (compInfo) setCompanyName(compInfo.name || '');

      if (view === 'list') {
        const { data: ordersData } = await supabase
          .from('purchase_orders')
          .select('*, suppliers(business_name, name, email, contact_person), purchase_order_items(unit_cost, received_quantity)')
          .eq('company_id', companyUser.company_id)
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

  const fetchOrderDetails = async (orderOrId) => {
    setLoading(true);
    const orderId = typeof orderOrId === 'object' ? orderOrId.id : orderOrId;
    try {
      // 1. Obtener datos frescos de la cabecera de la orden
      const { data: orderData, error: orderErr } = await supabase
        .from('purchase_orders')
        .select('*, suppliers(business_name, name, email, contact_person)')
        .eq('id', orderId)
        .single();
      
      if (orderErr) throw orderErr;

      // 2. Obtener líneas de la orden
      const { data: linesData, error: linesErr } = await supabase
        .from('purchase_order_items')
        .select('*, products(name, barcode)')
        .eq('po_id', orderId);
      
      if (linesErr) throw linesErr;

      // --- AUTOCORRECCIÓN DE ESTADO (Consistencia de Datos) ---
      // Si la orden ya está confirmada, recalculamos su estado real basado en recepciones
      if (orderData.status !== 'DRAFT' && orderData.status !== 'RECEIVED') {
        const allRec = linesData.every(l => Number(l.received_quantity) >= Number(l.quantity));
        const anyRec = linesData.some(l => Number(l.received_quantity) > 0);
        
        let realStatus = orderData.status;
        if (allRec) realStatus = 'RECEIVED';
        else if (anyRec) realStatus = 'PARTIAL';
        else realStatus = 'PENDING';

        if (realStatus !== orderData.status) {
          const { error: updErr } = await supabase.from('purchase_orders').update({ status: realStatus }).eq('id', orderId);
          if (!updErr) {
            orderData.status = realStatus;
            // Sincronizar con la lista principal para evitar inconsistencias visuales
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: realStatus } : o));
          } else {
            console.error('Error en autocorrección de estado:', updErr);
          }
        }
      }

      setSelectedOrder(orderData);
      setOrderLines(linesData);
      setView('detail');
    } catch (error) {
      console.error('Error fetching order details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!selectedOrder) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'PENDING' })
        .eq('id', selectedOrder.id);
      
      if (error) throw error;
      
      setSelectedOrder({ ...selectedOrder, status: 'PENDING' });
      alert("Pedido confirmado correctamente.");
      fetchInitialData();
    } catch (error) {
      console.error(error);
      alert("Error al confirmar pedido.");
    } finally {
      setSaving(false);
    }
  };

  const handleForceCloseOrder = async () => {
    if (!window.confirm("¿Finalizar esta orden con saldo pendiente? La orden quedará marcada como RECIBIDA aunque no se hayan recibido todos los artículos.")) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'RECEIVED' })
        .eq('id', selectedOrder.id);
      if (error) throw error;
      setSelectedOrder({ ...selectedOrder, status: 'RECEIVED' });
    } catch (err) {
      alert("Error al cerrar la orden: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenReceipt = () => {
    setReceivingLines(orderLines.map(l => ({
      ...l,
      received_now: Number(l.quantity) - Number(l.received_quantity || 0),
      anomaly: ''
    })));
    setReceiptData({
      document_type: 'GUIA_DESPACHO',
      document_number: '',
      notes: '',
      finish_order: false
    });
    setShowReceiptModal(true);
  };

  const handleValidateReception = async () => {
    if (!receiptData.document_number) return alert("Ingrese el número de documento.");
    setSaving(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Crear documento de recepción
      const { data: receipt, error: receiptErr } = await supabase
        .from('inventory_receipts')
        .insert([{
          company_id: companyId,
          po_id: selectedOrder.id,
          supplier_id: selectedOrder.supplier_id,
          document_type: receiptData.document_type,
          document_number: receiptData.document_number,
          notes: receiptData.notes,
          created_by: user.id,
          status: 'DONE'
        }])
        .select()
        .single();
      
      if (receiptErr) throw receiptErr;

      for (const line of receivingLines) {
        if (Number(line.received_now) <= 0) continue;

        // 2. Crear movimiento de stock
        const { error: moveErr } = await supabase
          .from('inventory_movements')
          .insert([{
            company_id: companyId,
            product_id: line.product_id,
            user_id: user.id,
            movement_type: 'IN',
            quantity: Number(line.received_now),
            reason: `Compra OC #${selectedOrder.po_number} - ${receiptData.document_type} ${receiptData.document_number}`,
            receipt_id: receipt.id
          }]);
        if (moveErr) throw moveErr;

        // 3. Actualizar stock en productos
        const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', line.product_id).single();
        const newStock = Number(product?.stock_quantity || 0) + Number(line.received_now);
        
        const { error: prodErr } = await supabase
          .from('products')
          .update({ stock_quantity: newStock })
          .eq('id', line.product_id);
        if (prodErr) throw prodErr;

        // 4. Actualizar cantidad recibida en la línea de la OC
        const newTotalReceived = Number(line.received_quantity || 0) + Number(line.received_now);
        const { error: poLineErr } = await supabase
          .from('purchase_order_items')
          .update({ received_quantity: newTotalReceived })
          .eq('id', line.id);
        if (poLineErr) throw poLineErr;
      }

      // 5. Determinar nuevo estado de la OC
      const { data: updatedLines } = await supabase.from('purchase_order_items').select('quantity, received_quantity').eq('po_id', selectedOrder.id);
      
      const allReceived = updatedLines.every(l => Number(l.received_quantity) >= Number(l.quantity));
      const anyReceived = updatedLines.some(l => Number(l.received_quantity) > 0);
      
      let nextStatus = 'PENDING';
      if (allReceived) {
        nextStatus = 'RECEIVED';
      } else if (anyReceived) {
        nextStatus = 'PARTIAL';
      }

      // 6. Actualizar estado de la OC primero (siempre debe ejecutarse)
      const { error: finalUpdErr } = await supabase
        .from('purchase_orders')
        .update({ status: nextStatus })
        .eq('id', selectedOrder.id);
      if (finalUpdErr) throw finalUpdErr;

      // 7. Si el documento es FACTURA, registrar en expenses (operación secundaria no bloqueante)
      if (receiptData.document_type === 'FACTURA') {
        const receivedSubtotal = receivingLines
          .filter(l => Number(l.received_now) > 0)
          .reduce((s, l) => s + (Number(l.received_now) * Number(l.unit_cost)), 0);
        const receivedTotal = Math.round(receivedSubtotal * 1.19);

        const { error: expErr } = await supabase
          .from('expenses')
          .insert([{
            company_id: companyId,
            user_id: user.id,
            category: 'OTROS',
            amount: receivedTotal,
            description: `FACTURA ${receiptData.document_number} - ${selectedOrder.suppliers?.business_name || selectedOrder.suppliers?.name}`,
            expense_date: new Date().toISOString().split('T')[0],
            po_id: selectedOrder.id,
            receipt_id: receipt.id,
            supplier_id: selectedOrder.supplier_id,
            document_number: receiptData.document_number,
            status: 'PENDING_PAYMENT',
          }]);

        if (!expErr) {
          // Solo marcar como facturada si el insert de expenses fue exitoso
          await supabase
            .from('purchase_orders')
            .update({ billing_status: 'BILLED' })
            .eq('id', selectedOrder.id);
        } else {
          console.warn('No se pudo registrar en expenses (¿migración pendiente?):', expErr.message);
        }
      }

      alert("Recepción procesada correctamente e inventario actualizado.");
      setShowReceiptModal(false);
      fetchOrderDetails(selectedOrder);
      fetchInitialData();

    } catch (error) {
      console.error(error);
      alert("Error al procesar recepción: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenReturn = () => {
    setReturningLines(
      orderLines
        .filter(l => Number(l.received_quantity) > 0)
        .map(l => ({ ...l, return_now: 0 }))
    );
    setReturnData({ document_type: 'NOTA_CREDITO', document_number: '', notes: '' });
    setShowReturnModal(true);
  };

  const handleValidateReturn = async () => {
    if (!returnData.document_number) return alert("Ingrese el número de documento.");
    const itemsToReturn = returningLines.filter(l => Number(l.return_now) > 0);
    if (itemsToReturn.length === 0) return alert("Ingrese al menos una cantidad a devolver.");
    for (const l of itemsToReturn) {
      if (Number(l.return_now) > Number(l.received_quantity)) {
        return alert(`No puede devolver más de lo recibido para "${l.products?.name}".`);
      }
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Cabecera de devolución en inventory_receipts
      const { data: returnReceipt, error: receiptErr } = await supabase
        .from('inventory_receipts')
        .insert([{
          company_id: companyId,
          po_id: selectedOrder.id,
          supplier_id: selectedOrder.supplier_id,
          document_type: returnData.document_type,
          document_number: returnData.document_number,
          notes: returnData.notes,
          created_by: user.id,
          status: 'DONE'
        }])
        .select()
        .single();
      if (receiptErr) throw receiptErr;

      for (const line of itemsToReturn) {
        // 2. Movimiento Kardex (OUT)
        const { error: moveErr } = await supabase
          .from('inventory_movements')
          .insert([{
            company_id: companyId,
            product_id: line.product_id,
            user_id: user.id,
            movement_type: 'OUT',
            quantity: Number(line.return_now),
            reason: `Devolución OC #${selectedOrder.po_number} - ${returnData.document_type} ${returnData.document_number}`,
            receipt_id: returnReceipt.id
          }]);
        if (moveErr) throw moveErr;

        // 3. Actualizar stock real (restar)
        const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', line.product_id).single();
        const newStock = Math.max(0, Number(product?.stock_quantity || 0) - Number(line.return_now));
        const { error: prodErr } = await supabase.from('products').update({ stock_quantity: newStock }).eq('id', line.product_id);
        if (prodErr) throw prodErr;

        // 4. Actualizar cantidad recibida en la línea de OC (restar)
        const newReceived = Math.max(0, Number(line.received_quantity) - Number(line.return_now));
        const { error: poLineErr } = await supabase
          .from('purchase_order_items')
          .update({ received_quantity: newReceived })
          .eq('id', line.id);
        if (poLineErr) throw poLineErr;
      }

      // 5. Recalcular estado de la OC
      const { data: updatedLines } = await supabase
        .from('purchase_order_items')
        .select('quantity, received_quantity')
        .eq('po_id', selectedOrder.id);
      const allReceived = updatedLines.every(l => Number(l.received_quantity) >= Number(l.quantity));
      const anyReceived = updatedLines.some(l => Number(l.received_quantity) > 0);
      let nextStatus = 'PENDING';
      if (allReceived) nextStatus = 'RECEIVED';
      else if (anyReceived) nextStatus = 'PARTIAL';

      const { error: statusErr } = await supabase
        .from('purchase_orders')
        .update({ status: nextStatus })
        .eq('id', selectedOrder.id);
      if (statusErr) throw statusErr;

      // 6. Integración financiera: si existe alguna factura ligada a esta OC, crear nota de crédito negativa
      const { data: existingExpenses } = await supabase
        .from('expenses')
        .select('id')
        .eq('po_id', selectedOrder.id)
        .gt('amount', 0);

      if (existingExpenses && existingExpenses.length > 0) {
        const returnedSubtotal = itemsToReturn.reduce((s, l) => s + (Number(l.return_now) * Number(l.unit_cost)), 0);
        const returnedTotal = Math.round(returnedSubtotal * 1.19);
        const { error: expErr } = await supabase
          .from('expenses')
          .insert([{
            company_id: companyId,
            user_id: user.id,
            category: 'NOTA_CREDITO',
            amount: -returnedTotal,
            description: `${returnData.document_type} ${returnData.document_number} - Dev. OC #${selectedOrder.po_number} - ${selectedOrder.suppliers?.business_name || selectedOrder.suppliers?.name}`,
            expense_date: new Date().toISOString().split('T')[0],
            po_id: selectedOrder.id,
            receipt_id: returnReceipt.id,
            supplier_id: selectedOrder.supplier_id,
            document_number: returnData.document_number,
            status: 'PENDING_PAYMENT',
          }]);
        if (expErr) console.warn('No se pudo registrar nota de crédito en expenses:', expErr.message);
      }

      alert("Devolución procesada correctamente.");
      setShowReturnModal(false);
      fetchOrderDetails(selectedOrder);
      fetchInitialData();
    } catch (error) {
      console.error(error);
      alert("Error al procesar devolución: " + error.message);
    } finally {
      setSaving(false);
    }
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
        .select('id, po_number, suppliers(business_name, name, email, contact_person)')
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
      fetchInitialData();
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
    return <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm font-medium">Cargando órdenes...</div>;
  }

  // Loader para vista detalle
  if (loading && view === 'detail') {
    return <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm font-medium">Obteniendo detalles de la orden...</div>;
  }

  // --- VISTA FORMULARIO ---
  if (view === 'form') {
    const totals = calculateTotals();
    return (
      <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 text-sm overflow-hidden absolute inset-0 z-[60]">
        
        {/* CONTROL PANEL SUPERIOR style Odoo */}
        <div className="border-b border-slate-300 px-4 py-1.5 bg-white flex flex-col gap-1 shrink-0 shadow-sm">
            <nav className="flex items-center text-[11px] text-slate-500 uppercase tracking-widest font-medium">
                <span className="hover:text-indigo-600 cursor-pointer" onClick={() => setView('list')}>Órdenes de Compra</span>
                <ChevronRight size={12} className="mx-1" />
                <span className="text-slate-900">Nueva Orden</span>
            </nav>
            
            <div className="flex justify-between items-center mt-0.5">
                <div className="flex gap-1">
                    <button 
                        onClick={() => handleSaveOrder('PENDING')}
                        disabled={saving}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-sm text-xs font-bold transition-colors disabled:opacity-50 uppercase shadow-sm"
                    >
                        {saving ? 'Confirmando...' : 'Confirmar Pedido'}
                    </button>
                    <button
                        onClick={() => handleSaveOrder('DRAFT')}
                        disabled={saving}
                        className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-3 py-1 rounded-sm text-xs font-bold transition-colors disabled:opacity-50 uppercase shadow-sm"
                    >
                        Guardar Presupuesto
                    </button>
                    <button
                        onClick={() => setView('list')}
                        className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-3 py-1 rounded-sm text-xs font-bold transition-colors uppercase shadow-sm"
                    >
                        Descartar
                    </button>
                </div>
            </div>
        </div>

        {/* CONTENIDO DEL FORMULARIO style Odoo */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
          <div className="max-w-6xl mx-auto bg-white border border-slate-300 shadow-sm rounded-sm overflow-hidden">
            
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
                <div className="space-y-3">
                    <div className="grid grid-cols-3 items-center">
                        <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Proveedor</label>
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

                <div className="space-y-3">
                    <div className="grid grid-cols-3 items-center">
                        <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Fecha Orden</label>
                        <input 
                            type="date" 
                            value={issueDate} 
                            onChange={e => setIssueDate(e.target.value)} 
                            className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30 font-mono"
                        />
                    </div>
                    <div className="grid grid-cols-3 items-center">
                        <label className="text-slate-500 font-bold text-xs text-right pr-4 uppercase tracking-tighter">Recepción Esperada</label>
                        <input 
                            type="date" 
                            value={expectedDate} 
                            onChange={e => setExpectedDate(e.target.value)} 
                            className="col-span-2 block w-full rounded-sm border-slate-300 border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/30 font-mono"
                        />
                    </div>
                </div>
            </div>

            <div className="px-8 border-b border-slate-200 bg-slate-50/50">
                <div className="inline-block border-b-2 border-indigo-600 text-indigo-700 px-4 py-2 font-bold text-[10px] uppercase tracking-widest">
                    Líneas de la Orden
                </div>
            </div>

            <div className="p-0 min-h-[300px]">
                <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-tighter text-slate-600">
                        <tr>
                            <th className="px-8 py-1.5">Producto</th>
                            <th className="px-4 py-1.5 w-24 text-right">Cantidad</th>
                            <th className="px-4 py-1.5 w-32 text-right">Costo Unit.</th>
                            <th className="px-4 py-1.5 w-32 text-right">Subtotal</th>
                            <th className="px-4 py-1.5 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {lines.map((line) => (
                            <tr key={line.tempId} className="hover:bg-slate-50 group">
                                <td className="px-8 py-1.5">
                                    <SearchableSelect 
                                        options={products.map(p => ({ 
                                            value: p.id, 
                                            label: p.name,
                                            subLabel: p.barcode ? `SKU: ${p.barcode}` : ""
                                        }))}
                                        value={line.product_id}
                                        onChange={(val) => handleLineChange(line.tempId, 'product_id', val)}
                                        placeholder="Buscar..."
                                    />
                                </td>
                                <td className="px-4 py-1.5">
                                    <input 
                                        type="number" 
                                        value={line.quantity} 
                                        onChange={e => handleLineChange(line.tempId, 'quantity', e.target.value)} 
                                        className="w-full text-right bg-transparent border-b border-transparent focus:border-indigo-500 outline-none px-1 font-mono"
                                    />
                                </td>
                                <td className="px-4 py-1.5">
                                    <input 
                                        type="number" 
                                        value={line.unit_cost} 
                                        onChange={e => handleLineChange(line.tempId, 'unit_cost', e.target.value)} 
                                        className="w-full text-right bg-transparent border-b border-transparent focus:border-indigo-500 outline-none px-1 font-mono"
                                    />
                                </td>
                                <td className="px-4 py-1.5 text-right font-medium text-slate-800">
                                    ${(Number(line.quantity) * Number(line.unit_cost)).toLocaleString('es-CL')}
                                </td>
                                <td className="px-4 py-1.5 text-center text-slate-300 hover:text-red-600 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveLine(line.tempId)}>
                                    <Trash2 size={12} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="px-8 py-2 bg-white">
                    <button 
                        onClick={handleAddLine} 
                        className="text-indigo-600 hover:text-indigo-800 font-bold text-[10px] uppercase flex items-center gap-1 transition-colors"
                    >
                        <Plus size={14} /> Agregar línea
                    </button>
                </div>

                <div className="p-8 flex justify-end">
                    <div className="w-64 space-y-1 text-right border-t border-slate-100 pt-4">
                        <div className="flex justify-between text-slate-500 text-[10px] uppercase font-bold">
                            <span>Subtotal:</span>
                            <span className="font-mono">${totals.subtotal.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="flex justify-between text-slate-500 text-[10px] uppercase font-bold">
                            <span>Impuestos (19%):</span>
                            <span className="font-mono">${totals.tax.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="flex justify-between text-slate-900 font-black text-sm pt-2 border-t border-slate-200 mt-2">
                            <span>TOTAL:</span>
                            <span className="text-indigo-600 font-mono">${totals.total.toLocaleString('es-CL')}</span>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- VISTA DETALLE ---
  if (view === 'detail' && selectedOrder) {
    return (
      <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 text-sm overflow-hidden absolute inset-0 z-[60]">
        
        {/* CONTROL PANEL SUPERIOR style Odoo */}
        <div className="border-b border-slate-300 px-4 py-1.5 bg-white flex flex-col gap-1 shrink-0 shadow-sm">
            <nav className="flex items-center text-[11px] text-slate-500 uppercase tracking-widest font-medium">
                <span className="hover:text-indigo-600 cursor-pointer" onClick={() => setView('list')}>Órdenes de Compra</span>
                <ChevronRight size={12} className="mx-1" />
                <span className="text-slate-900">Orden #{String(selectedOrder.po_number).padStart(4, '0')}</span>
            </nav>
            
            <div className="flex justify-between items-center mt-0.5">
                <div className="flex gap-1">
                    {selectedOrder.status === 'DRAFT' && (
                        <button 
                            onClick={handleConfirmOrder}
                            disabled={saving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-sm text-xs font-bold transition-colors disabled:opacity-50 uppercase shadow-sm"
                        >
                            {saving ? 'Confirmando...' : 'Confirmar Pedido'}
                        </button>
                    )}
                     <div className="flex gap-2">
                        {(selectedOrder.status === 'PENDING' || selectedOrder.status === 'PARTIAL') && (
                            <button 
                                onClick={handleOpenReceipt}
                                style={{ backgroundColor: BRAND_PRIMARY }}
                                className="text-white px-4 py-1.5 rounded-sm text-xs font-bold transition-colors uppercase shadow-sm flex items-center gap-2 hover:opacity-90"
                            >
                                <Truck size={14} /> {selectedOrder.status === 'PARTIAL' ? 'Completar Recepción' : 'Recibir Mercadería'}
                            </button>
                        )}
                        {orderLines.some(l => Number(l.received_quantity) > 0) && (
                            <button
                                onClick={handleOpenReturn}
                                className="text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 px-4 py-1.5 rounded-sm text-xs font-bold transition-colors uppercase shadow-sm flex items-center gap-2"
                            >
                                <RotateCcw size={14} /> Devolver Productos
                            </button>
                        )}
                        {selectedOrder.status === 'PARTIAL' && (
                            <button
                                onClick={handleForceCloseOrder}
                                disabled={saving}
                                className="text-white px-4 py-1.5 rounded-sm text-xs font-bold transition-all uppercase shadow-sm flex items-center gap-2 disabled:opacity-50 hover:opacity-90"
                                style={{ backgroundColor: '#730202' }}
                            >
                                <X size={14} /> Finalizar Orden
                            </button>
                        )}
                        <button 
                            onClick={handleDownloadPDF} 
                            className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-1.5 rounded-sm text-xs font-bold transition-colors uppercase shadow-sm flex items-center gap-2"
                        >
                            <Download size={14} /> PDF
                        </button>
                        {(selectedOrder.status === 'DRAFT' || selectedOrder.status === 'PENDING') && (
                        <button 
                            onClick={handleSendEmail} 
                            disabled={sendingEmail}
                            className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-1.5 rounded-sm text-xs font-bold transition-colors uppercase shadow-sm flex items-center gap-2 disabled:opacity-50"
                        >
                            <Mail size={14} /> {sendingEmail ? 'Enviando...' : 'Email'}
                        </button>
                        )}
                    </div>
                    <button
                        onClick={() => setView('list')}
                        className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-3 py-1 rounded-sm text-xs font-bold transition-colors uppercase shadow-sm"
                    >
                        Cerrar
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    {selectedOrder.status === 'DRAFT' && <span className="text-[10px] font-black uppercase text-slate-400 border border-slate-200 px-2 py-0.5 rounded-sm bg-slate-50">Solicitud de Presupuesto</span>}
                    {selectedOrder.status === 'PENDING' && <span className="text-[10px] font-black uppercase text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-sm bg-indigo-50">Orden de Compra</span>}
                    {selectedOrder.status === 'PARTIAL' && <span className="text-[10px] font-black uppercase text-amber-600 border border-amber-200 px-2 py-0.5 rounded-sm bg-amber-50">Recibida Parcial</span>}
                    {selectedOrder.status === 'RECEIVED' && <span className="text-[10px] font-black uppercase text-green-600 border border-green-200 px-2 py-0.5 rounded-sm bg-green-50">Orden Recibida</span>}
                </div>
            </div>
        </div>

        {/* CONTENIDO DEL DETALLE style Odoo */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
          <div className="max-w-6xl mx-auto bg-white border border-slate-300 shadow-sm rounded-sm">
            <div className="p-10">
                <div className="flex justify-between items-start mb-10">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                            {selectedOrder.status === 'DRAFT' ? 'Solicitud de Presupuesto' : 'Orden de Compra'}
                        </h1>
                        <h2 className="text-xl font-bold text-indigo-600 mt-1">#{String(selectedOrder.po_number).padStart(4, '0')}</h2>
                    </div>
                    <div className="text-right">
                        <div className="font-black text-xs uppercase text-slate-400 tracking-widest">Estado</div>
                        <div className={`text-lg font-black uppercase tracking-tighter ${
                            selectedOrder.status === 'PENDING' ? 'text-indigo-600' : 
                            selectedOrder.status === 'PARTIAL' ? 'text-amber-600' : 
                            selectedOrder.status === 'RECEIVED' ? 'text-green-600' : 
                            'text-slate-400'
                        }`}>
                            {selectedOrder.status === 'DRAFT' ? 'Presupuesto' : selectedOrder.status === 'PENDING' ? 'Confirmado' : selectedOrder.status === 'PARTIAL' ? 'Parcial' : 'Recibido'}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-20 mb-12">
                    <div className="space-y-4">
                        <div className="border-b border-slate-100 pb-2">
                            <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Proveedor</div>
                            <div className="text-lg font-bold text-slate-900 uppercase tracking-tight">
                                {selectedOrder.suppliers?.business_name || selectedOrder.suppliers?.name}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                           <div>
                              <div className="text-[10px] font-black uppercase text-slate-400">Fecha de Orden</div>
                              <div className="text-sm font-medium text-slate-700 font-mono">{selectedOrder.issue_date}</div>
                           </div>
                           <div>
                              <div className="text-[10px] font-black uppercase text-slate-400">Recepción Esperada</div>
                              <div className="text-sm font-medium text-slate-700 font-mono">{selectedOrder.expected_delivery_date || '-'}</div>
                           </div>
                        </div>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-sm border border-slate-200 flex flex-col justify-center items-center gap-3">
                        {selectedOrder.status !== 'DRAFT' && (() => {
                            const recSubtotal = orderLines.reduce((s, l) => s + (Number(l.received_quantity || 0) * Number(l.unit_cost)), 0);
                            const recTotal = recSubtotal * 1.19;
                            return (
                                <div className="w-full text-center border-b border-slate-200 pb-3 mb-1">
                                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">Total Recibido</div>
                                    <div className="text-3xl font-black text-green-600 tracking-tighter">${recTotal.toLocaleString('es-CL')}</div>
                                </div>
                            );
                        })()}
                        <div className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">Total Solicitado</div>
                        <div className={`font-black tracking-tighter ${selectedOrder.status === 'DRAFT' ? 'text-4xl text-indigo-600' : 'text-xl text-slate-400'}`}>
                            ${Number(selectedOrder.total_amount).toLocaleString('es-CL')}
                        </div>
                    </div>
                </div>

                <div className="mb-10">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 border-y border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <tr>
                                <th className="px-4 py-3">Descripción Producto</th>
                                <th className="px-4 py-3 text-right w-32">Cantidad</th>
                                {selectedOrder.status !== 'DRAFT' && (
                                    <>
                                        <th className="px-4 py-3 text-right w-32">Recibido</th>
                                        <th className="px-4 py-3 text-right w-40">Precio Unitario</th>
                                        <th className="px-4 py-3 text-right w-40">Subtotal</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {orderLines.map((line) => (
                                <tr key={line.id}>
                                    <td className="px-4 py-4 text-slate-900 font-bold uppercase tracking-tight">
                                        {line.products?.name}
                                        {line.products?.barcode && <span className="block text-[9px] font-normal text-slate-400 mt-0.5 tracking-widest">SKU: {line.products.barcode}</span>}
                                    </td>
                                    <td className="px-4 py-4 text-right text-slate-700 font-mono text-sm">{line.quantity}</td>
                                    {selectedOrder.status !== 'DRAFT' && (
                                        <>
                                            <td className="px-4 py-4 text-right">
                                                <span className={`font-mono text-sm ${Number(line.received_quantity) >= Number(line.quantity) ? 'text-green-600 font-bold' : 'text-slate-400 font-bold'}`}>
                                                    {line.received_quantity || 0}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-right text-slate-700 font-mono text-sm">${Number(line.unit_cost).toLocaleString('es-CL')}</td>
                                            <td className="px-4 py-4 text-right text-indigo-600 font-black text-sm font-mono">${(Number(line.received_quantity || 0) * Number(line.unit_cost)).toLocaleString('es-CL')}</td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {selectedOrder.status !== 'DRAFT' && (
                    <div className="flex justify-end pt-10 border-t border-slate-200">
                        <div className="w-80 space-y-2">
                            {(() => {
                                const receivedSubtotal = orderLines.reduce((sum, l) => sum + (Number(l.received_quantity || 0) * Number(l.unit_cost)), 0);
                                const receivedTax = receivedSubtotal * 0.19;
                                const receivedTotal = receivedSubtotal + receivedTax;
                                return (<>
                                    <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                        <span>Subtotal Neto:</span>
                                        <span className="text-slate-700 font-mono text-base">${receivedSubtotal.toLocaleString('es-CL')}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                        <span>Impuestos (19%):</span>
                                        <span className="text-slate-700 font-mono text-base">${receivedTax.toLocaleString('es-CL')}</span>
                                    </div>
                                    <div className="flex justify-between pt-4 mt-2 border-t-2 border-slate-900">
                                        <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Total Recibido:</span>
                                        <span className="text-2xl font-black text-indigo-600 font-mono tracking-tighter">${receivedTotal.toLocaleString('es-CL')}</span>
                                    </div>
                                </>);
                            })()}
                        </div>
                    </div>
                )}
                    {/* MODAL DE RECEPCION (ESTILO ODOO PREMIUM) */}
        {showReceiptModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-300">
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div style={{ color: BRAND_PRIMARY }}>
                    <Truck size={20} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">
                      Validar Recepción de Mercadería
                    </h3>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                      Compra OC #{String(selectedOrder.po_number).padStart(4, '0')} · {selectedOrder.suppliers?.business_name || selectedOrder.suppliers?.name}
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowReceiptModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Toolbar superior dentro del modal */}
              <div className="px-4 py-2 bg-white border-b border-gray-100 flex gap-2 shrink-0">
                <button 
                    onClick={handleValidateReception}
                    disabled={saving || !receiptData.document_number}
                    style={{ backgroundColor: BRAND_PRIMARY }}
                    className="text-white px-6 py-1 rounded-sm text-xs font-bold transition-all uppercase shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                    {saving ? 'Guardando...' : 'Validar'}
                </button>
                <button 
                    onClick={() => setShowReceiptModal(false)}
                    className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-1 rounded-sm text-xs font-bold transition-all uppercase shadow-sm"
                >
                    Descartar
                </button>
              </div>

              <div className="flex-1 overflow-y-auto bg-white">
                {/* Formulario Estilo Odoo (2 columnas) */}
                <div className="p-6 grid grid-cols-2 gap-x-20 gap-y-4">
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 items-center">
                      <label className="text-gray-500 font-bold text-[11px] text-right pr-6 uppercase tracking-tighter">Tipo Documento</label>
                      <select 
                        value={receiptData.document_type}
                        onChange={(e) => setReceiptData({...receiptData, document_type: e.target.value})}
                        className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1 text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none"
                      >
                        <option value="GUIA_DESPACHO">Guía de Despacho</option>
                        <option value="FACTURA">Factura de Compra</option>
                        <option value="BOLETA">Boleta</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 items-center">
                      <label className="text-gray-500 font-bold text-[11px] text-right pr-6 uppercase tracking-tighter font-bold">N° Documento</label>
                      <input 
                        type="text"
                        placeholder="Folio..."
                        value={receiptData.document_number}
                        onChange={(e) => setReceiptData({...receiptData, document_number: e.target.value.toUpperCase()})}
                        className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1 text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none font-bold italic text-[#4C3073]"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-3 items-start">
                      <label className="text-gray-500 font-bold text-[11px] text-right pr-6 uppercase tracking-tighter pt-1">Observaciones</label>
                      <textarea 
                        rows="2"
                        placeholder="Anomalías generales..."
                        value={receiptData.notes}
                        onChange={(e) => setReceiptData({...receiptData, notes: e.target.value.toUpperCase()})}
                        className="col-span-2 w-full bg-white border border-gray-300 rounded-sm px-2 py-1 text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none h-16 resize-none"
                      />
                    </div>
                    
                  </div>
                </div>

                {/* Tabla de Productos Estilo Odoo (Líneas) */}
                <div className="px-6 pb-6">
                  <div className="border border-gray-200 rounded-sm overflow-hidden">
                    <table className="w-full text-left text-[13px] border-collapse">
                      <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <tr>
                          <th className="px-4 py-2">Producto</th>
                          <th className="px-4 py-2 text-right w-24">Pedido</th>
                          <th className="px-4 py-2 text-right w-24">Recibido</th>
                          <th className="px-4 py-2 text-right w-32 font-bold text-gray-600">Recibir Ahora</th>
                          <th className="px-4 py-2 uppercase">Anomalía / Nota</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {receivingLines.map((line, idx) => {
                          const isFullyReceived = Number(line.received_quantity) >= Number(line.quantity);
                          return (
                            <tr key={line.id} className="hover:bg-gray-50/50">
                              <td className="px-4 py-2.5">
                                <div className="font-bold text-gray-800 uppercase tracking-tight">{line.products?.name}</div>
                                {line.products?.barcode && <div className="text-[9px] text-gray-400 font-mono italic">REF: {line.products?.barcode}</div>}
                              </td>
                              <td className="px-4 py-2.5 text-right font-medium text-gray-500">{line.quantity}</td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`font-mono text-[11px] ${isFullyReceived ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                                  {line.received_quantity || 0}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <input 
                                  type="number"
                                  disabled={isFullyReceived}
                                  value={line.received_now}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    const pending = Number(line.quantity) - Number(line.received_quantity || 0);
                                    if (val > pending) return;
                                    const newLines = [...receivingLines];
                                    newLines[idx].received_now = e.target.value;
                                    setReceivingLines(newLines);
                                  }}
                                  className="w-full bg-slate-50 border border-gray-200 rounded-sm px-2 py-1 text-right font-black text-[#4C3073] focus:bg-white focus:border-[#4C3073] outline-none disabled:opacity-30 appearance-none"
                                />
                              </td>
                              <td className="px-4 py-2.5">
                                <input 
                                  type="text"
                                  disabled={isFullyReceived}
                                  value={line.anomaly}
                                  onChange={(e) => {
                                    const newLines = [...receivingLines];
                                    newLines[idx].anomaly = e.target.value.toUpperCase();
                                    setReceivingLines(newLines);
                                  }}
                                  placeholder="Nota..."
                                  className="w-full bg-transparent border-b border-gray-200 text-xs py-1 focus:border-[#4C3073] outline-none placeholder:text-gray-300"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-400 italic">
                    * Los movimientos se registrarán automáticamente en el Kardex de Inventario.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* MODAL DE DEVOLUCIÓN */}
        {showReturnModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-red-200">
              {/* Header */}
              <div className="px-4 py-3 border-b border-red-100 bg-red-50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="text-red-600"><RotateCcw size={20} strokeWidth={2.5} /></div>
                  <div>
                    <h3 className="text-sm font-bold text-red-800 uppercase tracking-tight">Devolución de Mercadería</h3>
                    <div className="text-[10px] text-red-500 font-bold uppercase tracking-widest mt-0.5">
                      OC #{String(selectedOrder.po_number).padStart(4, '0')} · {selectedOrder.suppliers?.business_name || selectedOrder.suppliers?.name}
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowReturnModal(false)} className="text-red-400 hover:text-red-600 transition-colors"><X size={20} /></button>
              </div>

              {/* Toolbar */}
              <div className="px-4 py-2 bg-white border-b border-gray-100 flex gap-2 shrink-0">
                <button
                  onClick={handleValidateReturn}
                  disabled={saving || !returnData.document_number}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-1 rounded-sm text-xs font-bold transition-all uppercase shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Procesando...' : 'Validar Devolución'}
                </button>
                <button
                  onClick={() => setShowReturnModal(false)}
                  className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-4 py-1 rounded-sm text-xs font-bold transition-all uppercase shadow-sm"
                >
                  Descartar
                </button>
              </div>

              <div className="flex-1 overflow-y-auto bg-white">
                {/* Formulario (2 columnas) */}
                <div className="p-6 grid grid-cols-2 gap-x-20 gap-y-4">
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 items-center">
                      <label className="text-gray-500 font-bold text-[11px] text-right pr-6 uppercase tracking-tighter">Tipo Documento</label>
                      <select
                        value={returnData.document_type}
                        onChange={(e) => setReturnData({...returnData, document_type: e.target.value})}
                        className="col-span-2 w-full bg-white border border-red-200 rounded-sm px-2 py-1 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-400 outline-none"
                      >
                        <option value="NOTA_CREDITO">Nota de Crédito</option>
                        <option value="GUIA_DEVOLUCION">Guía de Devolución</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 items-center">
                      <label className="text-gray-500 font-bold text-[11px] text-right pr-6 uppercase tracking-tighter">N° Documento</label>
                      <input
                        type="text"
                        placeholder="Folio..."
                        value={returnData.document_number}
                        onChange={(e) => setReturnData({...returnData, document_number: e.target.value.toUpperCase()})}
                        className="col-span-2 w-full bg-white border border-red-200 rounded-sm px-2 py-1 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-400 outline-none font-bold italic text-red-700"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 items-start">
                      <label className="text-gray-500 font-bold text-[11px] text-right pr-6 uppercase tracking-tighter pt-1">Motivo / Obs.</label>
                      <textarea
                        rows="2"
                        placeholder="Motivo de la devolución..."
                        value={returnData.notes}
                        onChange={(e) => setReturnData({...returnData, notes: e.target.value.toUpperCase()})}
                        className="col-span-2 w-full bg-white border border-red-200 rounded-sm px-2 py-1 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-400 outline-none h-16 resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Tabla de productos a devolver */}
                <div className="px-6 pb-6">
                  <div className="border border-red-100 rounded-sm overflow-hidden">
                    <table className="w-full text-left text-[13px] border-collapse">
                      <thead className="bg-red-50 border-b border-red-100 text-[10px] font-black text-red-400 uppercase tracking-widest">
                        <tr>
                          <th className="px-4 py-2">Producto</th>
                          <th className="px-4 py-2 text-right w-32">Cant. Recibida</th>
                          <th className="px-4 py-2 text-right w-36">Costo Unit.</th>
                          <th className="px-4 py-2 text-right w-36 text-red-600">Cant. a Devolver</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50">
                        {returningLines.map((line, idx) => (
                          <tr key={line.id} className="hover:bg-red-50/30">
                            <td className="px-4 py-2.5">
                              <div className="font-bold text-gray-800 uppercase tracking-tight">{line.products?.name}</div>
                              {line.products?.barcode && <div className="text-[9px] text-gray-400 font-mono italic">REF: {line.products?.barcode}</div>}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-500">{line.received_quantity}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-500">${Number(line.unit_cost).toLocaleString('es-CL')}</td>
                            <td className="px-4 py-2.5">
                              <input
                                type="number"
                                min="0"
                                max={Number(line.received_quantity)}
                                value={line.return_now}
                                onChange={(e) => {
                                  const val = Math.min(Number(e.target.value), Number(line.received_quantity));
                                  const newLines = [...returningLines];
                                  newLines[idx].return_now = val < 0 ? 0 : val;
                                  setReturningLines(newLines);
                                }}
                                className="w-full bg-red-50 border border-red-200 rounded-sm px-2 py-1 text-right font-black text-red-700 focus:bg-white focus:border-red-500 outline-none appearance-none"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <div className="text-right space-y-1">
                      {(() => {
                        const sub = returningLines.reduce((s, l) => s + (Number(l.return_now) * Number(l.unit_cost)), 0);
                        const total = Math.round(sub * 1.19);
                        return (
                          <>
                            <div className="text-[10px] text-gray-400 font-bold uppercase">Subtotal Neto a Devolver: <span className="font-mono text-gray-600">${sub.toLocaleString('es-CL')}</span></div>
                            <div className="text-sm font-black text-red-700 uppercase">Total a Devolver (c/IVA): <span className="font-mono">${total.toLocaleString('es-CL')}</span></div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-red-400 italic">
                    * Se generará un movimiento OUT en el Kardex y se ajustará el stock y cantidades recibidas.
                  </div>
                </div>
              </div>
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
        {/* Control Panel Superior Odoo Style */}
        <div className="border-b border-slate-300 px-4 py-1.5 bg-white flex flex-col gap-1 shrink-0">
            <nav className="flex items-center text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                <span className="hover:text-indigo-600 cursor-pointer">Compras</span>
                <ChevronRight size={10} className="mx-1" />
                <span className="text-slate-900">Órdenes de Compra</span>
            </nav>
            
            <div className="flex justify-between items-center mt-0.5">
                <div className="flex gap-2">
                    <button 
                        onClick={() => { setView('form'); setLines([{ tempId: Date.now(), product_id: '', quantity: 1, unit_cost: 0 }]); }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-sm text-xs font-bold transition-colors uppercase shadow-sm"
                    >
                        Nuevo
                    </button>
                </div>

                <div className="relative w-64">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full rounded-sm border-slate-300 border pl-8 pr-3 py-1 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50/50"
                    />
                </div>
            </div>
        </div>

        {/* Tabla List View Odoo Style */}
        <div className="flex-1 overflow-auto p-2">
            <div className="border border-slate-300 bg-white shadow-sm">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead className="bg-slate-100 border-b border-slate-300 text-[10px] font-bold uppercase tracking-tighter text-slate-600">
                        <tr>
                            <th className="px-2 py-1.5 w-28">Referencia</th>
                            <th className="px-2 py-1.5">Proveedor</th>
                            <th className="px-2 py-1.5 w-32">Fecha</th>
                            <th className="px-2 py-1.5 text-right w-32">Total</th>
                            <th className="px-2 py-1.5 text-center w-28">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {filteredOrders.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-12 text-center text-slate-400">
                                    <ShoppingCart size={32} className="mx-auto text-slate-200 mb-2" />
                                    No se encontraron registros.
                                </td>
                            </tr>
                        ) : (
                            filteredOrders.map(o => (
                                <tr key={o.id} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer text-xs" onClick={() => fetchOrderDetails(o)}>
                                    <td className="px-2 py-1.5 font-bold text-slate-900">
                                        #{String(o.po_number).padStart(4, '0')}
                                    </td>
                                    <td className="px-2 py-1.5 text-slate-800 font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                                        {o.suppliers?.business_name || o.suppliers?.name}
                                    </td>
                                    <td className="px-2 py-1.5 text-slate-500 font-mono">
                                        {o.issue_date}
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-bold font-mono">
                                        {(o.status === 'PARTIAL' || o.status === 'RECEIVED') && o.purchase_order_items?.length > 0
                                            ? <span className="text-green-700">${(o.purchase_order_items.reduce((s, i) => s + (Number(i.received_quantity || 0) * Number(i.unit_cost)), 0) * 1.19).toLocaleString('es-CL')}</span>
                                            : <span className="text-slate-900">${Number(o.total_amount).toLocaleString('es-CL')}</span>
                                        }
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        {o.status === 'PENDING' && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-tighter">
                                                Confirmada
                                            </span>
                                        )}
                                        {o.status === 'PARTIAL' && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-tighter">
                                                Por Completar
                                            </span>
                                        )}
                                        {o.status === 'DRAFT' && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-black bg-slate-100 text-slate-600 border border-slate-300 uppercase tracking-tighter">
                                                Presupuesto
                                            </span>
                                        )}
                                        {o.status === 'RECEIVED' && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-black bg-green-50 text-green-700 border border-green-200 uppercase tracking-tighter">
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