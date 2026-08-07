import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { buildConnString } from './connstring.js';
import { createDatabase, databaseExists, dropDatabase } from './dbinfo.js';
import { createLineSplitter } from './linestream.js';
import type {
  DbEnvironment,
  DbMapping,
  DbSyncResult,
  RunOptions,
  RunResult,
} from './types.js';

function dumpPathFor(format: RunOptions['format']): string {
  const base = path.join(os.tmpdir(), `pg-syncer-${process.pid}-${Date.now()}`);
  if (format === 'directory') return base;
  return `${base}.${format === 'custom' ? 'dump' : 'sql'}`;
}

const MAX_LINES_PER_STREAM = 2000;

/** 构建某个环境对应的子进程环境变量：PGPASSWORD + SSL 相关 */
function envOf(env: DbEnvironment): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env };
  e.PGPASSWORD = env.password ?? '';
  e.PGSSLMODE = env.sslMode || 'prefer';
  if (env.sslRootCert) e.PGSSLROOTCERT = env.sslRootCert;
  if (env.sslCert) e.PGSSLCERT = env.sslCert;
  if (env.sslKey) e.PGSSLKEY = env.sslKey;
  return e;
}

interface ChildResult {
  ok: boolean;
  code: number | null;
  lines: string[];
}

/**
 * 多库同步管线：
 * 对每个 DbMapping 依次执行：[drop 若 overwrite] → pg_dump 源 → [create 目标库] → pg_restore 目标
 * 以事件方式对外发布 db-start / db-done / line / all-done。
 */
export class Pipeline extends EventEmitter {
  readonly startedAt = Date.now();
  private readonly opts: RunOptions;
  private child: ChildProcess | null = null;
  private killed = false;
  private currentDb: DbMapping | null = null;

  constructor(opts: RunOptions) {
    super();
    this.opts = opts;
  }

  async run(): Promise<RunResult> {
    const startedAt = Date.now();
    const { tools, databases } = this.opts;
    const results: DbSyncResult[] = [];

    for (const mapping of databases) {
      if (this.killed) break;
      this.currentDb = mapping;
      const dbStart = Date.now();
      this.emit('db-start', mapping);
      const result: DbSyncResult = {
        sourceDb: mapping.sourceDb,
        targetDb: mapping.targetDb,
        ok: false,
        dumpLines: [],
        restoreLines: [],
        elapsedMs: 0,
      };

      const targetDbName = mapping.conflict === 'rename' ? (mapping.renamedTo ?? mapping.targetDb) : mapping.targetDb;

      // ---- 冲突处理 ----
      if (this.killed) break;
      const exists = await databaseExists(this.opts.target, tools.psql!, targetDbName);
      if (this.killed) break;
      if (exists) {
        if (mapping.conflict === 'skip') {
          result.ok = true;
          result.error = '目标库已存在，已跳过';
          result.elapsedMs = Date.now() - dbStart;
          results.push(result);
          this.emit('db-done', result);
          continue;
        }
        // overwrite：先删后建
        const dropped = await dropDatabase(this.opts.target, tools.psql!, targetDbName);
        if (!dropped) {
          result.ok = false;
          result.error = `无法删除目标库 ${targetDbName}`;
          result.elapsedMs = Date.now() - dbStart;
          results.push(result);
          this.emit('db-done', result);
          if (this.killed) break;
          continue;
        }
      }
      // 创建目标库（不存在时）
      await createDatabase(this.opts.target, tools.psql!, targetDbName);
      if (this.killed) break;

      // ---- pg_dump 源 ----
      const dumpPath = dumpPathFor(this.opts.format);
      const dumpArgs = this.buildDumpArgs(mapping.sourceDb, dumpPath);
      const dumpRes = await this.runChild(tools.pgDump!, dumpArgs, 'dump', envOf(this.opts.source));
      result.dumpLines = dumpRes.lines;
      if (this.killed) break;
      if (!dumpRes.ok) {
        result.ok = false;
        result.error = `pg_dump 失败（exit ${dumpRes.code ?? '未知'}）`;
        result.elapsedMs = Date.now() - dbStart;
        results.push(result);
        this.emit('db-done', result);
        this.cleanup(dumpPath);
        continue;
      }

      // ---- pg_restore / psql 目标 ----
      const restoreBin = this.opts.format === 'plain' ? tools.psql : tools.pgRestore;
      if (!restoreBin) {
        result.ok = false;
        result.error = '缺少 psql（Plain SQL 格式需要 psql 恢复）';
        result.elapsedMs = Date.now() - dbStart;
        results.push(result);
        this.emit('db-done', result);
        this.cleanup(dumpPath);
        continue;
      }
      const restoreArgs = this.buildRestoreArgs(targetDbName, dumpPath);
      const restoreRes = await this.runChild(restoreBin, restoreArgs, 'restore', envOf(this.opts.target));
      result.restoreLines = restoreRes.lines;
      this.cleanup(dumpPath);
      if (this.killed) break;
      if (!restoreRes.ok) {
        result.ok = false;
        result.error = `pg_restore 失败（exit ${restoreRes.code ?? '未知'}）`;
        result.elapsedMs = Date.now() - dbStart;
        results.push(result);
        this.emit('db-done', result);
        continue;
      }

      result.ok = true;
      result.elapsedMs = Date.now() - dbStart;
      results.push(result);
      this.emit('db-done', result);
    }

    const elapsedMs = Date.now() - startedAt;
    const ok = !this.killed && results.length > 0 && results.every((r) => r.ok);
    const error = this.killed ? '任务已被中断' : undefined;
    const lastFailed = results.findLast((r) => !r.ok);
    const code = ok ? 0 : lastFailed ? -1 : null;
    this.emit('all-done', { ok, results, elapsedMs });
    return { ok, code, error, results, elapsedMs };
  }

