#let data = json("data.json")

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
]
