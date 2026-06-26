// exam-paper-v1.typ
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
]
