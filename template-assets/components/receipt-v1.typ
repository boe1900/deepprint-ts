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
// Rules: margins and columns follow the receipt design brief physical limits.
#let receipt-preset(width: 58mm) = {
  if width <= 58.5mm {
    (
      width: 58mm,
      margin-x: 4mm,
      margin-y: 2mm,
      text-size: 8.6pt,
      section-gap: 2.2mm,
      row-gap: 1.6pt,
      item-name: 1fr,
      item-qty: 14mm,
      item-amount: 18mm,
      label-value: 18mm,
      gutter: 4pt,
      qr-size: 28mm,
      callout-size: 24pt,
      bottom-spacer: 25pt,
    )
  } else {
    (
      width: 80mm,
      margin-x: 6mm,
      margin-y: 3mm,
      text-size: 9pt,
      section-gap: 3mm,
      row-gap: 2.2pt,
      item-name: 1fr,
      item-qty: 20mm,
      item-amount: 23mm,
      label-value: 24mm,
      gutter: 6pt,
      qr-size: 38mm,
      callout-size: 28pt,
      bottom-spacer: 35pt,
    )
  }
}

// safe-page
// Purpose: lock physical paper width, apply safe margins, and clip overflow.
// Inputs: preset, body.
// Use when: wrapping the whole receipt.
// Rules: never remove clip:true for thermal paper.
#let safe-page(preset, body) = {
  set page(width: preset.width, height: auto, margin: 0pt)
  set text(
    font: ("PingFang SC", "Noto Sans CJK SC", "Arial"),
    size: preset.text-size,
    top-edge: "bounds",
    bottom-edge: "bounds",
  )
  block(
    width: preset.width,
    inset: (x: preset.margin-x, y: preset.margin-y),
    clip: true,
  )[#body]
}

// safe-text
// Purpose: render one clipped text fragment.
// Inputs: body, optional size/weight/fill.
// Use when: product names, labels, footer lines, and optional notes can be long.
// Rules: fill:auto inherits the current text color; never pass fill:none to text.
#let safe-text(body, size: auto, weight: 400, fill: auto) = {
  let content = str(body)
  let args = (
    weight: weight,
    top-edge: "bounds",
    bottom-edge: "bounds",
  )
  if size != auto {
    args.insert("size", size)
  }
  if fill != auto and fill != none {
    args.insert("fill", fill)
  }
  block(width: 100%, clip: true)[
    #text(..args)[#content]
  ]
}

// safe-id
// Purpose: render long order numbers, hash values, or other dense IDs.
// Inputs: body, preset.
// Use when: IDs have little natural whitespace.
#let safe-id(body, preset) = {
  block(width: 100%, clip: true)[
    #text(size: preset.text-size * 0.82, font: "Noto Sans Mono")[#str(body)]
  ]
}

// muted-text
// Purpose: small secondary receipt text without exposing raw fill:none risk.
// Inputs: body, optional size/weight.
#let muted-text(body, size: 7.5pt, weight: 400) = safe-text(
  body,
  size: size,
  weight: weight,
  fill: rgb("6B7280"),
)

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
    #safe-text("订单号: " + str(order.number), size: 7.5pt)
    #if "time" in order [
      #linebreak()
      #safe-text("时间: " + str(order.time), size: 7.5pt)
    ]
  ]
  section-gap(preset, dashed: true)
}

// label-value-row
// Purpose: two-column receipt metadata row.
// Inputs: left, value, preset.
// Use when: table number, cashier, payment method, discounts, or totals.
// Rules: right value column is fixed width; do not use auto for thermal receipt grids.
#let label-value-row(left, value, preset, weight: 400) = grid(
  columns: (1fr, preset.label-value),
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

// receipt-note
// Purpose: render remarks, delivery notes, or long address-like blocks.
// Inputs: note text, preset.
// Rules: notes are independent full-width blocks, never beside amounts.
#let receipt-note(note, preset) = {
  if note != none and str(note) != "" {
    block(
      width: 100%,
      fill: rgb("F3F4F6"),
      inset: 5pt,
      radius: 2pt,
      breakable: false,
    )[
      #safe-text(note, size: preset.text-size * 0.9)
    ]
    v(preset.row-gap)
  }
}

// receipt-callout
// Purpose: large centered visual callout.
// Inputs: callout with value and optional label, preset.
// Use when: pickup code, queue number, table number, or any primary identifier.
// Avoid: ordinary metadata rows.
// Rules: keep it independent, centered, and much larger than body text.
#let receipt-callout(callout, preset) = {
  if callout != none and "value" in callout and str(callout.value) != "" {
    block(width: 100%, breakable: false)[
      #align(center)[
        #text(size: 8pt, fill: rgb("6B7280"), weight: 700)[#get(callout, "label", default: "取餐号")]
        #linebreak()
        #v(1.5mm)
        #text(size: preset.callout-size, weight: 900, top-edge: "bounds", bottom-edge: "bounds")[#str(callout.value)]
      ]
    ]
    section-gap(preset, dashed: true)
  }
}

