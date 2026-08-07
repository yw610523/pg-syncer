import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { config } from '../../config/store.js';
import { databaseExists, queryDatabases } from '../../core/dbinfo.js';
import type { DbEnvironment, DbMapping, DumpFormat, SyncParams } from '../../core/types.js';
import { describeEnv } from '../../core/connstring.js';
import { FORMAT_LABEL } from '../../utils/format.js';
import { DatabasePicker } from '../components/DatabasePicker.js';
import { Spinner } from '../components/Spinner.js';
import { Hint, StepHeader } from '../components/UI.js';

type Page = 'query' | 'pick' | 'target' | 'format' | 'jobs' | 'confirm';

const FORMAT_OPTIONS = [
  { label: 'Directory (-Fd) · 目录格式，支持多线程并行，大库首选', value: 'directory' },
  { label: 'Custom    (-Fc) · 自定义格式，压缩存储，支持并行 restore', value: 'custom' },
  { label: 'Plain     (-Fp) · 纯 SQL 文本，恢复时走 psql', value: 'plain' },
] as const;

function clampJobs(n: number): number {
  return Math.max(1, Math.min(16, n || 4));
}

function defaultTargetDbName(sourceDb: string, sourceEnv: DbEnvironment): string {
  return `${sourceDb}_${sourceEnv.name}`;
}

export interface SyncSetupScreenProps {
  source: DbEnvironment;
  tools: { pgDump: string; pgRestore: string; psql: string };
  onDone: (params: SyncParams) => void;
  onCancel: () => void;
}

/**
 * 同步设置向导：
 * 1. 查询源环境数据库
 * 2. 批量勾选数据库
 * 3. 选择目标环境（默认 localhost，可修改）
 * 4. 选择 Dump 格式
 * 5. 设置并行线程数
 * 6. 确认面板（库名映射 + 冲突处理）
 */
