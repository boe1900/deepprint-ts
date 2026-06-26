#let data = json("data.json")

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
]