// receipt-item-row
// Purpose: one product line with optional unit-price formula.
// Inputs: item with name, qty, amount, optional formula, preset.
// Use when: rendering the main item list.
// Rules: qty and amount stay fixed-width, right aligned, and top aligned.
#let receipt-item-row(item, preset) = {
  let name = get(item, "name", default: "")
  let qty = get(item, "qty", default: "")
  let amount = get(item, "amount", default: "")
  let formula = get(item, "formula", default: none)
  let row = grid(
    columns: (preset.item-name, preset.item-qty, preset.item-amount),
    gutter: preset.gutter,
    align: (left + top, right + top, right + top),
    safe-text(name),
    align(right)[#str(qty)],
    align(right)[#str(amount)],
  )

  if formula != none and str(formula) != "" {
    block(width: 100%, breakable: false)[
      #row
      #v(0.5pt)
      #h(2pt)#muted-text(formula, size: 7.5pt)
    ]
  } else {
    row
  }
}

// receipt-items
// Purpose: full item list with Chinese headers and overflow truncation.
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

  let display-items = items
  let omitted-count = 0
  if items.len() > 49 {
    display-items = items.slice(0, 48)
    omitted-count = items.len() - 48
  }

  for (index, item) in display-items.enumerate() {
    if index > 0 { v(preset.row-gap) }
    receipt-item-row(item, preset)
  }

  if omitted-count > 0 {
    v(preset.row-gap)
    align(center)[
      #muted-text("......（其余 " + str(omitted-count) + " 件商品已省略）", size: 7.5pt)
    ]
  }

  section-gap(preset, strong: true)
}

// receipt-summary
// Purpose: subtotal/discount/total rows.
// Inputs: rows with label/value/emphasis, preset.
// Use when: rendering totals near the bottom.
// Rules: keep summary together so totals are not split away from labels.
#let receipt-summary(rows, preset) = {
  if rows.len() > 0 {
    block(width: 100%, breakable: false)[
      #for (index, row) in rows.enumerate() {
        if index > 0 { v(preset.row-gap) }
        label-value-row(row.label, row.value, preset, weight: if get(row, "emphasis", default: false) { 700 } else { 400 })
      }
    ]
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
    block(width: 100%, breakable: false)[
      #for (index, badge) in badges.enumerate() {
        if index > 0 { v(1.4pt) }
        align(center)[#fries-icon()#h(2mm)#text(size: 7.5pt, weight: 700)[#badge]]
      }
    ]
  }
}

// receipt-qr
// Purpose: centered QR code block.
// Inputs: qr with value/label, preset.
// Use when: order lookup, payment, invoice, or membership QR is needed.
// Rules: keep white background, quiet zone, and exact square dimensions.
#let receipt-qr(qr, preset) = {
  if qr != none and "value" in qr {
    v(3mm)
    align(center)[
      #block(breakable: false)[
        #box(width: preset.qr-size + 3mm, height: preset.qr-size + 3mm, fill: white, inset: 1.5mm, clip: true)[
          #tiaoma.barcode(str(qr.value), "QRCode", width: preset.qr-size, height: preset.qr-size)
        ]
        #linebreak()
        #v(1mm)
        #muted-text(get(qr, "label", default: "扫码查看订单"), size: 7.5pt)
      ]
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
    block(width: 100%, breakable: false)[
      #for (index, line) in lines.enumerate() {
        if index > 0 { v(1.4pt) }
        align(center)[#safe-text(line, size: 7.5pt)]
      }
    ]
  }
}

// receipt-document
// Purpose: complete receipt composition.
// Inputs: data, optional width.
// Use when: generating a complete receipt template.
// Rules: keep data fields business-level: store, order, callout, items, totals, payments, badges, qr, footer, note.
#let receipt-document(data, width: 58mm) = {
  let preset = receipt-preset(width: width)
  safe-page(preset)[
    #receipt-header(data.store, data.order, preset)
    #receipt-callout(get(data, "callout", default: none), preset)
    #receipt-meta(get(data.order, "metadata", default: ()), preset)
    #receipt-items(get(data, "items", default: ()), preset)
    #receipt-note(get(data, "note", default: none), preset)
    #receipt-summary(get(data, "totals", default: ()), preset)
    #receipt-meta(get(data, "payments", default: ()), preset)
    #receipt-badges(get(data, "badges", default: ()), preset)
    #receipt-qr(get(data, "qr", default: none), preset)
    #receipt-footer(get(data, "footer", default: ()), preset)
    #v(preset.bottom-spacer)
  ]
}
