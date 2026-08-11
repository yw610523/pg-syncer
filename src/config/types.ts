import type { DbEnvironment, DumpFormat, ToolPaths } from '../core/types.js';

/** ~/.pg-syncer/config.json 的数据结构 */
export interface ConfigData {
  version: number;
  /** 已解析的 PostgreSQL 工具路径 */
  tools: ToolPaths;
  /** 命名数据库环境列表（类似 IDEA 的连接配置） */
  environments: DbEnvironment[];
  /** 最近一次同步的参数（源/目标按环境名记录） */
  last: {
    source: string;
    target: string;
    format: DumpFormat;
    jobs: number;
    noOwner: boolean;
  } | null;
  /** 文件/目录选择器上次打开的位置 */
  lastPickerDir: string | null;
}
