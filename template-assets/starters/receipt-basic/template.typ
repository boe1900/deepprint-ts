#let data = json("data.json")

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
#if "callout" in data and "value" in data.callout [
  #align(center)[
    #text(size: 7pt, weight: 700)[#data.callout.label]
    #linebreak()
    #v(1mm)
    #text(size: 24pt, weight: 900)[#data.callout.value]
  ]
  #v(2mm)
  #line(length: 100%)
  #v(2mm)
]
#grid(columns: (1fr, 9mm, 14mm), gutter: 4pt, [品名], align(right)[数量], align(right)[金额])
#for item in data.items [
  #grid(columns: (1fr, 9mm, 14mm), gutter: 4pt, align: (left + top, right + top, right + top), [#item.name], align(right)[#item.qty], align(right)[#item.amount])
]
#v(2mm)
#line(length: 100%)
#v(2mm)
#for row in data.totals [
  #grid(columns: (1fr, 18mm), [#row.label], align(right)[#row.value])
]
#v(25pt)
