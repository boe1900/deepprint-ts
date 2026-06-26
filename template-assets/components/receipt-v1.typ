// receipt-v1.typ
// AI usage: Use this source for narrow 58mm/80mm order receipts, cashier tickets,
// takeaway receipts, QR receipts, and simple food-service receipts.
// Rules: Keep receipts narrow, clipped, readable, and vertically compact. Prefer
// these helpers before inventing new grids. Inline only helpers you need into
// final template.typ. Do not keep local lib imports.
#import "@preview/tiaoma:0.3.0"

// get
// Purpose: safe dictionary read.
// Inputs: dict, key, default.
// Use when: optional fields may be missing from data.json.
// Avoid: direct access for optional fields.
#let get(dict, key, default: none) = dict.at(key, default: default)

// receipt-preset
// Purpose: central spacing and column tuning for 58mm/80mm thermal paper.
// Inputs: width.
// Use when: creating the top-level receipt layout.
// Rules: keep columns and gaps derived from this preset so Chinese labels align.
#let receipt-preset(width: 58mm) = {
  if width <= 58.5mm {
    (
      width: 58mm,
      margin: 2.5mm,
      text-size: 8.6pt,
      section-gap: 2.2mm,
      row-gap: 1.6pt,
      item-name: 1fr,
      item-qty: 9mm,
      item-amount: 14mm,
      gutter: 4pt,
      qr-size: 18mm,
    )
  } else {
    (
      width: 80mm,
      margin: 4mm,
      text-size: 9pt,
      section-gap: 3mm,
      row-gap: 2.2pt,
      item-name: 1fr,
      item-qty: 12mm,
      item-amount: 18mm,
      gutter: 6pt,
      qr-size: 21mm,
    )
  }
}

// safe-page
// Purpose: lock physical paper width and clip overflow.
// Inputs: preset, body.
// Use when: wrapping the whole receipt.
// Rules: never remove clip:true for thermal paper.
#let safe-page(preset, body) = {
  set page(width: preset.width, height: auto, margin: 0pt)
  set text(font: "Noto Sans CJK SC", size: preset.text-size, top-edge: "bounds", bottom-edge: "bounds")
  block(width: preset.width, inset: preset.margin, clip: true)[#body]
}

// safe-text
// Purpose: render one clipped text fragment.
// Inputs: body, optional size/weight.
// Use when: product names, labels, footer lines, and optional notes can be long.
#let safe-text(body, size: auto, weight: 400) = {
  let content = str(body)
  if size == auto {
    block(clip: true)[#text(weight: weight, top-edge: "bounds", bottom-edge: "bounds")[#content]]
  } else {
    block(clip: true)[#text(size: size, weight: weight, top-edge: "bounds", bottom-edge: "bounds")[#content]]
  }
}

// divider
// Purpose: consistent receipt divider.
// Inputs: strong/dashed flags.
// Use when: separating header, items, totals, and footer.
#let divider(strong: false, dashed: false) = {
  line(
    length: 100%,
    stroke: (
      paint: if strong { rgb("1F2937") } else { rgb("D1D5DB") },
      thickness: if strong { 0.9pt } else { 0.7pt },
      dash: if dashed { (1.6pt, 3pt) } else { none },
    ),
  )
}

// section-gap
// Purpose: vertical rhythm around receipt sections.
// Inputs: preset.
// Use when: inserting a divider between large sections.
#let section-gap(preset, strong: false, dashed: false) = {
  v(preset.section-gap)
  divider(strong: strong, dashed: dashed)
  v(preset.section-gap)
}

// receipt-header
// Purpose: centered store/order block.
// Inputs: store, order, preset.
// Use when: rendering brand/store title and order metadata.
// Avoid: putting item details here.
#let receipt-header(store, order, preset) = {
  align(center)[
    #safe-text(store.name, size: 11pt, weight: 700)
    #if "address" in store [#linebreak()#safe-text(store.address, size: 7pt)]
    #linebreak()
    #text(size: 7pt)[订单 #order.number#if "time" in order [ · #order.time]]
  ]
  section-gap(preset, dashed: true)
}

// label-value-row
// Purpose: two-column receipt metadata row.
// Inputs: left, value, preset.
// Use when: table number, cashier, payment method, discounts, or totals.
#let label-value-row(left, value, preset, weight: 400) = grid(
  columns: (1fr, auto),
  gutter: preset.gutter,
  safe-text(left, weight: weight),
  align(right)[#text(weight: weight)[#str(value)]],
)

// receipt-meta
// Purpose: render optional label/value rows.
// Inputs: rows with label/value, preset.
// Use when: order metadata or payment rows are present.
#let receipt-meta(rows, preset) = {
  if rows.len() > 0 {
    for (index, row) in rows.enumerate() {
      if index > 0 { v(preset.row-gap) }
      label-value-row(row.label, row.value, preset)
    }
    section-gap(preset)
  }
}

