// Shared by every "export my data" button in the app (landlord and
// contractor financial reports, more later if needed) — one correct CSV
// escaper instead of each page reinventing it slightly wrong. A naive
// join(',') breaks the moment a property address or contractor name
// contains a comma, which real addresses regularly do ("123 Main St, Apt 2").
function csvCell(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

// `title` prepends a couple of branded lines before the real header row —
// ragged rows (fewer populated cells than the data below) are completely
// valid CSV and Excel/Sheets render them as plain text above the real
// table, same as any statement export. Small thing, but it's the one
// export in the app a landlord is likely to actually forward to someone
// else (an accountant, a business partner), so it's worth it saying who
// it's from before the raw numbers start.
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][], title?: { heading: string; subheading?: string }): string {
  const preamble = title ? [csvCell(title.heading), ...(title.subheading ? [csvCell(title.subheading)] : []), ''] : []
  const lines = [...preamble, headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))]
  // Leading BOM so Excel (still the most common opener) detects UTF-8
  // instead of guessing a legacy codepage and mangling an accented name.
  return '﻿' + lines.join('\r\n')
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][], title?: { heading: string; subheading?: string }) {
  const csv = toCsv(headers, rows, title)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
