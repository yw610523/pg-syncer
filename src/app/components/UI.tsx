import React from 'react';
import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

/** 步骤标题 */
export function StepHeader({ title }: { title: string }) {
  return (
    <Box marginBottom={1}>
      <Text bold color="cyan">
        ▶ {title}
      </Text>
    </Box>
  );
}

/** 底部键盘提示 */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{children}</Text>
    </Box>
  );
}
