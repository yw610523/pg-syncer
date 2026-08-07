import { spawn } from 'node:child_process';
import type { DbEnvironment } from './types.js';
import { buildConnString } from './connstring.js';

/** 查询某环境的所有可连接数据库列表（排除 template0/template1/postgres 等系统库） */
const SYSTEM_DB = new Set(['template0', 'template1', 'postgres']);

export interface QueryDatabasesResult {
  ok: boolean;
  databases: string[];
  error?: string;
}

/**
 * 用 psql 连接源环境，查询所有可连接的用户数据库。
 * 默认排除系统数据库（template0/template1/postgres）。
 */
export function queryDatabases(
  env: DbEnvironment,
  psqlPath: string,
  includeSystem = false,
): Promise<QueryDatabasesResult> {
  return new Promise((resolve) => {
    // 查询可连接且非模板的数据库
    const sql = includeSystem
      ? 'SELECT datname FROM pg_database WHERE datallowconn ORDER BY datname;'
      : 'SELECT datname FROM pg_database WHERE datallowconn AND datname NOT IN (\'template0\', \'template1\', \'postgres\') ORDER BY datname;';

    const envVars: NodeJS.ProcessEnv = { ...process.env };
    envVars.PGPASSWORD = env.password ?? '';
    envVars.PGSSLMODE = env.sslMode || 'prefer';
    if (env.sslRootCert) envVars.PGSSLROOTCERT = env.sslRootCert;
    if (env.sslCert) envVars.PGSSLCERT = env.sslCert;
    if (env.sslKey) envVars.PGSSLKEY = env.sslKey;

    let child;
    try {
      child = spawn(
        psqlPath,
        ['-d', buildConnString(env), '-t', '-A', '-c', sql],
        {
          env: envVars,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
    } catch (err) {
      resolve({ ok: false, databases: [], error: `启动 psql 失败：${(err as Error).message}` });
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      try {
        child?.kill();
      } catch {
        /* ignore */
      }
      resolve({ ok: false, databases: [], error: '查询超时（15s）' });
    }, 15000);
    timer.unref?.();

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, databases: [], error: `psql 进程错误：${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        // 提取第一行有用的错误信息
        const firstLine = stderr.split('\n').find((l) => l.trim()) ?? '';
        resolve({
          ok: false,
          databases: [],
          error: `psql 退出码 ${code}${firstLine ? `：${firstLine}` : ''}`,
        });
        return;
      }
      const databases = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .filter((l) => includeSystem || !SYSTEM_DB.has(l));
      resolve({ ok: true, databases });
    });
  });
}

/** 检查目标环境是否已存在指定数据库 */
export function databaseExists(
  env: DbEnvironment,
  psqlPath: string,
  dbName: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const envVars: NodeJS.ProcessEnv = { ...process.env };
    envVars.PGPASSWORD = env.password ?? '';
    envVars.PGSSLMODE = env.sslMode || 'prefer';
    if (env.sslRootCert) envVars.PGSSLROOTCERT = env.sslRootCert;
    if (env.sslCert) envVars.PGSSLCERT = env.sslCert;
    if (env.sslKey) envVars.PGSSLKEY = env.sslKey;

    const sql = `SELECT 1 FROM pg_database WHERE datname = '${dbName.replace(/'/g, "''")}';`;

    let child;
    try {
      child = spawn(
        psqlPath,
        ['-d', buildConnString(env), '-t', '-A', '-c', sql],
        {
          env: envVars,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
    } catch {
      resolve(false);
      return;
    }

    let stdout = '';
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });

    const timer = setTimeout(() => {
      try {
        child?.kill();
      } catch {
        /* ignore */
      }
      resolve(false);
    }, 10000);
    timer.unref?.();

    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(stdout.trim() === '1');
    });
  });
}

/** 在目标环境创建数据库 */
export function createDatabase(
  env: DbEnvironment,
  psqlPath: string,
  dbName: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const envVars: NodeJS.ProcessEnv = { ...process.env };
    envVars.PGPASSWORD = env.password ?? '';
    envVars.PGSSLMODE = env.sslMode || 'prefer';

    // 连到默认库执行 CREATE DATABASE
    const safeName = dbName.replace(/'/g, "''");
    const child = spawn(
      psqlPath,
      ['-d', buildConnString({ ...env, database: 'postgres' }), '-c', `CREATE DATABASE "${safeName}";`],
      {
        env: envVars,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve(false);
    }, 10000);
    timer.unref?.();

    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/** 在目标环境删除数据库（覆盖同步时用） */
export function dropDatabase(
  env: DbEnvironment,
  psqlPath: string,
  dbName: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const envVars: NodeJS.ProcessEnv = { ...process.env };
    envVars.PGPASSWORD = env.password ?? '';
    envVars.PGSSLMODE = env.sslMode || 'prefer';

    const safeName = dbName.replace(/'/g, "''");
    const child = spawn(
      psqlPath,
      ['-d', buildConnString({ ...env, database: 'postgres' }), '-c', `DROP DATABASE IF EXISTS "${safeName}";`],
      {
        env: envVars,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve(false);
    }, 15000);
    timer.unref?.();

    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}
