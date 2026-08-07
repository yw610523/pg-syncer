import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'node:fs';
import path from 'node:path';

export interface DirEntry {
  name: string;
  full: string;
  isDir: boolean;
}

export interface FilePickerProps {
  /** 初始浏览目录，不存在时回退到系统根目录 */
  startDir?: string;
  /** 文件过滤（仅文件模式生效），返回 false 的文件不展示 */
  filter?: (entry: DirEntry) => boolean;
  /** 只允许选择文件（例如 SSL 证书） */
  onlyFiles?: boolean;
  /** 只允许选择目录（例如 pg bin 目录） */
  onlyDirectories?: boolean;
  title?: string;
  /** 选中时回调：仅文件模式/仅目录模式下，直接选中目标 */
  onSelect: (full: string, entry: DirEntry) => void;
  onCancel: () => void;
}

/** Windows 特殊标记：空字符串表示"盘符选择屏幕"，非真实目录 */
const WIN_DRIVE_SELECT = '';

function isRoot(dir: string): boolean {
  if (process.platform === 'win32') {
    // Windows: 空字符串（盘符选择）或盘符根目录（如 C:\）都是"根"
    return dir === WIN_DRIVE_SELECT || /^[A-Za-z]:\\$/.test(dir);
  }
  return path.dirname(dir) === dir;
}

/** 是否为 Windows 盘符选择屏幕 */
function isDriveSelect(dir: string): boolean {
  return process.platform === 'win32' && dir === WIN_DRIVE_SELECT;
}

/** 列出目录内容（Windows 盘符选择时枚举盘符） */
function listEntries(
  dir: string,
  filter: ((e: DirEntry) => boolean) | undefined,
  onlyDirectories: boolean,
): DirEntry[] {
  let entries: DirEntry[] = [];

  if (isDriveSelect(dir)) {
    // Windows 盘符选择屏幕：列出所有可用盘符
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c);
      const root = `${letter}:\\`;
      if (fs.existsSync(root)) entries.push({ name: `${letter}:`, full: root, isDir: true });
    }
  } else {
    try {
      entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => !d.name.startsWith('.'))
        .map((d) => ({ name: d.name, full: path.join(dir, d.name), isDir: d.isDirectory() }))
        .filter((e) => e.isDir || !onlyDirectories)
        .filter((e) => e.isDir || !filter || filter(e));
    } catch {
      entries = [];
    }
  }

  return entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * 目录/文件选择器：
 * 键盘上下箭头穿梭文件夹，Enter 选中（文件直接选中 / 目录进入），
 * 向左箭头或 Backspace 返回上级，Esc 取消。
 * 杜绝手打绝对路径的易错体验。
 */
export function FilePicker({
  startDir,
  filter,
  onlyFiles,
  onlyDirectories,
  title,
  onSelect,
  onCancel,
}: FilePickerProps) {
  const [cwd, setCwd] = useState<string>(() => {
    if (startDir) {
      try {
        const st = fs.statSync(startDir);
        return st.isDirectory() ? startDir : path.dirname(startDir);
      } catch {
        /* fallthrough */
      }
    }
    // Windows 默认进入盘符选择屏幕，Unix 默认进入 /
    return process.platform === 'win32' ? WIN_DRIVE_SELECT : '/';
  });
  const [cursor, setCursor] = useState(0);

  const entries = useMemo(
    () => listEntries(cwd, filter, !!onlyDirectories),
    [cwd, filter, onlyDirectories],
  );

  const safeCursor = Math.min(cursor, Math.max(0, entries.length - 1));
  const current = entries[safeCursor];

  const goUp = (): void => {
    setCursor(0);
    setCwd((prev) => {
      if (process.platform === 'win32') {
        // Windows: 盘符根目录（如 C:\）回退到盘符选择屏幕
        if (/^[A-Za-z]:\\$/.test(prev)) return WIN_DRIVE_SELECT;
        if (prev === WIN_DRIVE_SELECT) return prev; // 已在盘符选择屏幕，不继续回退
        return path.dirname(prev);
      }
      // Unix: 标准回退
      return isRoot(prev) ? prev : path.dirname(prev);
    });
  };

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(entries.length - 1, c + 1));
    } else if (key.leftArrow || key.backspace) {
      goUp();
    } else if (key.rightArrow || key.return) {
      if (!current) return;
      if (current.isDir) {
        if (onlyDirectories) {
          onSelect(current.full, current);
        } else {
          setCursor(0);
          setCwd(current.full);
        }
      } else {
        onSelect(current.full, current);
      }
    } else if (input === ' ' && onlyDirectories) {
      // 空格：直接把当前所在目录作为选中结果
      onSelect(cwd, { name: path.basename(cwd) || cwd, full: cwd, isDir: true });
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="cyan">
        {title ?? '选择目录'}
      </Text>
      <Box>
        <Text color="yellow" wrap="truncate-end">
          📁 {cwd === WIN_DRIVE_SELECT ? '（选择盘符）' : cwd}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1} overflow="hidden" flexGrow={1}>
        {entries.length === 0 ? <Text dimColor>（空目录或无法访问）</Text> : null}
        {entries.map((e, i) => {
          const active = i === safeCursor;
          return (
            <Box key={e.full}>
              <Text
                color={active ? 'black' : undefined}
                backgroundColor={active ? 'blue' : undefined}
                bold={active}
              >
                {active ? '› ' : '  '}
                {e.isDir ? `${e.name}/` : e.name}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          ↑/↓ 移动 · [Enter] 选中或进入 · [←/Backspace] 上级目录
          {onlyDirectories ? ' · [Space] 选择当前目录' : ''} · [Esc] 取消
        </Text>
      </Box>
    </Box>
  );
}