// receipt-item-row
// Purpose: one product line.
// Inputs: name, qty, amount, preset.
// Use when: rendering the main item list.
// Avoid: multi-line notes; put notes in footer.
// Rules: keep qty and amount right aligned.
#let receipt-item-row(name, qty, amount, preset) = grid(
  columns: (preset.item-name, preset.item-qty, preset.item-amount),
  gutter: preset.gutter,
  safe-text(name),
  align(right)[#str(qty)],
  align(right)[#str(amount)],
)

// receipt-items
// Purpose: full item list with Chinese headers.
// Inputs: items array, preset.
// Use when: receipt has purchasable line items.
#let receipt-items(items, preset) = {
  grid(
    columns: (preset.item-name, preset.item-qty, preset.item-amount),
    gutter: preset.gutter,
    [品名],
    align(right)[数量],
    align(right)[金额],
  )
  v(1.2pt)
  divider(strong: true)
  v(preset.row-gap)
  for (index, item) in items.enumerate() {
    if index > 0 { v(preset.row-gap) }
    receipt-item-row(item.name, item.qty, item.amount, preset)
  }
  section-gap(preset, strong: true)
}

// receipt-summary
// Purpose: subtotal/discount/total rows.
// Inputs: rows with label/value/emphasis, preset.
// Use when: rendering totals near the bottom.
#let receipt-summary(rows, preset) = {
  for (index, row) in rows.enumerate() {
    if index > 0 { v(preset.row-gap) }
    label-value-row(row.label, row.value, preset, weight: if get(row, "emphasis", default: false) { 700 } else { 400 })
  }
}

// fries-icon
// Purpose: small decorative fries icon for fast-food receipts.
// Inputs: none.
// Use when: user asks for fries/fast-food/KFC style decoration.
// Avoid: using it as a large logo; it is intentionally tiny.
#let fries-icon() = box(width: 8mm, height: 8mm, inset: 0pt, clip: true)[
  #place(dx: 1.4mm, dy: 0.2mm)[#rect(width: 1.2mm, height: 5.8mm, fill: rgb("FFD166"), radius: 0.4mm)]
  #place(dx: 3.1mm, dy: 0mm)[#rect(width: 1.2mm, height: 6.2mm, fill: rgb("F9C74F"), radius: 0.4mm)]
  #place(dx: 4.8mm, dy: 0.4mm)[#rect(width: 1.2mm, height: 5.6mm, fill: rgb("FFD166"), radius: 0.4mm)]
  #place(dx: 1mm, dy: 3.4mm)[#rect(width: 6mm, height: 4.2mm, fill: rgb("D71920"), radius: 0.5mm)]
  #place(dx: 2.4mm, dy: 5.1mm)[#text(size: 3pt, fill: white, weight: 700)[KFC]]
]

// receipt-badges
// Purpose: centered badge lines, optionally with fries icon.
// Inputs: badges array, preset.
// Use when: adding fast-food marks, dine-in/takeaway tags, or short notices.
#let receipt-badges(badges, preset) = {
  if badges.len() > 0 {
    v(3mm)
    for (index, badge) in badges.enumerate() {
      if index > 0 { v(1.4pt) }
      align(center)[#fries-icon()#h(2mm)#text(size: 7pt, weight: 700)[#badge]]
    }
  }
}

// receipt-qr
// Purpose: centered QR code block.
// Inputs: qr with value/label, preset.
// Use when: order lookup, payment, invoice, or membership QR is needed.
// Rules: keep white background and a readable quiet zone.
#let receipt-qr(qr, preset) = {
  if qr != none and "value" in qr {
    v(3mm)
    align(center)[
      #box(width: preset.qr-size, height: preset.qr-size, fill: white, inset: 0pt, clip: true)[
        #tiaoma.barcode(str(qr.value), "QRCode", width: preset.qr-size, height: preset.qr-size)
      ]
      #linebreak()
      #text(size: 7pt)[#get(qr, "label", default: "扫码查看订单")]
    ]
  }
}

// receipt-footer
// Purpose: small centered footer lines.
// Inputs: lines array, preset.
// Use when: thank-you text, policy notes, or short legal text.
#let receipt-footer(lines, preset) = {
  if lines.len() > 0 {
    v(3mm)
    for (index, line) in lines.enumerate() {
      if index > 0 { v(1.4pt) }
      align(center)[#safe-text(line, size: 7pt)]
    }
  }
}

// receipt-document
// Purpose: complete receipt composition.
// Inputs: data, optional width.
// Use when: generating a complete receipt template.
// Rules: keep data fields business-level: store, order, items, totals, payments, badges, qr, footer.
#let receipt-document(data, width: 58mm) = {
  let preset = receipt-preset(width: width)
  safe-page(preset)[
    #receipt-header(data.store, data.order, preset)
    #receipt-meta(get(data.order, "metadata", default: ()), preset)
    #receipt-items(get(data, "items", default: ()), preset)
    #receipt-summary(get(data, "totals", default: ()), preset)
    #receipt-meta(get(data, "payments", default: ()), preset)
    #receipt-badges(get(data, "badges", default: ()), preset)
    #receipt-qr(get(data, "qr", default: none), preset)
    #receipt-footer(get(data, "footer", default: ()), preset)
  ]
}
