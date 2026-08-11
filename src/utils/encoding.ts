import { execSync } from 'node:child_process';

/**
 * 常见 Windows 活动代码页到 iconv-lite 编码名称的映射。
 * 65001 是 UTF-8；936 是简体中文 GBK；950 是繁体中文 Big5；等等。
 */
function codePageToEncoding(cp: number): string {
  switch (cp) {
    case 65001:
      return 'utf8';
    case 936:
      return 'gbk';
    case 950:
      return 'big5';
    case 932:
      return 'shift_jis';
    case 949:
      return 'euc-kr';
    case 437:
    case 850:
    case 1252:
      return 'latin1';
    default:
      // 对未知代码页，保守回退到 GBK（中文 Windows 最常见）
      return 'gbk';
  }
}

/** 在 Windows 上通过 `chcp` 获取当前控制台活动代码页。 */
function detectWindowsConsoleEncoding(): string {
  try {
    // chcp 输出示例（中文系统）:"活动代码页: 936"；（英文系统）:"Active code page: 936"
    const out = execSync('chcp', { encoding: 'utf8', windowsHide: true });
    const match = /:\s*(\d+)/.exec(out);
    const cp = match ? parseInt(match[1], 10) : 65001;
    return codePageToEncoding(cp);
  } catch {
    return 'utf8';
  }
}

/**
 * 系统默认回退编码。
 * - Windows：根据当前控制台代码页自动探测（如 GBK）
 * - 其他平台：通常 PostgreSQL 工具已输出 UTF-8，回退保持 UTF-8
 */
export const fallbackEncoding = process.platform === 'win32'
  ? detectWindowsConsoleEncoding()
  : 'utf8';
