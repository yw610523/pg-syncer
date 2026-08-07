import { StringDecoder } from 'node:string_decoder';

/**
 * 把字节流按换行符切分成行，并在每行产出时调用回调。
 *
 * 改进点：
 * - 使用 StringDecoder 处理 Buffer，避免多字节 UTF-8 字符被 Buffer 边界切坏导致乱码
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
  const decoder = new StringDecoder('utf8');
  let buf = '';

  const emitLine = (raw: string): void => {
    // 去掉行尾 \r（兼容 Windows \r\n）和 \n
    const line = raw.replace(/\r$/, '').replace(/\n$/, '');
    emit(line);
  };

  const split = (): void => {
    // 循环处理 \n 和 \r 两种行尾
    let idx: number;
    while ((idx = buf.search(/[\r\n]/)) >= 0) {
      const line = buf.slice(0, idx + 1); // 包含换行符
      buf = buf.slice(idx + 1);
      emitLine(line);
    }
  };

  const push = (chunk: Buffer | string): void => {
    const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
    buf += text;
    if (buf.length > maxBuffer) {
      emit(buf);
      buf = '';
      return;
    }
    split();
  };

  const flush = (): void => {
    // 先解码任何未完成的尾部字节
    const tail = decoder.end();
    if (tail) buf += tail;
    // 把缓冲区分成多行并发出
    split();
    if (buf.trim().length > 0) {
      emit(buf);
    }
    buf = '';
  };

  return { push, flush };
}
