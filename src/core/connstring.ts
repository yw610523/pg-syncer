import type { DbEnvironment } from './types.js';

/**
 * 根据命名环境生成 pg_dump / pg_restore 可直接使用的连接串。
 * 密码不写入连接串（避免出现在进程列表/日志中），改为通过 PGPASSWORD 环境变量透传。
 * database 参数可覆盖环境默认库，用于单库同步。
 */
export function buildConnString(env: DbEnvironment, database?: string): string {
  const db = database ?? env.database;
  return `postgresql://${encodeURIComponent(env.user)}@${env.host}:${env.port}/${encodeURIComponent(db)}`;
}

/** 环境摘要展示：user@host:port/db */
export function describeEnv(env: DbEnvironment): string {
  return `${env.user}@${env.host}:${env.port}/${env.database}`;
}

/** 新建环境的默认值 */
export function emptyEnvironment(): DbEnvironment {
  return {
    name: '',
    host: '',
    port: 5432,
    user: '',
    database: '',
    sslMode: 'prefer',
  };
}
