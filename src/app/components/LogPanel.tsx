import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface LogPanelProps {
  title: string;
  lines: string[];
  /** 日志可视区行数（不含边框） */
  height: number;
  color?: string;
}

/**
 * 带边框的实时日志面板：
 * - 默认自动滚动到底部
 * - ↑/↓ 回卷历史日志（回卷后新日志不会打断阅读）
 */
export function LogPanel({ title, lines, height, color = 'cyan' }: LogPanelProps) {
  const [scroll, setScroll] = useState(0);
  const maxScroll = Math.max(0, lines.length - height);
  const effScroll = Math.min(scroll, maxScroll);

  useInput((_input, key) => {
    if (key.upArrow) setScroll((s) => Math.min(maxScroll, s + 1));
    else if (key.downArrow) setScroll((s) => Math.max(0, s - 1));
  });

  const visible = useMemo(() => {
    const end = lines.length - effScroll;
    const start = Math.max(0, end - height);
    return lines.slice(start, end);
  }, [lines, effScroll, height]);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      minWidth={0}
      borderStyle="round"
      borderColor={color}
      height={height + 2}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={color}>
          {title}
        </Text>
        <Text dimColor>
          {lines.length} 行{effScroll > 0 ? ` · ↑${effScroll}` : ''}
        </Text>
      </Box>
      <Box flexDirection="column" overflow="hidden" flexGrow={1} minWidth={0}>
        {visible.length === 0 ? (
          <Text dimColor>（等待输出…）</Text>
        ) : (
          visible.map((l, i) => (
            <Text key={i} dimColor wrap="truncate-end">
              {l || ' '}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}