export function SyncSetupScreen({ source, tools, onDone, onCancel }: SyncSetupScreenProps) {
  const [page, setPage] = useState<Page>('query');
  const [allDatabases, setAllDatabases] = useState<string[]>([]);
  const [queryError, setQueryError] = useState('');
  const [selectedDbs, setSelectedDbs] = useState<string[]>([]);
  const [target, setTarget] = useState<DbEnvironment | null>(null);
  const [format, setFormat] = useState<DumpFormat>('directory');
  const [jobs, setJobs] = useState('4');
  const [confirmMappings, setConfirmMappings] = useState<DbMapping[]>([]);
  const [cursor, setCursor] = useState(0);
  const [renameIndex, setRenameIndex] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');

  const environments = config.snapshot.environments;

  // 默认目标环境：localhost（如果存在），否则选第一个非 source
  useEffect(() => {
    const localhost = environments.find((e) => e.name === 'localhost');
    if (localhost && localhost.name !== source.name) {
      setTarget(localhost);
    } else {
      const fallback = environments.find((e) => e.name !== source.name);
      if (fallback) setTarget(fallback);
    }
  }, [environments, source]);

  // 查询数据库
  useEffect(() => {
    if (page !== 'query') return;
    let cancelled = false;
    void (async () => {
      const res = await queryDatabases(source, tools.psql);
      if (cancelled) return;
      if (res.ok) {
        setAllDatabases(res.databases);
        setSelectedDbs(res.databases);
        setPage('pick');
      } else {
        setQueryError(res.error ?? '查询失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, source, tools.psql]);

  // 生成确认映射（含冲突检查）
  const buildMappings = async (dbs: string[], targetEnv: DbEnvironment): Promise<DbMapping[]> => {
    const out: DbMapping[] = [];
    for (const db of dbs) {
      const targetDb = defaultTargetDbName(db, source);
      const exists = await databaseExists(targetEnv, tools.psql, targetDb);
      out.push({
        sourceDb: db,
        targetDb,
        conflict: exists ? 'overwrite' : 'overwrite',
      });
    }
    return out;
  };

  // 通用键盘：确认页切换冲突策略；其他页 Esc 返回上一步
  useInput((input, key) => {
    if (key.escape) {
      if (renameIndex !== null) {
        setRenameIndex(null);
        return;
      }
      if (page === 'target') setPage('pick');
      else if (page === 'format') setPage('target');
      else if (page === 'jobs') setPage('format');
      else if (page === 'confirm') onCancel();
      return;
    }
    if (renameIndex !== null) return; // 重命名输入由 TextInput 处理
    if (page === 'jobs') {
      if (input === '+' || input === '=') setJobs((v) => String(clampJobs(parseInt(v, 10) + 1)));
      else if (input === '-' || input === '_') setJobs((v) => String(clampJobs(parseInt(v, 10) - 1)));
      else if (key.return) {
        void (async () => {
          const mappings = await buildMappings(selectedDbs, target!);
          setConfirmMappings(mappings);
          setPage('confirm');
        })();
      }
      return;
    }
    if (page !== 'confirm') return;
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow) setCursor((c) => Math.min(confirmMappings.length - 1, c + 1));
    else if (input === 'o' || input === 'O') updateConflict(cursor, 'overwrite');
    else if (input === 'k' || input === 'K') updateConflict(cursor, 'skip');
    else if (input === 'r' || input === 'R') {
      const m = confirmMappings[cursor];
      if (m) {
        setRenameIndex(cursor);
        setRenameText(m.renamedTo ?? m.targetDb);
      }
    } else if (key.return) {
      onDone({
        source,
        target: target!,
        databases: confirmMappings,
        format,
        jobs: clampJobs(parseInt(jobs, 10)),
        noOwner: true,
      });
    }
  });

  const updateConflict = (index: number, conflict: DbMapping['conflict']): void => {
    const next = [...confirmMappings];
    const m = next[index];
    if (m) {
      next[index] = { ...m, conflict };
      setConfirmMappings(next);
    }
  };

  if (page === 'query') {
    return (
      <Box flexDirection="column">
        <Spinner label={`正在查询 ${source.name} 的数据库列表…`} />
      </Box>
    );
  }

  if (page === 'pick') {
    return (
      <DatabasePicker
        databases={allDatabases}
        defaultSelected={selectedDbs}
        onDone={async (dbs) => {
          if (dbs.length === 0) {
            onCancel();
            return;
          }
          setSelectedDbs(dbs);
          // 总是进入目标选择，让用户有机会修改目标
          setPage('target');
        }}
        onCancel={onCancel}
      />
    );
  }

  if (page === 'target') {
    const items = environments
      .filter((e) => e.name !== source.name)
      .map((e) => ({
        label: `${e.name} · ${describeEnv(e)}`,
        value: e.name,
      }));
    if (items.length === 0) {
      return (
        <Box flexDirection="column">
          <Text color="yellow">没有可用的目标环境（至少需要 2 个环境）</Text>
          <Hint>按任意键返回</Hint>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <StepHeader title="选择目标环境（默认 localhost）" />
        <SelectInput
          items={items}
          initialIndex={Math.max(0, items.findIndex((i) => i.value === target?.name))}
          onSelect={async (item) => {
            const env = environments.find((e) => e.name === item.value)!;
            setTarget(env);
            const mappings = await buildMappings(selectedDbs, env);
            setConfirmMappings(mappings);
            setPage('format');
          }}
        />
        <Hint>Enter 选择 · Esc 取消</Hint>
      </Box>
    );
  }

  if (page === 'format') {
    return (
      <Box flexDirection="column">
        <StepHeader title="Dump 格式" />
        <SelectInput
          items={FORMAT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          onSelect={(item) => {
            setFormat(item.value as DumpFormat);
            setPage('jobs');
          }}
        />
        <Hint>Enter 选择 · Esc 返回</Hint>
      </Box>
    );
  }

  if (page === 'jobs') {
    return (
      <Box flexDirection="column">
        <StepHeader title="并行线程数 (-j)" />
        <TextInput
          value={jobs}
          onChange={(v) => setJobs(v.replace(/[^0-9]/g, ''))}
          onSubmit={() => {
            void (async () => {
              const mappings = await buildMappings(selectedDbs, target!);
              setConfirmMappings(mappings);
              setPage('confirm');
            })();
          }}
        />
        <Hint>1~16 · 输入数字或用 +/- 调整 · Enter 确认 · Esc 返回</Hint>
      </Box>
    );
  }

  if (page === 'confirm') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <StepHeader title="同步确认" />
        <Box marginBottom={1}>
          <Text>
            源：{source.name} → 目标：{target?.name} · 格式 {FORMAT_LABEL[format]} · -j {clampJobs(parseInt(jobs, 10))}
          </Text>
        </Box>
        {confirmMappings.map((m, i) => {
          const active = i === cursor;
          const isRenaming = renameIndex === i;
          const displayTarget = m.conflict === 'rename' ? (m.renamedTo ?? m.targetDb) : m.targetDb;
          const conflictText =
            m.conflict === 'overwrite' ? '覆盖' : m.conflict === 'skip' ? '跳过' : `重命名→${displayTarget}`;
          return (
            <Box key={m.sourceDb}>
              {isRenaming ? (
                <Box>
                  <Text bold color="yellow">› {m.sourceDb} → </Text>
                  <TextInput
                    value={renameText}
                    onChange={setRenameText}
                    onSubmit={() => {
                      const next = [...confirmMappings];
                      next[i] = { ...m, conflict: 'rename', renamedTo: renameText.trim() || m.targetDb };
                      setConfirmMappings(next);
                      setRenameIndex(null);
                    }}
                  />
                  <Text dimColor>  [Enter 确认 · Esc 取消]</Text>
                </Box>
              ) : (
                <Text
                  color={active ? 'black' : undefined}
                  backgroundColor={active ? 'blue' : undefined}
                  bold={active}
                >
                  {active ? '› ' : '  '}
                  {m.sourceDb} → {displayTarget}
                  {'  '}
                  <Text color={m.conflict === 'skip' ? 'yellow' : 'cyan'}>[{conflictText}]</Text>
                </Text>
              )}
            </Box>
          );
        })}
        <Box marginTop={1}>
          <Text dimColor>
            {renameIndex !== null
              ? '输入新库名 · Enter 确认 · Esc 取消'
              : '↑/↓ 选择 · [o] 覆盖 · [k] 跳过 · [r] 重命名 · [Enter] 开始 · [Esc] 取消'}
          </Text>
        </Box>
      </Box>
    );
  }

  // fallback
  return null;
}
