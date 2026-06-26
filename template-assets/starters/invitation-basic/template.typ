#let data = json("data.json")

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
]
