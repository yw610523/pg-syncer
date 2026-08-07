import React from 'react';
import { Box } from 'ink';
import { Spinner } from '../components/Spinner.js';

/** 启动阶段：检测 pg_dump / pg_restore */
export function BootScreen() {
  return (
    <Box>
      <Spinner label="正在检测 pg_dump / pg_restore…" />
    </Box>
  );
}
