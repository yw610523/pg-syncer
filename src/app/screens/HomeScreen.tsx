import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { config } from '../../config/store.js';
import type { DbEnvironment } from '../../core/types.js';
import { describeEnv } from '../../core/connstring.js';
import { ContextMenu, type MenuItem } from '../components/ContextMenu.js';

export type HomeAction =
  | { type: 'create' }
  | { type: 'edit'; env: DbEnvironment }
  | { type: 'delete'; env: DbEnvironment }
  | { type: 'sync'; source: DbEnvironment }
  | { type: 'quit' };

interface HomeScreenProps {
  onAction: (action: HomeAction) => void;
}

/**
 * XShell 风格的环境管理主界面：
 * - 左侧：环境列表（显示环境名 + 连接摘要）
 * - 右侧：选中环境的详细信息
 * - 底部：操作提示
 * - 支持鼠标右键菜单（增删改查）
 */
export function HomeScreen({ onAction }: HomeScreenProps) {
  const [cursor, setCursor] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; env: DbEnvironment | null } | null>(null);
  const [warn, setWarn] = useState('');

  const environments = useMemo(() => {
    return [...config.snapshot.environments].sort((a, b) => {
      const ta = b.updatedAt ?? b.createdAt ?? '';
      const tb = a.updatedAt ?? a.createdAt ?? '';
      return ta.localeCompare(tb);
    });
  }, []);
  const safeCursor = Math.min(cursor, Math.max(0, environments.length - 1));
  const selected = environments[safeCursor] ?? null;
  const canSync = environments.length >= 2;

  // 键盘操作
  useInput((input, key) => {
    if (menu) {
      // 菜单打开时，键盘由 ContextMenu 处理
      return;
    }

    if (key.upArrow) {
      setWarn('');
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setWarn('');
      setCursor((c) => Math.min(environments.length - 1, c + 1));
    } else if (input === 'n' || input === 'N') {
      setWarn('');
      onAction({ type: 'create' });
    } else if ((input === 'e' || input === 'E') && selected) {
      setWarn('');
      onAction({ type: 'edit', env: selected });
    } else if ((input === 'x' || input === 'X') && selected) {
      setWarn('');
      onAction({ type: 'delete', env: selected });
    } else if (input === 's' || input === 'S') {
      // 同步：需要至少 2 个环境（源 + 目标）
      if (!canSync) {
        setWarn('至少需要 2 个环境才能同步，请先新建环境');
      } else if (selected) {
        setWarn('');
        onAction({ type: 'sync', source: selected });
      }
    } else if (key.return && selected) {
      // Enter：打开详情/编辑
      setWarn('');
      onAction({ type: 'edit', env: selected });
    } else if (input === 'q' || input === 'Q') {
      onAction({ type: 'quit' });
    }
  });

  const menuItems: MenuItem[] = menu?.env
    ? [
        { label: '编辑', shortcut: 'e', action: () => onAction({ type: 'edit', env: menu.env! }) },
        { label: '删除', shortcut: 'x', action: () => onAction({ type: 'delete', env: menu.env! }) },
        {
          label: '同步…',
          shortcut: 's',
          disabled: !canSync,
          action: () => {
            if (canSync && menu.env) onAction({ type: 'sync', source: menu.env });
          },
        },
      ]
    : [
        { label: '新建环境', shortcut: 'n', action: () => onAction({ type: 'create' }) },
      ];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="green">
          🗄 pg-syncer · 环境管理
        </Text>
        <Text dimColor>{environments.length} 个环境</Text>
      </Box>

      {warn ? (
        <Box marginBottom={1}>
          <Text color="yellow" bold>⚠ {warn}</Text>
        </Box>
      ) : null}

      <Box flexGrow={1}>
        {/* 左侧：环境列表 */}
        <Box flexDirection="column" width="50%" borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">环境列表</Text>
          {environments.length === 0 ? (
            <Text dimColor>暂无环境，按 [n] 新建</Text>
          ) : (
            environments.map((env, i) => {
              const active = i === safeCursor;
              return (
                <Box key={env.name}>
                  <Text
                    color={active ? 'black' : undefined}
                    backgroundColor={active ? 'blue' : undefined}
                    bold={active}
                  >
                    {active ? '› ' : '  '}
                    {env.name}  ·  {describeEnv(env)}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>

        {/* 右侧：环境详情 */}
        <Box flexDirection="column" width="50%" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold color="gray">环境详情</Text>
          {selected ? (
            <>
              <Box>
                <Box width={12}><Text dimColor>环境名</Text></Box>
                <Text>{selected.name}</Text>
              </Box>
              <Box>
                <Box width={12}><Text dimColor>主机</Text></Box>
                <Text>{selected.host}:{selected.port}</Text>
              </Box>
              <Box>
                <Box width={12}><Text dimColor>用户</Text></Box>
                <Text>{selected.user}</Text>
              </Box>
              <Box>
                <Box width={12}><Text dimColor>数据库</Text></Box>
                <Text>{selected.database || 'postgres（默认）'}</Text>
              </Box>
              <Box>
                <Box width={12}><Text dimColor>SSL</Text></Box>
                <Text>{selected.sslMode}</Text>
              </Box>
              {selected.sslRootCert ? (
                <Box>
                  <Box width={12}><Text dimColor>CA 证书</Text></Box>
                  <Text wrap="truncate-end">{selected.sslRootCert}</Text>
                </Box>
              ) : null}
              {selected.sslCert ? (
                <Box>
                  <Box width={12}><Text dimColor>客户端证书</Text></Box>
                  <Text wrap="truncate-end">{selected.sslCert}</Text>
                </Box>
              ) : null}
              {selected.sslKey ? (
                <Box>
                  <Box width={12}><Text dimColor>客户端私钥</Text></Box>
                  <Text wrap="truncate-end">{selected.sslKey}</Text>
                </Box>
              ) : null}
              <Box marginTop={1}>
                <Text dimColor>密码：{selected.password ? '●●●●●●' : '（未设置）'}</Text>
              </Box>
            </>
          ) : (
            <Text dimColor>选择一个环境查看详情</Text>
          )}
        </Box>
      </Box>

      {/* 底部操作提示 */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>
          ↑/↓ 选择 · [n] 新建 · [e] 编辑 · [x] 删除 · [s] 同步
          {!canSync ? '（需至少 2 个环境）' : ''} · [Enter] 详情 · [q] 退出
        </Text>
        <Text dimColor>💡 使用键盘快捷键管理环境</Text>
      </Box>

      {/* 右键菜单 */}
      {menu ? (
        <ContextMenu items={menuItems} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />
      ) : null}
    </Box>
  );
}
