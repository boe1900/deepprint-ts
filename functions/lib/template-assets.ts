import type { TemplateBundleFiles } from './template-bundle'

export type TemplateStarterSummary = {
  starterId: string
  title: string
  documentType: string
  summary: string
  whenToUse: string[]
  avoidFor: string[]
  tags: string[]
}

export type TemplateStarterContext = {
  starter: TemplateStarterSummary & {
    files: TemplateBundleFiles
  }
  componentSource: {
    componentId: string
    documentType: string
    source: string
  }
}

type TemplateAsset = TemplateStarterContext

const json = (value: unknown) => JSON.stringify(value, null, 2)

const manifest = (id: string, documentType: string, dataContract: string) => json({
  kind: 'template_bundle',
  version: 'v1',
  id,
  document_type: documentType,
  mode: 'parametric',
  data_contract: dataContract,
  entry: 'template.typ',
  data: 'data.json',
  data_schema: 'data.schema.json',
})

const receiptComponent = String.raw`// receipt-v1.typ
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
// Inputs: left, right, preset.
// Use when: table number, cashier, payment method, discounts, or totals.
#let label-value-row(left, right, preset, weight: 400) = grid(
  columns: (1fr, auto),
  gutter: preset.gutter,
  safe-text(left, weight: weight),
  align(right)[#text(weight: weight)[#str(right)]],
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
}`

