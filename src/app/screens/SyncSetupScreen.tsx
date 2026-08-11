import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

type Field = 'target' | 'databases' | 'format' | 'jobs';
type Modal = 'none' | 'target' | 'format' | 'databases';

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
 * 同步参数表单：
 * 把原来分步骤的向导改为单页表单，像环境表单一样用 Tab/↑/↓ 切换字段。
 * 字段：目标环境、同步数据库、Dump 格式、并行线程数。
 * 下方显示库名映射与冲突状态，可直接修改冲突策略或重命名。
 */
export function SyncSetupScreen({ source, tools, onDone, onCancel }: SyncSetupScreenProps) {
  const environments = config.snapshot.environments;
  const otherEnvironments = useMemo(
    () => environments.filter((e) => e.name !== source.name),
    [environments, source],
  );

  const defaultTarget = useMemo(() => {
    const localhost = otherEnvironments.find((e) => e.name === 'localhost');
    return localhost ?? otherEnvironments[0] ?? null;
  }, [otherEnvironments]);

  const [loading, setLoading] = useState(true);
  const [queryError, setQueryError] = useState('');
  const [allDatabases, setAllDatabases] = useState<string[]>([]);

  const [target, setTarget] = useState<DbEnvironment | null>(defaultTarget);
  const [selectedDbs, setSelectedDbs] = useState<string[]>([]);
  const [format, setFormat] = useState<DumpFormat>('directory');
  const [jobs, setJobs] = useState('4');
  const [mappings, setMappings] = useState<DbMapping[]>([]);

  const [focus, setFocus] = useState<Field>('target');
  const [modal, setModal] = useState<Modal>('none');
  const [mappingCursor, setMappingCursor] = useState(0);
  const [renameIndex, setRenameIndex] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');

  // 查询源环境数据库
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await queryDatabases(source, tools.psql);
      if (cancelled) return;
      if (res.ok) {
        setAllDatabases(res.databases);
        setSelectedDbs(res.databases);
        setLoading(false);
      } else {
        setQueryError(res.error ?? '查询失败');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, tools.psql]);

  // 当目标环境或选中数据库变化时，重建映射并检查冲突
  const buildMappings = useCallback(
    async (dbs: string[], targetEnv: DbEnvironment | null) => {
      if (!targetEnv) return;
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
      setMappings(out);
    },
    [source, tools.psql],
  );

  useEffect(() => {
    void buildMappings(selectedDbs, target);
  }, [selectedDbs, target, buildMappings]);

  const mappingCount = mappings.length;
  const focusOrder: Array<Field | 'mappings' | 'start'> = useMemo(() => {
    const order: Array<Field | 'mappings' | 'start'> = ['target', 'databases', 'format', 'jobs'];
    if (mappingCount > 0) order.push('mappings');
    order.push('start');
    return order;
  }, [mappingCount]);

  const currentFocus = focusOrder[Math.min(mappingCursor, focusOrder.length - 1)];

  const moveFocus = (delta: number): void => {
    setMappingCursor((c) => Math.max(0, Math.min(focusOrder.length - 1, c + delta)));
    const next = focusOrder[Math.min(mappingCursor + delta, focusOrder.length - 1)];
    if (next && next !== 'mappings' && next !== 'start') {
      setFocus(next);
    }
  };

  const updateConflict = (index: number, conflict: DbMapping['conflict']): void => {
    setMappings((prev) => {
      const next = [...prev];
      const m = next[index];
      if (m) next[index] = { ...m, conflict };
      return next;
    });
  };

  const startSync = (): void => {
    if (!target || selectedDbs.length === 0) return;
    const finalMappings = mappings
      .filter((m) => selectedDbs.includes(m.sourceDb))
      .map((m) => ({
        ...m,
        targetDb: m.conflict === 'rename' ? (m.renamedTo ?? m.targetDb) : m.targetDb,
      }));
    onDone({
      source,
      target,
      databases: finalMappings,
      format,
      jobs: clampJobs(parseInt(jobs, 10)),
      noOwner: true,
    });
  };

  useInput((input, key) => {
    if (modal !== 'none' || renameIndex !== null) return;

    if (key.escape) {
      onCancel();
      return;
    }

    if (currentFocus === 'mappings') {
      const idx = mappingCursor - focusOrder.indexOf('mappings');
      const safeIdx = Math.max(0, Math.min(mappings.length - 1, idx));
      if (key.upArrow) moveFocus(-1);
      else if (key.downArrow) moveFocus(1);
      else if (input === 'o' || input === 'O') updateConflict(safeIdx, 'overwrite');
      else if (input === 'k' || input === 'K') updateConflict(safeIdx, 'skip');
      else if (input === 'r' || input === 'R') {
        const m = mappings[safeIdx];
        if (m) {
          setRenameIndex(safeIdx);
          setRenameText(m.renamedTo ?? m.targetDb);
        }
      }
      return;
    }

    if (currentFocus === 'start') {
      if (key.return || input === 's' || input === 'S') startSync();
      else if (key.upArrow) moveFocus(-1);
      return;
    }

    // 表单字段导航
    if (key.tab) {
      moveFocus(key.shift ? -1 : 1);
      return;
    }
    if (key.upArrow) moveFocus(-1);
    else if (key.downArrow) moveFocus(1);
    else if (key.return) {
      if (focus === 'target') setModal('target');
      else if (focus === 'databases') setModal('databases');
      else if (focus === 'format') setModal('format');
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column">
        <Spinner label={`正在查询 ${source.name} 的数据库列表…`} />
      </Box>
    );
  }

  if (queryError) {
    return (
      <Box flexDirection="column">
        <Text color="red">查询数据库失败：{queryError}</Text>
        <Hint>按 Esc 返回</Hint>
      </Box>
    );
  }

  if (modal === 'target') {
    return (
      <Box flexDirection="column">
        <StepHeader title="选择目标环境" />
        {otherEnvironments.length === 0 ? (
          <Text color="yellow">没有可用的目标环境（至少需要 2 个环境）</Text>
        ) : (
          <SelectInput
            items={otherEnvironments.map((e) => ({
              label: `${e.name} · ${describeEnv(e)}`,
              value: e.name,
            }))}
            initialIndex={Math.max(
              0,
              otherEnvironments.findIndex((e) => e.name === target?.name),
            )}
            onSelect={(item) => {
              setTarget(otherEnvironments.find((e) => e.name === item.value)!);
              setModal('none');
            }}
          />
        )}
        <Hint>Enter 选择 · Esc 取消</Hint>
      </Box>
    );
  }

  if (modal === 'format') {
    return (
      <Box flexDirection="column">
        <StepHeader title="Dump 格式" />
        <SelectInput
          items={FORMAT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          initialIndex={FORMAT_OPTIONS.findIndex((o) => o.value === format)}
          onSelect={(item) => {
            setFormat(item.value as DumpFormat);
            setModal('none');
          }}
        />
        <Hint>Enter 选择 · Esc 取消</Hint>
      </Box>
    );
  }

  if (modal === 'databases') {
    return (
      <DatabasePicker
        databases={allDatabases}
        defaultSelected={selectedDbs}
        onDone={(dbs) => {
          setSelectedDbs(dbs);
          setModal('none');
        }}
        onCancel={() => setModal('none')}
      />
    );
  }

  const renderField = (field: Field, label: string, value: React.ReactNode): React.ReactNode => {
    const active = currentFocus === field;
    return (
      <Box key={field} marginTop={1}>
        <Box width={16}>
          <Text color={active ? 'cyan' : undefined} bold={active}>
            {active ? '▸ ' : '  '}
            {label}
          </Text>
        </Box>
        <Box flexGrow={1}>
          {field === 'jobs' ? (
            active ? (
              <TextInput
                value={jobs}
                onChange={(v) => setJobs(v.replace(/[^0-9]/g, ''))}
                onSubmit={() => moveFocus(1)}
              />
            ) : (
              <Text color={active ? 'black' : undefined} backgroundColor={active ? 'blue' : undefined} bold={active}>
                {clampJobs(parseInt(jobs, 10))}
              </Text>
            )
          ) : (
            <Text color={active ? 'black' : undefined} backgroundColor={active ? 'blue' : undefined} bold={active}>
              {value}
            </Text>
          )}
          {active && field !== 'jobs' ? <Text dimColor>  [Enter 选择]</Text> : null}
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <StepHeader title={`同步设置 · 源：${source.name} (${describeEnv(source)})`} />

      <Box flexDirection="column" marginBottom={1}>
        {renderField(
          'target',
          '目标环境',
          target ? `${target.name} · ${describeEnv(target)}` : '（未选择）',
        )}
        {renderField(
          'databases',
          '同步数据库',
          `${selectedDbs.length}/${allDatabases.length} 个库`,
        )}
        {renderField('format', 'Dump 格式', FORMAT_LABEL[format])}
        {renderField('jobs', '并行线程数', String(clampJobs(parseInt(jobs, 10))))}
      </Box>

      {mappings.length > 0 && (
        <Box flexDirection="column" marginTop={1} flexGrow={1} overflow="hidden">
          <Text bold color="gray">库名映射与冲突处理</Text>
          <Box flexDirection="column" overflow="hidden">
            {mappings.map((m, i) => {
              const idx = mappingCursor - focusOrder.indexOf('mappings');
              const active = currentFocus === 'mappings' && i === idx;
              const displayTarget =
                m.conflict === 'rename' ? (m.renamedTo ?? m.targetDb) : m.targetDb;
              const conflictText =
                m.conflict === 'overwrite'
                  ? '覆盖'
                  : m.conflict === 'skip'
                    ? '跳过'
                    : `重命名→${displayTarget}`;

              if (renameIndex === i) {
                return (
                  <Box key={m.sourceDb}>
                    <Text bold color="yellow">› {m.sourceDb} → </Text>
                    <TextInput
                      value={renameText}
                      onChange={setRenameText}
                      onSubmit={() => {
                        setMappings((prev) => {
                          const next = [...prev];
                          next[i] = {
                            ...m,
                            conflict: 'rename',
                            renamedTo: renameText.trim() || m.targetDb,
                          };
                          return next;
                        });
                        setRenameIndex(null);
                      }}
                    />
                    <Text dimColor>  [Enter 确认 · Esc 取消]</Text>
                  </Box>
                );
              }

              return (
                <Box key={m.sourceDb}>
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
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      <Box marginTop={2} justifyContent="space-between">
        <Text
          color={currentFocus === 'start' ? 'black' : 'green'}
          backgroundColor={currentFocus === 'start' ? 'green' : undefined}
          bold={currentFocus === 'start'}
        >
          {currentFocus === 'start' ? '▸ ' : '  '}🚀 开始同步
        </Text>
        <Text dimColor>Tab/↑/↓ 切换 · Enter 编辑/开始 · Esc 取消</Text>
      </Box>

      {currentFocus === 'mappings' && renameIndex === null && (
        <Box marginTop={1}>
          <Text dimColor>↑/↓ 选择库 · [o] 覆盖 · [k] 跳过 · [r] 重命名</Text>
        </Box>
      )}
    </Box>
  );
}
