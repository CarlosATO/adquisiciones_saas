import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

// Registrar fuente para un look más profesional (opcional, por defecto usa Helvetica)
// Font.register({ family: 'Helvetica', fontWeight: 'normal' });

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#334155',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
    borderBottomWidth: 2,
    borderBottomColor: '#4f46e5',
    paddingBottom: 10,
  },
  titleSmall: {
    fontSize: 9,
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: 2,
    fontWeight: 'bold',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: 'black',
    color: '#1e293b',
    letterSpacing: -1,
  },
  orderNumber: {
    fontSize: 18,
    color: '#4f46e5',
    fontWeight: 'bold',
  },
  statusBadge: {
    padding: '4 8',
    backgroundColor: '#f1f5f9',
    borderRadius: 2,
    textTransform: 'uppercase',
    fontSize: 8,
    fontWeight: 'bold',
    color: '#64748b',
  },
  infoSection: {
    flexDirection: 'row',
    marginBottom: 30,
    gap: 40,
  },
  infoCol: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: 100,
    color: '#94a3b8',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    fontSize: 8,
  },
  value: {
    flex: 1,
    color: '#1e293b',
    fontWeight: 'bold',
  },
  table: {
    width: 'auto',
    marginBottom: 40,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    padding: '8 4',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    padding: '8 4',
    alignItems: 'center',
  },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: 'right' },
  colPrice: { flex: 1.5, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },
  headerText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  totalsBox: {
    width: 200,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalLabel: {
    color: '#64748b',
    fontSize: 9,
    textTransform: 'uppercase',
  },
  totalValue: {
    color: '#1e293b',
    fontWeight: 'bold',
  },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#1e293b',
  },
  grandTotalLabel: {
    fontSize: 11,
    fontWeight: 'black',
    color: '#1e293b',
    textTransform: 'uppercase',
  },
  grandTotalValue: {
    fontSize: 14,
    fontWeight: 'black',
    color: '#4f46e5',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  }
});

const PurchaseOrderPDF = ({ order, lines }) => {
  const isDraft = order.status === 'DRAFT';
  const supplierName = order.suppliers?.business_name || order.suppliers?.name || 'Proveedor Desconocido';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>{isDraft ? 'SOLICITUD DE PRESUPUESTO' : 'ORDEN DE COMPRA'}</Text>
            <Text style={styles.orderNumber}>#{String(order.po_number).padStart(4, '0')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
             <Text style={styles.titleSmall}>Estado</Text>
             <Text style={styles.statusBadge}>
                {order.status === 'DRAFT' ? 'Presupuesto' : order.status === 'PENDING' ? 'Confirmada' : 'Recibida'}
             </Text>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoCol}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Proveedor:</Text>
              <Text style={styles.value}>{supplierName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Fecha Emitida:</Text>
              <Text style={styles.value}>{order.issue_date}</Text>
            </View>
          </View>
          <View style={styles.infoCol}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Fecha Esperada:</Text>
              <Text style={styles.value}>{order.expected_delivery_date || '-'}</Text>
            </View>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesc, styles.headerText]}>Descripción</Text>
            <Text style={[styles.colQty, styles.headerText]}>Cant.</Text>
            {!isDraft && (
              <>
                <Text style={[styles.colPrice, styles.headerText]}>Precio Unit.</Text>
                <Text style={[styles.colTotal, styles.headerText]}>Subtotal</Text>
              </>
            )}
          </View>

          {lines.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colDesc}>{item.products?.name || 'Producto sin nombre'}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              {!isDraft && (
                <>
                  <Text style={styles.colPrice}>${Number(item.unit_cost).toLocaleString('es-CL')}</Text>
                  <Text style={styles.colTotal}>${Number(item.total_cost).toLocaleString('es-CL')}</Text>
                </>
              )}
            </View>
          ))}
        </View>

        {/* Totals */}
        {!isDraft && (
          <View style={styles.totalsContainer}>
            <View style={styles.totalsBox}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal Neto:</Text>
                <Text style={styles.totalValue}>${Number(order.subtotal).toLocaleString('es-CL')}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>IVA (19%):</Text>
                <Text style={styles.totalValue}>${Number(order.tax_amount).toLocaleString('es-CL')}</Text>
              </View>
              <View style={styles.grandTotal}>
                <Text style={styles.grandTotalLabel}>Total:</Text>
                <Text style={styles.grandTotalValue}>${Number(order.total_amount).toLocaleString('es-CL')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          Documento generado por Datix ERP - {new Date().toLocaleDateString()}
        </Text>
      </Page>
    </Document>
  );
};

export default PurchaseOrderPDF;
