import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { RunResult } from '../../core/types.js';
import { formatElapsed } from '../../utils/format.js';

interface ResultScreenProps {
  result: RunResult;
  onExit: () => void;
}

/** 任务结束面板：展示每个库的成功/失败状态 */
export function ResultScreen({ result, onExit }: ResultScreenProps) {
  useInput((input, key) => {
    if (key.return || input === 'q' || input === 'Q') onExit();
  });

  const failed = result.results.filter((r) => !r.ok);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color={result.ok ? 'green' : 'red'}>
        {result.ok ? '✓ 同步完成' : '✗ 同步失败'}
      </Text>
      <Text dimColor>
        总耗时 {formatElapsed(result.elapsedMs)} · 成功 {result.results.length - failed.length} / 失败 {failed.length} / 共 {result.results.length}
      </Text>
      {!result.ok && result.error ? <Text color="red">原因：{result.error}</Text> : null}

      <Box flexDirection="column" marginTop={1}>
        {result.results.map((r) => (
          <Box key={r.sourceDb}>
            <Text color={r.ok ? 'green' : 'red'}>{r.ok ? '✓' : '✗'}</Text>
            <Box width={1} />
            <Text>
              {r.sourceDb} → {r.targetDb}
              {r.error ? <Text color="red"> · {r.error}</Text> : null}
            </Text>
          </Box>
        ))}
      </Box>

      {failed.length > 0 ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="red"
          marginTop={1}
          paddingX={1}
          overflow="hidden"
        >
          <Text bold color="red">
            失败日志
          </Text>
          {failed
            .flatMap((r) => [...r.restoreLines.slice(-6), ...r.dumpLines.slice(-2)])
            .slice(-16)
            .map((l, i) => (
              <Text key={i} dimColor wrap="truncate-end">
                {l || ' '}
              </Text>
            ))}
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>按 [Enter] 或 [q] 退出</Text>
      </Box>
    </Box>
  );
}
