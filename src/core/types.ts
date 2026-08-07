// 同步任务相关的共享类型定义

/** pg_dump / pg_restore / psql 的可执行文件路径 */
export interface ToolPaths {
  pgDump: string | null;
  pgRestore: string | null;
  psql: string | null;
}

/** Dump 格式：目录格式（默认，支持并行）、自定义格式、纯 SQL */
export type DumpFormat = 'directory' | 'custom' | 'plain';

/**
 * 命名数据库环境（类似 IDEA 数据库插件的连接配置）。
 * 每个环境有独立的名字，同步时按名字选择源 / 目标。
 */
export interface DbEnvironment {
  /** 环境名，例如 sit1 / sit2 / prod */
  name: string;
  /** 主机名或 IP */
  host: string;
  /** 端口（默认 5432） */
  port: number;
  user: string;
  /** 密码（可选，通过 PGPASSWORD 传给子进程，不写入连接串） */
  password?: string;
  database: string;
  /** PGSSLMODE */
  sslMode: string;
  /** PGSSLROOTCERT（可选） */
  sslRootCert?: string;
  /** PGSSLCERT 客户端证书（可选） */
  sslCert?: string;
  /** PGSSLKEY 客户端私钥（可选） */
  sslKey?: string;
}

/** 单个数据库的同步映射：源库名 → 目标库名 */
export interface DbMapping {
  /** 源数据库名 */
  sourceDb: string;
  /** 目标数据库名（默认规则 ${sourceDb}_${sourceEnvName}） */
  targetDb: string;
  /** 冲突处理策略 */
  conflict: 'overwrite' | 'skip' | 'rename';
  /** 冲突时用户自定义的新库名（rename 策略） */
  renamedTo?: string;
}

/** 一次同步任务的完整参数（向导确认后的产物） */
export interface SyncParams {
  /** 源环境（远程） */
  source: DbEnvironment;
  /** 目标环境（本地） */
  target: DbEnvironment;
  /** 选中的数据库映射列表 */
  databases: DbMapping[];
  format: DumpFormat;
  /** 并行线程数 -j */
  jobs: number;
  /** restore 时使用 --no-owner / --no-privileges（跨环境同步默认开启） */
  noOwner: boolean;
}

/** 运行期参数：SyncParams + 已解析的工具路径 */
export interface RunOptions extends SyncParams {
  tools: ToolPaths;
}

export type StageKind = 'dump' | 'restore';
export type StageState = 'idle' | 'running' | 'done' | 'failed';

export interface StageInfo {
  kind: StageKind;
  state: StageState;
  code?: number | null;
}

/** 单个库的同步结果 */
export interface DbSyncResult {
  sourceDb: string;
  targetDb: string;
  ok: boolean;
  error?: string;
  dumpLines: string[];
  restoreLines: string[];
  elapsedMs: number;
}

/** 任务最终结果 */
export interface RunResult {
  ok: boolean;
  /** 总退出码：全部成功为 0，否则最后一个失败码或 -1 */
  code: number | null;
  error?: string;
  /** 每个库的同步结果 */
  results: DbSyncResult[];
  elapsedMs: number;
}
