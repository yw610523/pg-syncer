import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ToolPaths } from './types.js';

const TOOL_NAMES: Record<keyof ToolPaths, string> = {
  pgDump: 'pg_dump',
  pgRestore: 'pg_restore',
  psql: 'psql',
};

function exeName(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

/** 在 PATH 中查找可执行文件（Windows 下自动补 .exe） */
export function findInPath(name: string): string | null {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    try {
      const full = path.join(dir, exeName(name));
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    } catch {
      /* 忽略单个不可访问目录 */
    }
  }
  return null;
}

/** 列出某父目录下所有直接子目录的完整路径 */
function globChildren(parent: string): string[] {
  try {
    return fs
      .readdirSync(parent)
      .map((d) => path.join(parent, d))
      .filter((p) => {
        try {
          return fs.statSync(p).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/** 探测 PostgreSQL 常见安装目录 */
export function findInCommonLocations(name: string): string | null {
  const bases: string[] = [];
  if (process.platform === 'win32') {
    bases.push(...globChildren('C:\\Program Files\\PostgreSQL'));
    bases.push(...globChildren('C:\\Program Files (x86)\\PostgreSQL'));
    bases.push('C:\\PostgreSQL', 'D:\\PostgreSQL');
    if (process.env.PG_BIN) bases.push(process.env.PG_BIN);
  } else {
    bases.push(
      '/usr/bin',
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/local/bin',
      '/snap/bin',
    );
    for (const v of globChildren('/usr/lib/postgresql')) {
      bases.push(path.join(v, 'bin'));
    }
    for (const v of globChildren('/usr/local/opt')) {
      if (v.includes('postgresql')) bases.push(path.join(v, 'bin'));
    }
  }

  for (const base of bases) {
    try {
      const full = path.join(base, exeName(name));
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** 探测所有 PostgreSQL 配套工具（PATH 优先，其次常见安装目录） */
export async function detectAll(): Promise<ToolPaths> {
  const result: ToolPaths = { pgDump: null, pgRestore: null, psql: null };
  for (const key of Object.keys(result) as (keyof ToolPaths)[]) {
    result[key] = findInPath(TOOL_NAMES[key]) ?? findInCommonLocations(TOOL_NAMES[key]);
  }
  return result;
}

/** 在指定目录内查找工具（支持 PG_HOME 和 bin 目录两种选择方式） */
export function detectInDir(dir: string): ToolPaths {
  const result: ToolPaths = { pgDump: null, pgRestore: null, psql: null };
  // 同时探测 dir 本身和 dir/bin 两种布局，方便用户选择 PostgreSQL 根目录（PG_HOME）或直接选 bin 目录
  const candidates = [dir, path.join(dir, 'bin')];
  for (const base of candidates) {
    for (const key of Object.keys(result) as (keyof ToolPaths)[]) {
      if (result[key]) continue; // 已找到则跳过
      try {
        const full = path.join(base, exeName(TOOL_NAMES[key]));
        if (fs.existsSync(full) && fs.statSync(full).isFile()) result[key] = full;
      } catch {
        /* ignore */
      }
    }
  }
  return result;
}

/** 执行 `xxx --version` 读取版本信息 */
export function runVersion(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    let out = '';
    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString();
    });
    const timer = setTimeout(() => {
      try {
        child?.kill();
      } catch {
        /* ignore */
      }
    }, 5000);
    timer.unref?.();
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? (out.trim().split('\n')[0] ?? null) : null);
    });
  });
}

/** 依次探测所有工具的版本号 */
export async function probeVersions(
  t: ToolPaths,
): Promise<Record<keyof ToolPaths, string | null>> {
  const out = {} as Record<keyof ToolPaths, string | null>;
  for (const key of Object.keys(t) as (keyof ToolPaths)[]) {
    out[key] = t[key] ? await runVersion(t[key]!) : null;
  }
  return out;
}

/** 核心工具（pg_dump + pg_restore）是否就绪 */
export function coreToolsReady(t: ToolPaths): boolean {
  return Boolean(t.pgDump && t.pgRestore);
}

/** 缺失的核心工具名称列表（用于引导提示） */
export function missingCoreTools(t: ToolPaths): string[] {
  const missing: string[] = [];
  if (!t.pgDump) missing.push('pg_dump');
  if (!t.pgRestore) missing.push('pg_restore');
  return missing;
}