const shippingLabelComponent = String.raw`// shipping-label-v1.typ
// AI usage: Use this source for 100mm x 180mm courier labels and parcel labels.
// Rules: This is a dense physical label. Keep fixed row heights, strong clipping,
// and barcode/QR zones. Inline only needed helpers into final template.typ.
#import "@preview/tiaoma:0.3.0"

// get
// Purpose: safe dictionary read for optional parcel/footer fields.
#let get(dict, key, default: "") = dict.at(key, default: default)

// safe-label-page
// Purpose: lock label size and prevent content from escaping the printable area.
// Inputs: width, height, body.
// Rules: keep clip:true and outer stroke for label QA.
#let safe-label-page(width: 100mm, height: 180mm, body) = {
  set page(width: width, height: height, margin: 0mm)
  set text(font: "Noto Sans CJK SC", size: 8pt)
  set par(justify: false)
  box(width: width, height: height, inset: 0pt, clip: true, stroke: 0.5pt + black)[#body]
}

// line-box
// Purpose: clipped single text line or address box.
// Use when: names, phones, service codes, and addresses may overflow.
#let line-box(width: 100%, height: auto, size: 8pt, weight: 400, body) = {
  box(width: width, height: height, inset: 0pt, clip: true)[#text(size: size, weight: weight)[#body]]
}

// centered
// Purpose: center content inside a fixed physical cell.
// Use when: barcode cells, markers, service blocks, and route cells need stable geometry.
#let centered(width: 100%, height: 100%, body) = {
  box(width: width, height: height, inset: 0pt, clip: true)[#align(center + horizon)[#body]]
}

// barcode
// Purpose: Code128 waybill barcode.
// Inputs: value, width, height.
// Rules: never stretch outside its cell; keep a white background.
#let barcode(value, width: 70mm, height: 12mm) = {
  box(width: width, height: height, fill: white, inset: 0pt, clip: true)[
    #align(center + horizon)[#tiaoma.barcode(str(value), "Code128", width: width, height: height)]
  ]
}

// qr-code
// Purpose: QR code for tracking URL or waybill number.
// Inputs: value, size.
// Use when: label needs compact machine-readable tracking.
#let qr-code(value, size: 18mm) = {
  box(width: size, height: size, fill: white, inset: 0pt, clip: true)[
    #align(center + horizon)[#tiaoma.barcode(str(value), "QRCode", width: size, height: size)]
  ]
}

#let border = 0.5pt + black

// label-header
// Purpose: top carrier/service/COD row.
// Inputs: full data object.
// Use when: rendering the topmost carrier identity band.
#let label-header(data) = block(width: 100%, height: 100%, inset: (left: 2mm), clip: true, stroke: (bottom: border))[
  #grid(columns: (32mm, 1fr, 20mm), gutter: 0pt,
    [#centered(width: 32mm)[#text(size: 16pt, weight: 900)[#data.carrier.name]]],
    [#align(right + horizon)[#stack(dir: ttb, spacing: 0.2mm,
      [#line-box(height: 2.8mm, size: 5.2pt, weight: 700)[COD: #get(get(data, "parcel", default: (:)), "cod_amount")]],
      [#line-box(height: 2.8mm, size: 5.2pt, weight: 700)[Value: #get(get(data, "parcel", default: (:)), "declared_value")]],
    )]],
    [#rect(width: 20mm, height: 12.5mm, fill: black, inset: 0pt)[#align(center + horizon)[#text(fill: white, weight: 700)[#data.carrier.service]]]],
  )
]

// route-row
// Purpose: large route sorting code.
// Inputs: routing.
// Use when: label has a bold warehouse/route code.
#let route-row(routing) = block(width: 100%, height: 100%, inset: 0pt, clip: true, stroke: (bottom: border))[
  #align(center + horizon)[#text(size: 34pt, weight: 900)[#routing.code]]
]

// destination-row
// Purpose: destination and mini barcode row.
// Inputs: routing, waybill.
// Use when: label needs destination city/zone plus quick scan barcode.
#let destination-row(routing, waybill) = block(width: 100%, height: 100%, inset: (x: 2mm), clip: true, stroke: (bottom: border))[
  #grid(columns: (1fr, 30mm), gutter: 0pt,
    [#align(left + horizon)[#grid(columns: (5mm, auto), gutter: 2mm,
      [#centered(width: 5mm)[#rect(width: 5mm, height: 5mm, stroke: border, inset: 0pt)[#align(center + horizon)[#text(size: 8pt, weight: 700)[#get(routing, "marker", default: "")]]]]],
      [#line-box(height: 100%, size: 14pt, weight: 900)[#routing.destination]],
    )]],
    [#centered(width: 30mm, height: 100%)[#barcode(waybill.number, width: 26mm, height: 5.5mm)]],
  )
]

// party-row
// Purpose: sender or recipient address row.
// Inputs: role, party.
// Rules: recipient and sender share geometry; only marker/weight changes.
#let party-row(role, party) = block(width: 100%, height: 100%, inset: (x: 2mm, y: 1.2mm), clip: true, stroke: (bottom: border))[
  #let marker = if role == "recipient" { "R" } else { "S" }
  #grid(columns: (6mm, 1fr), gutter: 1.1mm,
    [#centered(width: 6mm, height: 7mm)[#text(size: if role == "recipient" { 9pt } else { 14pt }, weight: 900)[#marker]]],
    [#stack(dir: ttb, spacing: 0.2mm,
      [#line-box(height: 3mm, size: 5.2pt, weight: 700)[#party.name  #party.phone]],
      [#line-box(height: 8mm, size: 4.8pt)[#party.address]],
    )],
  )
]

// main-barcode
// Purpose: primary waybill barcode area.
// Inputs: waybill.
// Use when: label requires a large scannable Code128 block.
#let main-barcode(waybill) = block(width: 100%, height: 100%, inset: 0pt, clip: true, stroke: (bottom: border))[
  #align(center + horizon)[#stack(dir: ttb, spacing: 0.5mm,
    [#barcode(waybill.number, width: 70mm, height: 12.5mm)],
    [#text(size: 10pt, weight: 700, font: "Noto Sans Mono")[#waybill.number]],
  )]
]

// footer-row
// Purpose: print metadata, disclaimer, and signature cell.
// Inputs: footer.
// Use when: label has print time, serial, terms, or signature box.
#let footer-row(footer) = block(width: 100%, height: 100%, inset: 0pt, clip: true, stroke: (bottom: (paint: black, thickness: 0.5pt, dash: "dashed")))[
  #grid(columns: (18.5mm, 1fr, 15mm), gutter: 0pt,
    [#block(width: 18.5mm, height: 100%, inset: (x: 2mm, y: 1mm), clip: true, stroke: (right: border))[#stack(dir: ttb, spacing: 0.2mm,
      [#line-box(height: 3mm, size: 5.5pt, weight: 700)[#get(footer, "timestamp")]],
      [#line-box(height: 3mm, size: 5.5pt, weight: 700)[#get(footer, "serial")]],
      [#line-box(height: 2.5mm, size: 4.4pt, weight: 600)[Print]],
    )]],
    [#box(width: 100%, height: 12mm, inset: (left: 1.6mm, right: 0.6mm), clip: true)[#align(left + horizon)[#text(size: 4.6pt)[#get(footer, "disclaimer")]]]],
    [#box(width: 15mm, height: 100%, inset: (left: 0.8mm, right: 2.4mm, top: 1mm, bottom: 1mm), clip: true)[#align(right + bottom)[#text(size: 5.5pt, weight: 700)[Sign]]]],
  )
]

// lower-address-row
// Purpose: lower copy with recipient/sender and QR code.
// Inputs: full data object.
// Use when: label has a detachable or repeated address area.
#let lower-address-row(data) = block(width: 100%, height: 100%, inset: 0pt, clip: true, stroke: (bottom: border))[
  #grid(columns: (1fr, 22.5mm), gutter: 0pt,
    [#grid(rows: (11.25mm, 11.25mm), gutter: 0pt,
      [#party-row("recipient", data.recipient)],
      [#party-row("sender", data.sender)],
    )],
    [#block(width: 22.5mm, height: 22.5mm, inset: 0pt, clip: true, stroke: (left: border))[#align(center + horizon)[#qr-code(get(data.waybill, "tracking_url", default: data.waybill.number), size: 15.2mm)]]],
  )
]

// custom-area
// Purpose: final custom text area.
// Inputs: lines array.
// Use when: user needs extra carrier notes without changing core geometry.
#let custom-area(lines) = box(width: 100%, height: 100%, inset: (x: 2mm, y: 2mm), clip: true)[
  #stack(dir: ttb, spacing: 1mm, ..lines.map(line => line-box(size: 6pt)[#line]))
]

// shipping-label
// Purpose: complete 100mm x 180mm shipping label.
// Inputs: data with carrier, routing, waybill, recipient, sender, footer, custom_lines.
// Rules: keep row heights fixed unless user explicitly requests a new label size.
#let shipping-label(data) = safe-label-page(width: 100mm, height: 180mm)[
  #grid(
    columns: (100%,),
    rows: (12.5mm, 15mm, 10mm, 16.25mm, 16.25mm, 22.5mm, 16mm, 22.5mm, 59mm),
    gutter: 0pt,
    [#label-header(data)],
    [#route-row(data.routing)],
    [#destination-row(data.routing, data.waybill)],
    [#party-row("recipient", data.recipient)],
    [#party-row("sender", data.sender)],
    [#main-barcode(data.waybill)],
    [#footer-row(get(data, "footer", default: (:)))],
    [#lower-address-row(data)],
    [#custom-area(get(data, "custom_lines", default: ()))],
  )
]`

