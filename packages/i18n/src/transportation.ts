export const transportationMessages = {
  en: {
    'transport.title': 'Transportation',
    'transport.include': 'Include transportation in the offer',
    'transport.hint':
      'One combined transport quote for this rental. Amounts are fixed, not multiplied by machine quantity or rental days.',
    'transport.customer': 'Transport price offered to customer',
    'transport.supplier': 'Transport supplier quote',
    'transport.supplierName': 'Transport company / reference (optional)',
    'transport.supplierCost': 'Transport supplier cost',
    'transport.unknownHint':
      'Leave supplier cost blank if not yet quoted. Margin will remain unavailable.',
    'transport.margin': 'Estimated transport margin (excluding VAT)',
    'transport.customerNet': 'Customer transport price (excluding VAT)',
    'transport.supplierNet': 'Supplier transport cost (excluding VAT)',
    'transport.missing': 'Missing supplier quotes',
    'transport.history': 'Previous transport quotes',
    'transport.none': 'Transportation is not included in this offer.',
    'transport.estimateHint':
      'Estimate only: customer price less supplier quote, excluding VAT. This does not confirm transport completion, invoicing, or payment.',
    'transport.periodHint':
      'Transport quotes are counted once by planned rental start (creation date if no start is set), excluding cancelled rentals. Separate currencies and rental stages are not combined. Transport is not allocated to machine/model/category-filtered reports or machine profitability.',
    'transport.empty':
      'No included transportation quotes in this reporting period.',
    'transport.count': 'Transport quotes',
    'admin.permission.rentals.transport_costs.view':
      'Transport supplier costs — View',
    'admin.permission.rentals.transport_costs.edit':
      'Transport supplier costs — Edit',
  },
  tr: {
    'transport.title': 'Nakliye',
    'transport.include': 'Teklife nakliye bedelini dahil et',
    'transport.hint':
      'Bu kiralama için tek bir toplam nakliye teklifi. Tutarlar sabittir; makine adedi veya kira günüyle çarpılmaz.',
    'transport.customer': 'Müşteriye sunulan nakliye fiyatı',
    'transport.supplier': 'Nakliye firmasının teklifi',
    'transport.supplierName': 'Nakliye firması / referans (isteğe bağlı)',
    'transport.supplierCost': 'Nakliye firması maliyeti',
    'transport.unknownHint':
      'Henüz teklif alınmadıysa maliyeti boş bırakın. Tahmini marj hesaplanmayacaktır.',
    'transport.margin': 'Tahmini nakliye marjı (KDV hariç)',
    'transport.customerNet': 'Müşteri nakliye fiyatı (KDV hariç)',
    'transport.supplierNet': 'Nakliye firması maliyeti (KDV hariç)',
    'transport.missing': 'Eksik firma teklifleri',
    'transport.history': 'Önceki nakliye teklifleri',
    'transport.none': 'Bu teklife nakliye dahil değil.',
    'transport.estimateHint':
      'Yalnızca tahmin: KDV hariç müşteri fiyatı eksi firma teklifi. Nakliyenin tamamlandığını, faturalandırıldığını veya ödendiğini göstermez.',
    'transport.periodHint':
      'Nakliye teklifleri planlanan kira başlangıcına (başlangıç yoksa oluşturulma tarihine) göre bir kez sayılır; iptal edilenler hariçtir. Para birimleri ve kiralama aşamaları birleştirilmez. Nakliye, makine/model/kategori filtreli raporlara veya makine kârlılığına dağıtılmaz.',
    'transport.empty': 'Bu rapor döneminde dahil edilen nakliye teklifi yok.',
    'transport.count': 'Nakliye teklifleri',
    'admin.permission.rentals.transport_costs.view':
      'Nakliye firması maliyetleri — Görüntüle',
    'admin.permission.rentals.transport_costs.edit':
      'Nakliye firması maliyetleri — Düzenle',
  },
} as const;
