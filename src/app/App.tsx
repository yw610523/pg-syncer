import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import { config } from '../config/store.js';
import { coreToolsReady, detectAll } from '../core/toolkit.js';
import { emptyEnvironment } from '../core/connstring.js';
import type { DbEnvironment, RunOptions, RunResult, SyncParams, ToolPaths } from '../core/types.js';
import { BootScreen } from './screens/BootScreen.js';
import { ToolSetupScreen } from './screens/ToolSetupScreen.js';
import { HomeScreen, type HomeAction } from './screens/HomeScreen.js';
import { EnvironmentForm } from './screens/EnvironmentForm.js';
import { SyncSetupScreen } from './screens/SyncSetupScreen.js';
import { RunScreen } from './screens/RunScreen.js';
import { ResultScreen } from './screens/ResultScreen.js';

type ScreenName =
  | 'boot'
  | 'tool-setup'
  | 'home'
  | 'env-form'
  | 'confirm-delete'
  | 'sync-setup' // 同步设置向导（查库 → 选库 → 选目标 → 确认）
  | 'run'
  | 'result';

/** 应用根组件：负责屏幕状态机与全局流程 */
export function App() {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [screen, setScreen] = useState<ScreenName>('boot');
  const [tools, setTools] = useState<ToolPaths | null>(null);
  const [params, setParams] = useState<SyncParams | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  // 环境表单状态
  const [formInitial, setFormInitial] = useState<DbEnvironment>(emptyEnvironment());
  const [deletePending, setDeletePending] = useState<DbEnvironment | null>(null);
  // 已选源环境（同步流程中间态）
  const [syncSource, setSyncSource] = useState<DbEnvironment | null>(null);

  // 启动自检：探测 pg_dump / pg_restore
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const t = await detectAll();
      if (cancelled) return;
      setTools(t);
      setScreen(coreToolsReady(t) ? 'home' : 'tool-setup');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 删除确认页键盘
  useInput((input, key) => {
    if (screen !== 'confirm-delete' || !deletePending) return;
    if (input === 'y' || input === 'Y') {
      config.deleteEnvironment(deletePending.name);
      setDeletePending(null);
      setScreen('home');
    } else if (input === 'n' || input === 'N' || key.escape) {
      setDeletePending(null);
      setScreen('home');
    }
  });

  const handleToolsReady = useCallback((t: ToolPaths): void => {
    setTools(t);
    config.setTools(t);
    setScreen('home');
  }, []);

  const handleHomeAction = useCallback((action: HomeAction): void => {
    switch (action.type) {
      case 'create':
        setFormInitial(emptyEnvironment());
        setScreen('env-form');
        break;
      case 'edit':
        setFormInitial(action.env);
        setScreen('env-form');
        break;
      case 'delete':
        setDeletePending(action.env);
        setScreen('confirm-delete');
        break;
      case 'sync':
        setSyncSource(action.source);
        setScreen('sync-setup');
        break;
      case 'quit':
        exit();
        break;
    }
  }, [exit]);

  const handleEnvSave = useCallback((env: DbEnvironment): void => {
    config.upsertEnvironment(env);
    setScreen('home');
  }, []);

  const handleSyncDone = useCallback((p: SyncParams): void => {
    setParams(p);
    setScreen('run');
  }, []);

  const handleRunDone = useCallback((r: RunResult): void => {
    setResult(r);
    setScreen('result');
  }, []);

  const handleResultExit = useCallback((): void => {
    setResult(null);
    setParams(null);
    setScreen('home');
  }, []);

  let body: React.ReactNode = null;
  switch (screen) {
    case 'boot':
      body = <BootScreen />;
      break;
    case 'tool-setup':
      body = <ToolSetupScreen onComplete={handleToolsReady} />;
      break;
    case 'home':
      body = <HomeScreen onAction={handleHomeAction} />;
      break;
    case 'env-form':
      body = (
        <EnvironmentForm
          initial={formInitial}
          takenNames={config.snapshot.environments.map((e) => e.name).filter((n) => n !== formInitial.name)}
          onSave={handleEnvSave}
          onCancel={() => setScreen('home')}
        />
      );
      break;
    case 'confirm-delete':
      body = deletePending ? (
        <Box flexDirection="column">
          <Text color="yellow">
            确认删除环境「{deletePending.name}」？此操作会移除该连接配置。
          </Text>
          <Box marginTop={1}>
            <Text dimColor>[y] 删除 · [n] 取消</Text>
          </Box>
        </Box>
      ) : null;
      break;
    case 'sync-setup':
      if (syncSource && tools) {
        body = (
          <SyncSetupScreen
            source={syncSource}
            tools={tools as { pgDump: string; pgRestore: string; psql: string }}
            onDone={handleSyncDone}
            onCancel={() => setScreen('home')}
          />
        );
      }
      break;
    case 'run':
      if (params && tools) {
        const runOptions: RunOptions = { ...params, tools };
        body = <RunScreen params={runOptions} onDone={handleRunDone} />;
      }
      break;
    case 'result':
      body = result ? <ResultScreen result={result} onExit={handleResultExit} /> : null;
      break;
    default:
      break;
  }

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box justifyContent="space-between" marginBottom={1} paddingX={1}>
        <Text bold color="green">
          🐘 pg-syncer
        </Text>
        <Text dimColor>PostgreSQL 跨环境同步 · pg_dump / pg_restore</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {body}
      </Box>
    </Box>
  );
}