const examPaperComponent = String.raw`// exam-paper-v1.typ
// AI usage: Use this source for A4 exam papers, quizzes, worksheets, and test
// papers with choice/open questions. Inline helpers into final template.typ.
// Rules: Keep sections readable, avoid decorative layouts, and preserve answer space.

// get
// Purpose: safe dictionary read for optional exam fields.
#let get(dict, key, default: none) = dict.at(key, default: default)

// safe-page
// Purpose: standard A4 exam page setup.
// Inputs: body.
// Use when: rendering a full exam/worksheet.
#let safe-page(body) = {
  set page(paper: "a4", margin: (top: 22mm, right: 18mm, bottom: 20mm, left: 18mm), numbering: "1 / 1")
  set text(font: ("LXGW WenKai GB Lite", "Noto Sans CJK SC"), size: 11pt)
  set par(justify: false)
  body
}

// underlined
// Purpose: student info blank line.
// Inputs: label, width.
// Use when: name/class/student id fields are needed.
#let underlined(label, width: 36mm) = [#label：#box(width: width, stroke: (bottom: 0.5pt))[]]

// answer-box
// Purpose: blank answer area for open questions.
// Inputs: height.
// Use when: question requires written answer space.
#let answer-box(height: 18mm) = box(width: 100%, height: height, stroke: (bottom: 0.3pt + rgb("D1D5DB")))[]

// choice-label
// Purpose: A/B/C/D label for multiple choice options.
#let choice-label(index) = ("A", "B", "C", "D", "E", "F").at(index, default: "?")

// exam-header
// Purpose: title, subject, duration, and total score block.
// Inputs: exam object.
// Use when: rendering the page header.
#let exam-header(exam) = [
  #align(right)[#text(size: 9pt)[时长：#get(exam, "duration", default: "")]]
  #align(center)[
    #text(size: 18pt, weight: 700)[#exam.title]
    #linebreak()
    #text(size: 10pt)[科目：#exam.subject #if "total_score" in exam { [ · 总分：#exam.total_score] }]
  ]
  #v(6mm)
]

// student-info
// Purpose: row of student fill-in fields.
// Inputs: field label array.
// Use when: exam paper needs name/class/id blanks.
#let student-info(fields) = [
  #if fields.len() > 0 [
    #grid(columns: (1fr,) * fields.len(), gutter: 8pt, ..fields.map(field => underlined(field)))
    #v(5mm)
  ]
]

// score-table
// Purpose: compact score table by section.
// Inputs: sections with title/score.
// Use when: teacher scoring area is required.
#let score-table(sections) = [
  #table(
    columns: (1fr,) * (sections.len() + 1),
    align: center,
    inset: 5pt,
    table.cell[题型],
    ..sections.map(section => table.cell[#section.title]),
    table.cell[得分],
    ..sections.map(section => table.cell[#get(section, "score", default: "")]),
  )
  #v(6mm)
]

// choice-question
// Purpose: render one multiple-choice question.
// Inputs: number, question with stem/choices.
// Rules: keep choices in two columns for scanability.
#let choice-question(number, question) = [
  #enum.item(number)[#question.stem]
  #grid(
    columns: (1fr, 1fr),
    gutter: 8pt,
    ..get(question, "choices", default: ()).enumerate().map(((index, choice)) => [#choice-label(index). #choice]),
  )
  #v(4mm)
]

// open-question
// Purpose: render one written-answer question.
// Inputs: number, question with stem and optional answer_space_mm.
// Use when: type is not choice.
#let open-question(number, question) = [
  #enum.item(number)[#question.stem]
  #answer-box(height: get(question, "answer_space_mm", default: 18) * 1mm)
  #v(4mm)
]

// question-block
// Purpose: dispatch question by type.
// Inputs: number, question.
// Rules: only choice gets choices; everything else gets answer space.
#let question-block(number, question) = {
  if question.type == "choice" {
    choice-question(number, question)
  } else {
    open-question(number, question)
  }
}

// exam-section
// Purpose: one scored exam section.
// Inputs: number, section.
// Use when: grouping related questions.
#let exam-section(number, section) = [
  #block(breakable: false)[
    #table(
      columns: (auto, 1fr),
      align: (center, left + horizon),
      table.cell(inset: 0.35cm)[得分],
      table.cell(rowspan: 2, inset: 0.5cm)[#text(weight: 700)[#number. #section.title #if "score" in section { [(#section.score 分)] }]],
      table.cell(inset: 0.35cm)[],
    )
  ]
  #v(3mm)
  #for (question-index, question) in section.questions.enumerate() [
    #question-block(question-index + 1, question)
  ]
]

// exam-paper
// Purpose: complete exam paper layout.
// Inputs: data with exam, student_fields, sections.
#let exam-paper(data) = safe-page[
  #exam-header(data.exam)
  #student-info(get(data, "student_fields", default: ()))
  #score-table(data.sections)
  #for (section-index, section) in data.sections.enumerate() [
    #exam-section(section-index + 1, section)
  ]
]`

