/** 将毫秒格式化为易读的耗时字符串 */
export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Dump 格式的中文展示标签 */
export const FORMAT_LABEL: Record<string, string> = {
  directory: 'Directory (-Fd)',
  custom: 'Custom (-Fc)',
  plain: 'Plain SQL (-Fp)',
};

/** 从中间截断字符串 */
export function truncateMiddle(str: string, max: number): string {
  if (str.length <= max) return str;
  if (max <= 1) return '…';
  const half = Math.floor((max - 1) / 2);
  return str.slice(0, half) + '…' + str.slice(-half);
}
