import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface DatabasePickerProps {
  databases: string[];
  /** 默认选中的库名 */
  defaultSelected?: string[];
  onDone: (selected: string[]) => void;
  onCancel: () => void;
}

/**
 * 批量数据库选择器：
 * - ↑/↓ 移动，Space 切换勾选，a 全选/全不选
 * - 默认全选（或 defaultSelected 指定）
 */
export function DatabasePicker({ databases, defaultSelected, onDone, onCancel }: DatabasePickerProps) {
  const initial = new Set(defaultSelected ?? databases);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(initial);

  const safeCursor = Math.min(cursor, Math.max(0, databases.length - 1));

  useInput((input, key) => {
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow) setCursor((c) => Math.min(databases.length - 1, c + 1));
    else if (input === ' ' || key.return) {
      const db = databases[safeCursor];
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(db)) next.delete(db);
        else next.add(db);
        return next;
      });
    } else if (input === 'a' || input === 'A') {
      setSelected((prev) => (prev.size === databases.length ? new Set() : new Set(databases)));
    } else if (key.escape) {
      onCancel();
    } else if (input === 's' || input === 'S') {
      onDone(Array.from(selected).sort());
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          选择要同步的数据库（{selected.size}/{databases.length}）
        </Text>
      </Box>
      {databases.length === 0 ? (
        <Text dimColor>未查询到数据库</Text>
      ) : (
        databases.map((db, i) => {
          const active = i === safeCursor;
          const checked = selected.has(db);
          return (
            <Box key={db}>
              <Text
                color={active ? 'black' : undefined}
                backgroundColor={active ? 'blue' : undefined}
                bold={active}
              >
                {active ? '› ' : '  '}
                {checked ? '✓' : ' '} {db}
              </Text>
            </Box>
          );
        })
      )}
      <Box marginTop={1}>
        <Text dimColor>
          ↑/↓ 移动 · [Space]/[Enter] 勾选 · [a] 全选/全不选 · [s] 确认 · [Esc] 取消
        </Text>
      </Box>
    </Box>
  );
}
