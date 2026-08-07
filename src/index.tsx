#!/usr/bin/env node
import { render } from 'ink';
import { App } from './app/App.js';

process.on('uncaughtException', (err) => {
  process.stderr.write(`\n[pg-syncer] 未捕获异常: ${err.message}\n`);
  process.exit(1);
});

// TUI 需要交互式终端：stdin/stdout 任一不是 TTY（管道、CI、脚本调用）时直接友好退出，
// 避免 Ink 的 useInput 在非 TTY 下抛出 raw mode 错误。
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write(
    '\n[pg-syncer] 需要交互式终端（TTY）才能运行。\n' +
      '请直接在 Windows Terminal / PowerShell / 常规终端中执行 pg-syncer，不要通过管道或脚本调用。\n',
  );
  process.exit(1);
}

// alternateScreen: 全屏接管终端（备用屏幕缓冲区 + 光标隐藏/恢复，退出时自动还原），
// 类似 vim / htop 的效果；非交互环境（管道/CI）下 Ink 会自动忽略。
const app = render(<App />, { alternateScreen: true });

// 退出备用屏幕后补一个换行，避免 shell 提示符紧贴最后一行输出
void app.waitUntilExit().then(() => {
  process.stdout.write('\n');
});

