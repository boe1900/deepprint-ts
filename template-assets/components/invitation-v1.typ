// invitation-v1.typ
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
]
