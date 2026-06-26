#let data = json("data.json")

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
]
