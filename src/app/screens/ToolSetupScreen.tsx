import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { detectInDir, probeVersions } from '../../core/toolkit.js';
import type { ToolPaths } from '../../core/types.js';
import { FilePicker } from '../components/FilePicker.js';

type Phase = 'intro' | 'pick' | 'verify';

const TOOL_KEYS: (keyof ToolPaths)[] = ['pgDump', 'pgRestore', 'psql'];

interface ToolSetupScreenProps {
  onComplete: (tools: ToolPaths) => void;
}

/**
 * 工具引导屏幕：
 * 当 PATH 中检测不到 pg_dump / pg_restore 时出现，
 * 引导用户用目录选择器定位 PostgreSQL 的安装目录（PG_HOME）或 bin 目录，
 * 而非手打路径。工具会自动在所选目录及其 bin/ 子目录中探测可执行文件。
 */
export function ToolSetupScreen({ onComplete }: ToolSetupScreenProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [dir, setDir] = useState('');
  const [found, setFound] = useState<ToolPaths | null>(null);
  const [versions, setVersions] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);

  useInput((input, key) => {
    if (phase === 'intro' && key.return) {
      setPhase('pick');
    } else if (phase === 'intro' && (input === 'q' || input === 'Q')) {
      process.exit(0);
    } else if (phase === 'verify' && key.return && found?.pgDump && found?.pgRestore) {
      onComplete(found);
    } else if (phase === 'verify' && input === 'e') {
      setMessage('');
      setPhase('pick');
    } else if (phase === 'verify' && (input === 'q' || input === 'Q')) {
      process.exit(0);
    }
  });

  const handleDir = (full: string): void => {
    const t = detectInDir(full);
    if (t.pgDump && t.pgRestore) {
      setDir(full);
      setFound(t);
      setChecking(true);
      void probeVersions(t).then((v) => {
        setVersions(v);
        setChecking(false);
        setPhase('verify');
      });
    } else {
      setMessage('该目录下未找到 pg_dump / pg_restore，请选择 PostgreSQL 的 bin 目录');
    }
  };

  if (phase === 'pick') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="yellow">
          请在下方的目录树中定位到 PostgreSQL 的 bin 目录
        </Text>
        {message ? <Text color="red">{message}</Text> : null}
        <FilePicker
          onlyDirectories
          title="选择 PostgreSQL 安装目录（PG_HOME）"
          startDir={
            process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\PostgreSQL` : undefined
          }
          onSelect={handleDir}
          onCancel={() => setPhase('intro')}
        />
      </Box>
    );
  }

  if (phase === 'verify') {
    return (
      <Box flexDirection="column">
        <Text bold color="green">
          ✓ 已找到 PostgreSQL 工具（{dir}）
        </Text>
        {TOOL_KEYS.map((k) => (
          <Box key={k}>
            <Box width={14}>
              <Text dimColor>{k}</Text>
            </Box>
            <Text color={found?.[k] ? 'green' : 'gray'}>
              {checking
                ? '探测版本中…'
                : found?.[k]
                  ? (versions[k] ?? found[k])
                  : '未找到（可选）'}
            </Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>[Enter] 确认继续 · [e] 重新选择 · [q] 退出</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        ⚠ 未检测到 pg_dump / pg_restore
      </Text>
      <Text dimColor>
        本工具依赖 PostgreSQL 自带的命令行工具。请选择 PostgreSQL 的安装目录（PG_HOME）或 bin 目录，工具会自动在所选目录及 bin/ 子目录中探测 pg_dump / pg_restore。
      </Text>
      <Box marginTop={1}>
        <Text dimColor>[Enter] 开始选择目录 · [q] 退出</Text>
      </Box>
    </Box>
  );
}
