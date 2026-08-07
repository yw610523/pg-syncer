import { useEffect, useState } from 'react';
import { useStdin } from 'ink';

export interface MouseEvent {
  type: 'press' | 'release' | 'move';
  button: 'left' | 'right' | 'middle' | 'none';
  x: number;
  y: number;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

/**
 * 启用终端鼠标追踪（SGR 模式），返回鼠标事件流。
 * 支持左键/右键点击和移动事件。
 */
export function useMouse(enabled = true): MouseEvent | null {
  const { stdin } = useStdin();
  const [event, setEvent] = useState<MouseEvent | null>(null);

  useEffect(() => {
    if (!enabled || !stdin) return;

    // 启用 SGR 鼠标模式（现代终端支持）
    // 1000 = X10 mouse reporting (press only)
    // 1002 = button event tracking (press + drag)
    // 1003 = any event tracking (press + drag + move)
    // 1006 = SGR extended mode (modern coordinates)
    const enable = '\x1b[?1002h\x1b[?1006h';
    const disable = '\x1b[?1002l\x1b[?1006l';

    // 不调用 setRawMode，让 Ink 管理 raw mode
    process.stdout.write(enable);

    const handler = (data: Buffer) => {
      const str = data.toString('utf8');

      // SGR mouse event: \x1b[<button;x;yM (press) or \x1b[<button;x;ym (release)
      const sgrMatch = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
      if (sgrMatch) {
        const btn = parseInt(sgrMatch[1], 10);
        const x = parseInt(sgrMatch[2], 10);
        const y = parseInt(sgrMatch[3], 10);
        const type = sgrMatch[4] === 'M' ? 'press' : 'release';

        // 解析按钮和修饰键
        // bit 0-1: button (0=left, 1=middle, 2=right, 3=release)
        // bit 2: shift
        // bit 3: meta
        // bit 4: ctrl
        // bit 5: motion
        // bit 6-7: wheel (64=scroll up, 65=scroll down)
        const buttonCode = btn & 0x03;
        const button =
          buttonCode === 0 ? 'left' : buttonCode === 1 ? 'middle' : buttonCode === 2 ? 'right' : 'none';

        setEvent({
          type,
          button,
          x,
          y,
          shift: (btn & 0x04) !== 0,
          meta: (btn & 0x08) !== 0,
          ctrl: (btn & 0x10) !== 0,
        });
      }
      // 非鼠标事件不处理，让 Ink 的 useInput 处理键盘输入
    };

    stdin.on('data', handler);

    return () => {
      stdin.off('data', handler);
      process.stdout.write(disable);
    };
  }, [enabled, stdin]);

  return event;
}
