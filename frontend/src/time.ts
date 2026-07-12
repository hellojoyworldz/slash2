// 채팅용 시간 표기 — 언어와 무관하게 AM/PM으로 통일
export function formatTime(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const period = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${period}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// 채팅방의 날짜 구분선용: 2026.03.05
export function formatDateStamp(iso: string): string {
  const d = new Date(iso);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

// 채팅 목록용: 오늘이면 시각, 올해면 MM.DD, 그 외엔 YYYY.MM.DD
export function formatListTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (isSameDay(date, now)) return formatTime(iso);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  if (date.getFullYear() === now.getFullYear()) return `${mm}.${dd}`;
  return `${date.getFullYear()}.${mm}.${dd}`;
}
