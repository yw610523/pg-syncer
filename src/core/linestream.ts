import iconv from 'iconv-lite';
import { fallbackEncoding } from '../utils/encoding.js';

/**
 * 把字节流按换行符切分成行，并在每行产出时调用回调。
 *
 * 改进点：
 * - 在字节层面缓存，遇到完整行后再解码，避免多字节字符被 Buffer 边界切坏
 * - 优先以 UTF-8 解码；若出现替换字符（U+FFFD），则回退到系统默认编码（Windows 下通常为 GBK）
 * - 同时把 \n 和 \r 视为行结束符（pg_dump/pg_restore 会用 \r 刷新进度）
 * - 提供 flush()，在子进程关闭时把缓冲区的剩余内容（不含结尾空行）也发出
 */
export interface LineSplitter {
  /** 推入一段字节/字符串 */
  push: (chunk: Buffer | string) => void;
  /** 冲刷剩余内容 */
  flush: () => void;
}

export function createLineSplitter(
  emit: (line: string) => void,
  maxBuffer = 128 * 1024,
): LineSplitter {
  let rawBuf = Buffer.alloc(0);

  /** 解码一行字节：优先 UTF-8，失败则回退到系统编码 */
  const decodeLine = (lineBuf: Buffer): string => {
    const utf8 = iconv.decode(lineBuf, 'utf8');
    // 若 UTF-8 解码出现替换字符，说明源输出不是 UTF-8，改用系统默认编码
    if (!utf8.includes('�')) return utf8;
    return iconv.decode(lineBuf, fallbackEncoding);
  };

  const emitLine = (lineBuf: Buffer): void => {
    const line = decodeLine(lineBuf).replace(/\r$/, '').replace(/\n$/, '');
    emit(line);
  };

  const split = (): void => {
    let idx: number;
    // 先按 \n 切分（兼容 \r\n）
    while ((idx = rawBuf.indexOf(0x0a)) >= 0) {
      const lineBuf = rawBuf.slice(0, idx + 1);
      rawBuf = rawBuf.slice(idx + 1);
      emitLine(lineBuf);
    }
    // 再处理单独的 \r（pg_dump 进度刷新）
    while ((idx = rawBuf.indexOf(0x0d)) >= 0) {
      const lineBuf = rawBuf.slice(0, idx + 1);
      rawBuf = rawBuf.slice(idx + 1);
      emitLine(lineBuf);
    }
  };

  const push = (chunk: Buffer | string): void => {
    const bufChunk = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    rawBuf = Buffer.concat([rawBuf, bufChunk]);
    if (rawBuf.length > maxBuffer) {
      emit(decodeLine(rawBuf).replace(/\r|\n/g, ''));
      rawBuf = Buffer.alloc(0);
      return;
    }
    split();
  };

  const flush = (): void => {
    split();
    if (rawBuf.length > 0) {
      const tail = decodeLine(rawBuf).trim();
      if (tail.length > 0) emit(tail);
    }
    rawBuf = Buffer.alloc(0);
  };

  return { push, flush };
}
