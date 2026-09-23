export function formatSystemLocalCalendarDate(instant: string): string {
  const date = new Date(instant);
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
