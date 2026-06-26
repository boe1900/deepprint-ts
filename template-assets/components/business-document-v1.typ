// business-document-v1.typ
// AI usage: Use this source for invoices, quotations, statements, order forms,
// purchase orders, and A4 business documents. Inline needed helpers into final template.typ.
// Rules: Keep layout quiet, tabular, and information-dense.

// get
// Purpose: safe dictionary read.
#let get(dict, key, default: "") = dict.at(key, default: default)

// arr-at
// Purpose: safe array access for optional party columns.
#let arr-at(values, index, default: (:)) = {
  if values.len() > index { values.at(index) } else { default }
}

// safe-doc-page
// Purpose: A4 business document setup.
// Inputs: body.
// Use when: rendering the complete document.
#let safe-doc-page(body) = {
  set page(paper: "a4", margin: (top: 16mm, right: 18mm, bottom: 18mm, left: 18mm), numbering: "1 / 1")
  set text(font: ("Noto Sans CJK SC", "Arial"), size: 10pt, fill: rgb("111827"))
  set par(justify: false)
  body
}

// muted-line
// Purpose: clipped low-emphasis text line.
// Inputs: body, size.
// Use when: rendering addresses, contacts, footnotes, and payment terms.
#let muted-line(body, size: 8.5pt) = {
  block(width: 100%, clip: true)[#text(size: size, fill: rgb("6B7280"))[#body]]
}

// label-value
// Purpose: compact label/value pair.
// Inputs: label, value, strong.
// Use when: metadata, party details, and totals need aligned labels.
#let label-value(label, value, strong: false) = {
  let weight = if strong { 700 } else { 400 }
  grid(
    columns: (auto, 1fr),
    gutter: 6pt,
    [#text(size: 9pt, weight: 700)[#str(label)]],
    [#text(size: 9pt, weight: weight)[#str(value)]],
  )
}

// section-title
// Purpose: small section title.
// Inputs: title.
// Use when: introducing metadata or notes.
#let section-title(title) = {
  text(size: 9pt, weight: 700, fill: rgb("374151"))[#title]
  v(1.5mm)
}

// line-list
// Purpose: vertical list of muted lines.
// Inputs: lines array.
// Use when: company/contact/address has several lines.
#let line-list(lines) = {
  for line in lines {
    muted-line(line)
    v(1mm)
  }
}

// header
// Purpose: company identity and document title/number.
// Inputs: data.
// Use when: rendering top A4 business document header.
#let header(data) = {
  grid(
    columns: (1fr, auto),
    gutter: 12mm,
    [
      #text(size: 13pt, weight: 700)[#data.company.name]
      #v(1.5mm)
      #line-list(get(data.company, "address_lines", default: ()))
      #line-list(get(data.company, "contact_lines", default: ()))
    ],
    [
      #align(right)[
        #text(size: 20pt, weight: 700)[#data.document.title]
        #linebreak()
        #text(size: 10pt)[No. #data.document.number]
      ]
    ],
  )
}

// metadata
// Purpose: document metadata block.
// Inputs: rows with label/value.
#let metadata(rows) = {
  if rows.len() > 0 {
    section-title("Document")
    for row in rows {
      label-value(row.label, row.value)
      v(1mm)
    }
  }
}

// party-card
// Purpose: one buyer/seller/client card.
// Inputs: party.
// Use when: rendering billing/shipping/customer/supplier blocks.
#let party-card(party) = {
  block(width: 100%, inset: 6pt, stroke: (paint: rgb("D1D5DB"), thickness: 0.5pt))[
    #text(size: 9pt, weight: 700, fill: rgb("374151"))[#party.title]
    #linebreak()
    #text(size: 10pt, weight: 700)[#party.name]
    #v(1.5mm)
    #line-list(get(party, "address_lines", default: ()))
    #for row in get(party, "details", default: ()) {
      label-value(row.label, row.value)
      v(1mm)
    }
  ]
}

// parties
// Purpose: two-column party layout.
// Inputs: rows array.
// Rules: use at most two primary cards in this layout.
#let parties(rows) = grid(
  columns: (1fr, 1fr),
  gutter: 8mm,
  [#party-card(arr-at(rows, 0))],
  [#party-card(arr-at(rows, 1))],
)

// table-cell
// Purpose: consistent table cell.
// Inputs: body, align, header, strong.
#let table-cell(body, align: left + horizon, header: false, strong: false) = {
  let weight = if header or strong { 700 } else { 400 }
  if header {
    table.cell(align: align, fill: rgb("F3F4F6"))[#text(size: 9pt, weight: weight)[#body]]
  } else {
    table.cell(align: align)[#text(size: 9pt, weight: weight)[#body]]
  }
}

// item-cells
// Purpose: convert one item object into table cells.
// Inputs: index, item.
// Rules: keep numeric columns right aligned.
#let item-cells(index, item) = (
  table-cell(str(index + 1), align: center + horizon),
  table-cell(get(item, "code")),
  table-cell(item.description),
  table-cell(get(item, "quantity"), align: right + horizon),
  table-cell(get(item, "unit_price"), align: right + horizon),
  table-cell(item.amount, align: right + horizon),
)

// items-table
// Purpose: main business line item table.
// Inputs: items array.
// Use when: invoice/quote/order has item rows.
#let items-table(items) = table(
  columns: (10mm, 22mm, 1fr, 16mm, 24mm, 24mm),
  stroke: (paint: rgb("D1D5DB"), thickness: 0.45pt),
  inset: (x: 4pt, y: 5pt),
  table.header(
    repeat: true,
    table-cell("#", align: center + horizon, header: true),
    table-cell("Code", header: true),
    table-cell("Description", header: true),
    table-cell("Qty", align: right + horizon, header: true),
    table-cell("Unit", align: right + horizon, header: true),
    table-cell("Amount", align: right + horizon, header: true),
  ),
  ..items.enumerate().map(((index, item)) => item-cells(index, item)).flatten(),
)

// totals
// Purpose: right-aligned total block.
// Inputs: rows with label/value/emphasis.
#let totals(rows) = {
  if rows.len() > 0 {
    grid(
      columns: (1fr, 54mm),
      [],
      [
        #for row in rows {
          label-value(row.label, row.value, strong: get(row, "emphasis", default: false))
          v(1.2mm)
        }
      ],
    )
  }
}

// notes
// Purpose: notes and payment terms.
// Inputs: full data object.
// Use when: document has free-form notes or terms.
#let notes(data) = {
  let note-lines = get(data, "notes", default: ())
  let payment-lines = get(data, "payment_terms", default: ())
  if note-lines.len() > 0 or payment-lines.len() > 0 {
    section-title("Notes")
    line-list(note-lines)
    if note-lines.len() > 0 and payment-lines.len() > 0 { v(1mm) }
    line-list(payment-lines)
  }
}

// business-document
// Purpose: complete A4 business document.
// Inputs: data with company, document, metadata, parties, table.items, totals, notes.
#let business-document(data) = safe-doc-page[
  #header(data)
  #v(7mm)
  #grid(
    columns: (42mm, 1fr),
    gutter: 8mm,
    [#metadata(get(data, "metadata", default: ()))],
    [#parties(get(data, "parties", default: ()))],
  )
  #v(7mm)
  #items-table(data.table.items)
  #v(5mm)
  #totals(data.totals)
  #v(6mm)
  #notes(data)
]