const businessDocumentComponent = String.raw`// business-document-v1.typ
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
]`

const invitationComponent = String.raw`// invitation-v1.typ
// AI usage: Use this source for one-page invitations, wedding cards, ceremony
// notices, launch invites, and event cards. Inline helpers into final template.typ.
// Rules: Keep it single-page, centered, and balanced. Do not create a second page
// unless the user explicitly asks.

// get
// Purpose: safe dictionary read.
#let get(dict, key, default: "") = dict.at(key, default: default)

// invitation-page
// Purpose: one-page card setup.
// Inputs: body, paper, margin.
// Use when: rendering the complete invitation.
#let invitation-page(body, paper: "a5", margin: 13mm) = {
  set page(paper: paper, margin: margin)
  set text(font: ("Noto Serif CJK SC", "Noto Sans CJK SC"), fill: rgb("2B1A14"))
  set par(justify: false, leading: 0.72em)
  body
}

// corner-frame
// Purpose: decorative corner lines that stay inside the page.
// Inputs: color.
// Use when: user asks for elegant, ceremonial, or wedding-style card.
// Rules: top/bottom corner directions must mirror correctly.
#let corner-frame(color: rgb("B8914B")) = {
  let len = 14mm
  let stroke = 0.7pt + color
  place(top + left, dx: 0mm, dy: 0mm)[#line(length: len, stroke: stroke)]
  place(top + left, dx: 0mm, dy: 0mm)[#line(angle: 90deg, length: len, stroke: stroke)]
  place(top + right, dx: 0mm, dy: 0mm)[#line(angle: 180deg, length: len, stroke: stroke)]
  place(top + right, dx: 0mm, dy: 0mm)[#line(angle: 90deg, length: len, stroke: stroke)]
  place(bottom + left, dx: 0mm, dy: 0mm)[#line(length: len, stroke: stroke)]
  place(bottom + left, dx: 0mm, dy: 0mm)[#line(angle: -90deg, length: len, stroke: stroke)]
  place(bottom + right, dx: 0mm, dy: 0mm)[#line(angle: 180deg, length: len, stroke: stroke)]
  place(bottom + right, dx: 0mm, dy: 0mm)[#line(angle: -90deg, length: len, stroke: stroke)]
}

// invitation-title
// Purpose: centered title and subtitle.
// Inputs: title, subtitle.
// Use when: rendering the main invitation headline.
#let invitation-title(title, subtitle: "") = [
  #align(center)[
    #text(size: 22pt, weight: 700)[#title]
    #if subtitle != "" [
      #linebreak()
      #v(2mm)
      #text(size: 9pt, fill: rgb("876B3D"))[#subtitle]
    ]
  ]
]

// invitation-detail
// Purpose: one centered detail row.
// Inputs: label, value.
// Use when: rendering date, time, venue, address, or dress code.
#let invitation-detail(label, value) = [
  #align(center)[
    #text(size: 8pt, fill: rgb("8A6A3D"))[#label]
    #linebreak()
    #text(size: 11pt, weight: 600)[#value]
  ]
]

// invitation-body
// Purpose: short invitation paragraph.
// Inputs: lines array.
// Use when: rendering greeting or invitation message.
// Rules: keep lines short; long prose should be split into several lines.
#let invitation-body(lines) = [
  #align(center)[
    #for (index, line) in lines.enumerate() {
      if index > 0 { linebreak() }
      text(size: 10.5pt)[#line]
    }
  ]
]

// invitation-card
// Purpose: complete one-page invitation card.
// Inputs: data with title, subtitle, hosts, message_lines, details, footer.
// Rules: keep all content on one page and centered.
#let invitation-card(data) = invitation-page[
  #box(width: 100%, height: 100%, inset: 8mm, clip: true, stroke: 0.7pt + rgb("D9C58A"))[
    #corner-frame()
    #align(center + horizon)[
      #block(width: 100%)[
        #text(size: 8pt, fill: rgb("9A7A43"))[#get(data, "eyebrow", default: "INVITATION")]
        #v(6mm)
        #invitation-title(data.title, subtitle: get(data, "subtitle", default: ""))
        #v(7mm)
        #invitation-body(get(data, "message_lines", default: ()))
        #v(8mm)
        #grid(
          columns: (1fr, 1fr),
          gutter: 10mm,
          ..get(data, "details", default: ()).map(row => invitation-detail(row.label, row.value)),
        )
        #v(8mm)
        #align(center)[#text(size: 9pt, fill: rgb("876B3D"))[#get(data, "footer", default: "")]]
      ]
    ]
  ]
]`

