export const TIME_WINDOWS = [
  { value: 'morning', label: 'Morning (8am–12pm)' },
  { value: 'afternoon', label: 'Afternoon (12pm–5pm)' },
  { value: 'evening', label: 'Evening (5pm–8pm)' },
]

export const timeWindowLabel = (value: string) =>
  TIME_WINDOWS.find((w) => w.value === value)?.label || value
