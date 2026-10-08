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

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))]
  // Leading BOM so Excel (still the most common opener) detects UTF-8
  // instead of guessing a legacy codepage and mangling an accented name.
  return '﻿' + lines.join('\r\n')
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = toCsv(headers, rows)
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