export const TEMPLATE_ASSETS: TemplateAsset[] = [
  {
    starter: {
      starterId: 'receipt-basic',
      title: '58mm receipt basic',
      documentType: 'receipt',
      summary: 'Thin starter for narrow thermal receipts with business-level receipt data.',
      whenToUse: ['小票', '点单小票', '收银小票', '餐饮收据', '快餐订单', 'receipt', 'cashier ticket'],
      avoidFor: ['A4 business document', 'exam paper', 'shipping label', 'invitation'],
      tags: ['58mm', 'thermal', 'receipt', 'qr', '中文'],
      files: {
        'manifest.json': manifest('receipt-basic', 'receipt', 'receipt.basic.v1'),
        'template.typ': String.raw`#let data = json("data.json")

#set page(width: 58mm, height: auto, margin: 2.5mm)
#set text(font: "Noto Sans CJK SC", size: 8.6pt, top-edge: "bounds", bottom-edge: "bounds")

#align(center)[
  #text(size: 11pt, weight: 700)[#data.store.name]
  #linebreak()
  #text(size: 7pt)[订单 #data.order.number]
]
#v(2mm)
#line(length: 100%)
#v(2mm)
#grid(columns: (1fr, 9mm, 14mm), gutter: 4pt, [品名], align(right)[数量], align(right)[金额])
#for item in data.items [
  #grid(columns: (1fr, 9mm, 14mm), gutter: 4pt, [#item.name], align(right)[#item.qty], align(right)[#item.amount])
]
#v(2mm)
#line(length: 100%)
#v(2mm)
#for row in data.totals [
  #grid(columns: (1fr, auto), [#row.label], align(right)[#row.value])
]`,
        'data.json': json({
          store: { name: '肯德基 KFC', address: '上海市黄浦区南京东路 100 号' },
          order: {
            number: 'KFC-20260626-001',
            time: '2026-06-26 12:30',
            metadata: [
              { label: '取餐号', value: 'A109' },
              { label: '用餐方式', value: '堂食' },
            ],
          },
          items: [
            { name: '香辣鸡腿堡', qty: '1', amount: '¥22.00' },
            { name: '薯条 🍟', qty: '1', amount: '¥12.00' },
            { name: '可乐', qty: '1', amount: '¥8.00' },
          ],
          totals: [
            { label: '小计', value: '¥42.00' },
            { label: '优惠', value: '-¥5.00' },
            { label: '实付', value: '¥37.00', emphasis: true },
          ],
          payments: [{ label: '支付方式', value: '微信支付' }],
          badges: ['KFC 🍟'],
          qr: { label: '扫码查看订单', value: 'https://deepprint.local/orders/KFC-20260626-001' },
          footer: ['谢谢惠顾', '请保留小票作为取餐凭证'],
        }),
        'data.schema.json': json({
          type: 'object',
          required: ['store', 'order', 'items', 'totals'],
          properties: {
            store: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, address: { type: 'string' } }, additionalProperties: true },
            order: { type: 'object', required: ['number'], properties: { number: { type: 'string' }, time: { type: 'string' }, metadata: { type: 'array', items: { type: 'object' } } }, additionalProperties: true },
            items: { type: 'array', items: { type: 'object', required: ['name', 'qty', 'amount'], properties: { name: { type: 'string' }, qty: { type: 'string' }, amount: { type: 'string' } }, additionalProperties: true } },
            totals: { type: 'array', items: { type: 'object', required: ['label', 'value'], properties: { label: { type: 'string' }, value: { type: 'string' }, emphasis: { type: 'boolean' } }, additionalProperties: true } },
            payments: { type: 'array', items: { type: 'object' } },
            badges: { type: 'array', items: { type: 'string' } },
            qr: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, additionalProperties: true },
            footer: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        }),
      },
    },
    componentSource: { componentId: 'receipt-v1', documentType: 'receipt', source: receiptComponent },
  },
  {
    starter: {
      starterId: 'shipping-label-basic',
      title: '100mm shipping label basic',
      documentType: 'shipping_label',
      summary: 'Thin starter for courier parcel labels with routing, parties, waybill barcode, and QR fields.',
      whenToUse: ['面单', '快递面单', '物流标签', 'shipping label', 'parcel label', 'waybill'],
      avoidFor: ['receipt', 'exam paper', 'invitation', 'A4 invoice'],
      tags: ['100mm', '180mm', 'barcode', 'qr', 'shipping'],
      files: {
        'manifest.json': manifest('shipping-label-basic', 'shipping_label', 'shipping.label.basic.v1'),
        'template.typ': String.raw`#let data = json("data.json")

#set page(width: 100mm, height: 180mm, margin: 0mm)
#set text(font: "Noto Sans CJK SC", size: 8pt)

#box(width: 100mm, height: 180mm, inset: 2mm, clip: true, stroke: 0.5pt + black)[
  #text(size: 16pt, weight: 900)[#data.carrier.name]
  #h(1fr)
  #text(weight: 700)[#data.carrier.service]
  #v(6mm)
  #align(center)[#text(size: 30pt, weight: 900)[#data.routing.code]]
  #v(4mm)
  #text(size: 12pt, weight: 700)[#data.routing.destination]
  #v(5mm)
  #text(weight: 700)[收件人] #data.recipient.name  #data.recipient.phone
  #linebreak()
  #data.recipient.address
  #v(5mm)
  #text(weight: 700)[寄件人] #data.sender.name  #data.sender.phone
  #linebreak()
  #data.sender.address
  #v(8mm)
  #align(center)[#text(size: 12pt, weight: 700)[#data.waybill.number]]
]`,
        'data.json': json({
          carrier: { name: 'Deep Express', service: '标准快递' },
          routing: { code: '沪 A-12', destination: '上海黄浦' },
          waybill: { number: 'DP202606260001', tracking_url: 'https://deepprint.local/t/DP202606260001' },
          recipient: { name: '李四', phone: '13800000000', address: '上海市黄浦区南京东路 100 号' },
          sender: { name: '王五', phone: '13900000000', address: '杭州市西湖区文三路 88 号' },
          footer: { timestamp: '2026-06-26 12:30', serial: 'P001', disclaimer: '请核对收寄件信息。' },
          custom_lines: ['易碎品请轻放', '客户备注：前台代收'],
        }),
        'data.schema.json': json({
          type: 'object',
          required: ['carrier', 'routing', 'waybill', 'recipient', 'sender'],
          properties: {
            carrier: { type: 'object', required: ['name', 'service'], additionalProperties: true },
            routing: { type: 'object', required: ['code', 'destination'], additionalProperties: true },
            waybill: { type: 'object', required: ['number'], additionalProperties: true },
            recipient: { type: 'object', required: ['name', 'phone', 'address'], additionalProperties: true },
            sender: { type: 'object', required: ['name', 'phone', 'address'], additionalProperties: true },
            footer: { type: 'object', additionalProperties: true },
            custom_lines: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        }),
      },
    },
    componentSource: { componentId: 'shipping-label-v1', documentType: 'shipping_label', source: shippingLabelComponent },
  },
  {
    starter: {
      starterId: 'exam-paper-basic',
      title: 'A4 exam paper basic',
      documentType: 'exam_paper',
      summary: 'Thin starter for A4 exams, quizzes, and worksheets with sections and questions.',
      whenToUse: ['试卷', '练习题', '考试卷', 'quiz', 'exam paper', 'worksheet'],
      avoidFor: ['receipt', 'shipping label', 'invitation', 'invoice'],
      tags: ['A4', 'exam', 'worksheet', 'questions', '中文'],
      files: {
        'manifest.json': manifest('exam-paper-basic', 'exam_paper', 'exam.paper.basic.v1'),
        'template.typ': String.raw`#let data = json("data.json")

#set page(paper: "a4", margin: 20mm)
#set text(font: ("LXGW WenKai GB Lite", "Noto Sans CJK SC"), size: 11pt)

#align(center)[
  #text(size: 18pt, weight: 700)[#data.exam.title]
  #linebreak()
  #text(size: 10pt)[#data.exam.subject]
]
#v(6mm)
#for (section-index, section) in data.sections.enumerate() [
  #text(weight: 700)[#(section-index + 1). #section.title]
  #v(2mm)
  #for (question-index, question) in section.questions.enumerate() [
    #enum.item(question-index + 1)[#question.stem]
  ]
  #v(4mm)
]`,
        'data.json': json({
          exam: { title: '期末测试卷', subject: '语文', duration: '90 分钟', total_score: '100' },
          student_fields: ['姓名', '班级', '学号'],
          sections: [
            {
              title: '选择题',
              score: '40',
              questions: [
                { type: 'choice', stem: '下列词语中没有错别字的一项是？', choices: ['安详', '急燥', '缭草', '拔涉'] },
              ],
            },
            {
              title: '简答题',
              score: '60',
              questions: [
                { type: 'open', stem: '请概括文章的中心思想。', answer_space_mm: 24 },
              ],
            },
          ],
        }),
        'data.schema.json': json({
          type: 'object',
          required: ['exam', 'sections'],
          properties: {
            exam: { type: 'object', required: ['title', 'subject'], additionalProperties: true },
            student_fields: { type: 'array', items: { type: 'string' } },
            sections: {
              type: 'array',
              items: {
                type: 'object',
                required: ['title', 'questions'],
                properties: { title: { type: 'string' }, score: { type: 'string' }, questions: { type: 'array', items: { type: 'object', additionalProperties: true } } },
                additionalProperties: true,
              },
            },
          },
          additionalProperties: false,
        }),
      },
    },
    componentSource: { componentId: 'exam-paper-v1', documentType: 'exam_paper', source: examPaperComponent },
  },
  {
    starter: {
      starterId: 'business-document-basic',
      title: 'A4 business document basic',
      documentType: 'business_document',
      summary: 'Thin starter for invoices, quotations, statements, and other quiet A4 business documents.',
      whenToUse: ['发票', '报价单', '账单', '合同附件', 'invoice', 'quotation', 'statement'],
      avoidFor: ['receipt', 'shipping label', 'exam paper', 'invitation'],
      tags: ['A4', 'business', 'table', 'invoice', 'quotation'],
      files: {
        'manifest.json': manifest('business-document-basic', 'business_document', 'business.document.basic.v1'),
        'template.typ': String.raw`#let data = json("data.json")

#set page(paper: "a4", margin: 18mm)
#set text(font: ("Noto Sans CJK SC", "Arial"), size: 10pt)

#grid(columns: (1fr, auto), [
  #text(size: 13pt, weight: 700)[#data.company.name]
], [
  #align(right)[#text(size: 20pt, weight: 700)[#data.document.title]]
])
#v(8mm)
#table(
  columns: (1fr, 18mm, 24mm),
  table.header([项目], align(right)[数量], align(right)[金额]),
  ..data.table.items.map(item => ([#item.description], align(right)[#item.quantity], align(right)[#item.amount])).flatten(),
)
#v(6mm)
#for row in data.totals [
  #align(right)[#row.label：#row.value]
]`,
        'data.json': json({
          company: { name: 'DeepPrint Studio', address_lines: ['上海市黄浦区南京东路 100 号'], contact_lines: ['hello@deepprint.local'] },
          document: { title: '报价单', number: 'Q-20260626-001' },
          metadata: [{ label: '日期', value: '2026-06-26' }],
          parties: [
            { title: '客户', name: '示例客户', address_lines: ['上海市徐汇区'], details: [{ label: '联系人', value: '李四' }] },
            { title: '供应商', name: 'DeepPrint Studio', address_lines: ['上海市黄浦区'], details: [{ label: '电话', value: '400-000-0000' }] },
          ],
          table: { items: [{ code: 'DP-001', description: '模板设计服务', quantity: '1', unit_price: '¥800.00', amount: '¥800.00' }] },
          totals: [{ label: '合计', value: '¥800.00', emphasis: true }],
          notes: ['报价有效期 7 天。'],
          payment_terms: ['付款后开始交付。'],
        }),
        'data.schema.json': json({
          type: 'object',
          required: ['company', 'document', 'table', 'totals'],
          properties: {
            company: { type: 'object', required: ['name'], additionalProperties: true },
            document: { type: 'object', required: ['title', 'number'], additionalProperties: true },
            metadata: { type: 'array', items: { type: 'object' } },
            parties: { type: 'array', items: { type: 'object' } },
            table: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: true } } }, additionalProperties: true },
            totals: { type: 'array', items: { type: 'object', additionalProperties: true } },
            notes: { type: 'array', items: { type: 'string' } },
            payment_terms: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        }),
      },
    },
    componentSource: { componentId: 'business-document-v1', documentType: 'business_document', source: businessDocumentComponent },
  },
  {
    starter: {
      starterId: 'invitation-basic',
      title: 'One-page invitation basic',
      documentType: 'invitation',
      summary: 'Thin starter for centered single-page invitations and event cards.',
      whenToUse: ['请帖', '邀请函', '婚礼请帖', '活动邀请', 'invitation', 'event card', 'wedding card'],
      avoidFor: ['receipt', 'shipping label', 'exam paper', 'business document'],
      tags: ['A5', 'invitation', 'single-page', 'centered', '中文'],
      files: {
        'manifest.json': manifest('invitation-basic', 'invitation', 'invitation.basic.v1'),
        'template.typ': String.raw`#let data = json("data.json")

#set page(paper: "a5", margin: 16mm)
#set text(font: ("Noto Serif CJK SC", "Noto Sans CJK SC"), fill: rgb("2B1A14"))

#align(center + horizon)[
  #block(width: 100%)[
    #text(size: 22pt, weight: 700)[#data.title]
    #v(6mm)
    #for line in data.message_lines [
      #line
      #linebreak()
    ]
    #v(8mm)
    #for row in data.details [
      #text(size: 9pt, fill: rgb("8A6A3D"))[#row.label]
      #linebreak()
      #text(size: 11pt, weight: 600)[#row.value]
      #v(4mm)
    ]
  ]
]`,
        'data.json': json({
          eyebrow: 'INVITATION',
          title: '婚礼请帖',
          subtitle: '诚邀您共同见证',
          message_lines: ['良辰已定，佳期如约。', '我们诚挚邀请您出席婚礼仪式。'],
          details: [
            { label: '日期', value: '2026 年 10 月 1 日' },
            { label: '地点', value: '上海和平饭店' },
          ],
          footer: '敬候光临',
        }),
        'data.schema.json': json({
          type: 'object',
          required: ['title', 'message_lines', 'details'],
          properties: {
            eyebrow: { type: 'string' },
            title: { type: 'string' },
            subtitle: { type: 'string' },
            message_lines: { type: 'array', items: { type: 'string' } },
            details: { type: 'array', items: { type: 'object', required: ['label', 'value'], properties: { label: { type: 'string' }, value: { type: 'string' } }, additionalProperties: false } },
            footer: { type: 'string' },
          },
          additionalProperties: false,
        }),
      },
    },
    componentSource: { componentId: 'invitation-v1', documentType: 'invitation', source: invitationComponent },
  },
]

export const listTemplateStarters = (): TemplateStarterSummary[] => TEMPLATE_ASSETS.map(({ starter }) => ({
  starterId: starter.starterId,
  title: starter.title,
  documentType: starter.documentType,
  summary: starter.summary,
  whenToUse: starter.whenToUse,
  avoidFor: starter.avoidFor,
  tags: starter.tags,
}))

export const getStarterContext = (starterId: string): TemplateStarterContext => {
  const asset = TEMPLATE_ASSETS.find((item) => item.starter.starterId === starterId)
  if (!asset) {
    throw new Error(`Unknown starterId: ${starterId}`)
  }
  return asset
}
