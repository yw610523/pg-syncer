import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DbEnvironment, SyncParams, ToolPaths } from '../core/types.js';
import type { ConfigData } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.pg-syncer');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const nowIso = (): string => new Date().toISOString();

function ensureTimestamps(env: DbEnvironment): DbEnvironment {
  const ts = nowIso();
  return {
    ...env,
    createdAt: env.createdAt ?? ts,
    updatedAt: env.updatedAt ?? ts,
  };
}

function defaultConfig(): ConfigData {
  const ts = nowIso();
  return {
    version: 1,
    tools: { pgDump: null, pgRestore: null, psql: null },
    // 预置一个本地默认环境，方便用户开箱即用
    environments: [
      {
        name: 'localhost',
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'postgres',
        sslMode: 'disable',
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    last: null,
    lastPickerDir: null,
  };
}

/**
 * conf 风格的本地 JSON 存储（原子写入：先写临时文件再 rename）。
 * 文件位于 ~/.pg-syncer/config.json，用于持久化：
 * 工具路径、命名环境、最近一次同步参数。
 */
export class ConfigStore {
  private data: ConfigData;

  constructor() {
    this.data = this.load();
  }

  /** 当前配置快照（只读视图） */
  get snapshot(): Readonly<ConfigData> {
    return this.data;
  }

  private load(): ConfigData {
    try {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Partial<ConfigData>;
      const base = defaultConfig();
      // 若已有环境列表则保留；空列表则补 localhost 默认环境（幂等，避免反复注入）
      const environments = Array.isArray(parsed.environments) && parsed.environments.length > 0
        ? parsed.environments.map(ensureTimestamps)
        : base.environments;
      return {
        ...base,
        tools: { ...base.tools, ...(parsed.tools ?? {}) },
        environments,
        last: parsed.last ?? null,
        lastPickerDir: parsed.lastPickerDir ?? null,
      };
    } catch {
      return defaultConfig();
    }
  }

  private update(mutator: (draft: ConfigData) => void): void {
    const draft = structuredClone(this.data);
    mutator(draft);
    this.data = draft;
    this.persist();
  }

  setTools(t: ToolPaths): void {
    this.update((d) => {
      d.tools = t;
    });
  }

  /** 保存环境：同名覆盖，否则追加 */
  upsertEnvironment(env: DbEnvironment): void {
    const ts = nowIso();
    this.update((d) => {
      const idx = d.environments.findIndex((e) => e.name === env.name);
      if (idx >= 0) {
        d.environments[idx] = { ...ensureTimestamps(env), updatedAt: ts };
      } else {
        d.environments.push({ ...ensureTimestamps(env), createdAt: ts, updatedAt: ts });
      }
    });
  }

  /** 按名字删除环境 */
  deleteEnvironment(name: string): void {
    this.update((d) => {
      d.environments = d.environments.filter((e) => e.name !== name);
    });
  }

  /** 记录最近一次同步参数（源/目标按环境名） */
  setLastSync(p: Pick<SyncParams, 'format' | 'jobs' | 'noOwner'> & { source: string; target: string }): void {
    this.update((d) => {
      d.last = { source: p.source, target: p.target, format: p.format, jobs: p.jobs, noOwner: p.noOwner };
    });
  }

  /** 记录文件/目录选择器上次打开的位置 */
  setLastPickerDir(dir: string): void {
    this.update((d) => {
      d.lastPickerDir = dir;
    });
  }

  private persist(): void {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      const tmp = `${CONFIG_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, CONFIG_FILE);
    } catch {
      // 配置写入失败不阻塞主流程
    }
  }
}

/** 全局单例 */
export const config = new ConfigStore();