  abort(): void {
    this.killed = true;
    try {
      this.child?.kill();
    } catch {
      /* ignore */
    }
  }

  private buildDumpArgs(sourceDb: string, dumpPath: string): string[] {
    const { format, jobs } = this.opts;
    const conn = buildConnString(this.opts.source, sourceDb);
    // 加 -v 让 pg_dump 输出进度/表名信息，才能在 TUI 中看到实时日志
    if (format === 'directory') {
      return ['-Fd', '-v', '-j', String(jobs), '-f', dumpPath, conn];
    }
    if (format === 'custom') {
      return ['-Fc', '-v', '-f', dumpPath, conn];
    }
    return ['-Fp', '-v', '-f', dumpPath, conn];
  }

  private buildRestoreArgs(targetDb: string, dumpPath: string): string[] {
    const { format, jobs, noOwner } = this.opts;
    const conn = buildConnString(this.opts.target, targetDb);
    const ownerFlags = noOwner ? ['--no-owner', '--no-privileges'] : [];
    // 加 -v 让 pg_restore 输出进度信息
    if (format === 'plain') {
      return ['-d', conn, '-v', '-f', dumpPath];
    }
    return [...ownerFlags, '-v', '-j', String(jobs), '-d', conn, dumpPath];
  }

  private runChild(
    bin: string,
    args: string[],
    kind: 'dump' | 'restore',
    env: NodeJS.ProcessEnv,
  ): Promise<ChildResult> {
    return new Promise((resolve) => {
      const lines: string[] = [];
      let settled = false;
      const settle = (ok: boolean, code: number | null): void => {
        if (settled) return;
        settled = true;
        resolve({ ok, code, lines });
      };

      let child: ChildProcess;
      try {
        child = spawn(bin, args, {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (err) {
        lines.push(`[启动失败] ${(err as Error).message}`);
        settle(false, null);
        return;
      }
      this.child = child;

      const outSplitter = createLineSplitter((line) => {
        lines.push(line);
        if (lines.length > MAX_LINES_PER_STREAM) lines.shift();
        if (this.currentDb) this.emit('line', this.currentDb, kind, line);
      });
      child.stdout?.on('data', (d: Buffer) => outSplitter.push(d));
      child.stderr?.on('data', (d: Buffer) => outSplitter.push(d));

      child.on('error', (err) => {
        lines.push(`[进程错误] ${err.message}`);
        settle(false, null);
      });
      child.on('close', (code) => {
        outSplitter.flush();
        settle(code === 0, code);
      });
    });
  }

  private cleanup(p: string): void {
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
