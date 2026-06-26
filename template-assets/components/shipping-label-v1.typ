// shipping-label-v1.typ
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
]
