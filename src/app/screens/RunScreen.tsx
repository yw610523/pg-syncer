import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import { Pipeline } from '../../core/pipeline.js';
import type { DbMapping, DbSyncResult, RunOptions, RunResult } from '../../core/types.js';
import { FORMAT_LABEL, formatElapsed } from '../../utils/format.js';
import { LogPanel } from '../components/LogPanel.js';
import { Spinner } from '../components/Spinner.js';

interface RunScreenProps {
  params: RunOptions;
  onDone: (result: RunResult) => void;
}

/**
 * 阶段 2：实时执行与分栏日志面板（多库循环）。
 * 对每个数据库执行 dump → restore，展示当前库进度与累计日志。
 */
export function RunScreen({ params, onDone }: RunScreenProps) {
  const { rows } = useWindowSize();
  const [currentDb, setCurrentDb] = useState<DbMapping | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [results, setResults] = useState<DbSyncResult[]>([]);
  const [dumpLines, setDumpLines] = useState<string[]>([]);
  const [restoreLines, setRestoreLines] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const pipelineRef = useRef<Pipeline | null>(null);
  const panelHeight = Math.max(5, Math.floor((rows - 6) / 2));

  useEffect(() => {
    if (pipelineRef.current) return;
    const pipeline = new Pipeline(params);
    pipelineRef.current = pipeline;

    pipeline.on('db-start', (mapping: DbMapping) => {
      setCurrentDb(mapping);
    });
    pipeline.on('db-done', (r: DbSyncResult) => {
      setDoneCount((c) => c + 1);
      setResults((prev) => [...prev, r]);
    });
    pipeline.on('line', (_mapping: DbMapping, kind: 'dump' | 'restore', text: string) => {
      if (kind === 'dump') setDumpLines((prev) => [...prev, text]);
      else setRestoreLines((prev) => [...prev, text]);
    });
    pipeline.on('all-done', () => {
      // run() Promise 才是真正的结果，all-done 只是通知
    });

    void pipeline.run().then((r) => {
      setTimeout(() => onDone(r), 600);
    });
  }, [params, onDone]);

  // 计时器
  useEffect(() => {
    const timer = setInterval(() => {
      const p = pipelineRef.current;
      if (p) setElapsed(Date.now() - p.startedAt);
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const failedCount = results.filter((r) => !r.ok).length;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold color="green">
            🚀 同步执行中
          </Text>
          <Box width={2} />
          <Text color={currentDb ? 'cyan' : 'gray'}>
            {currentDb
              ? `正在同步 ${currentDb.sourceDb} → ${currentDb.targetDb}`
              : '准备中'}
          </Text>
        </Box>
        <Box>
          <Text dimColor>
            进度 {doneCount}/{params.databases.length} · 失败 {failedCount} · 耗时 {formatElapsed(elapsed)} · 格式 {FORMAT_LABEL[params.format]} · -j {params.jobs}
          </Text>
        </Box>
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        <LogPanel title="pg_dump" lines={dumpLines} height={panelHeight} color="cyan" />
        <Box width={1} />
        <LogPanel
          title={params.format === 'plain' ? 'psql' : 'pg_restore'}
          lines={restoreLines}
          height={panelHeight}
          color="magenta"
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑/↓ 回卷日志 · Ctrl+C 中断任务</Text>
      </Box>
    </Box>
  );
}
