import type { Notice as NoticeData } from '../store';

export function Notice({ notice }: { notice: NoticeData | null }) {
  if (!notice) return null;
  return (
    <div
      className={`notice notice-${notice.tone}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      {notice.text}
    </div>
  );
}
