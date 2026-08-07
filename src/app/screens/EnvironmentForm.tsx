import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import os from 'node:os';
import type { DbEnvironment } from '../../core/types.js';
import { FilePicker, type DirEntry } from '../components/FilePicker.js';
import { Hint, StepHeader } from '../components/UI.js';

type Field =
  | 'name'
  | 'host'
  | 'port'
  | 'user'
  | 'password'
  | 'database'
  | 'ssl'
  | 'rootCert'
  | 'clientCert'
  | 'clientKey';

const SSL_MODES = [
  { label: 'disable      · 不加密', value: 'disable' },
  { label: 'allow        · 允许（按需）', value: 'allow' },
  { label: 'prefer       · 优先加密', value: 'prefer' },
  { label: 'require      · 必须加密', value: 'require' },
  { label: 'verify-ca    · 校验 CA 证书', value: 'verify-ca' },
  { label: 'verify-full  · 校验 CA + 主机名', value: 'verify-full' },
] as const;

const CERT_FILTER = (e: DirEntry) => /\.(crt|cer|pem)$/i.test(e.name);
const KEY_FILTER = (e: DirEntry) => /\.(key|pem)$/i.test(e.name);

const FIELD_DEFS: Array<{ key: Field; label: string; visible: (e: DbEnvironment) => boolean }> = [
  { key: 'name', label: '环境名', visible: () => true },
  { key: 'host', label: '主机 / IP', visible: () => true },
  { key: 'port', label: '端口', visible: () => true },
  { key: 'user', label: '用户名', visible: () => true },
  { key: 'password', label: '密码', visible: () => true },
  { key: 'database', label: '数据库名', visible: () => true },
  { key: 'ssl', label: 'SSL 模式', visible: () => true },
  {
    key: 'rootCert',
    label: 'CA 根证书',
    visible: (e) => e.sslMode !== 'disable',
  },
  {
    key: 'clientCert',
    label: '客户端证书',
    visible: (e) => e.sslMode !== 'disable',
  },
  {
    key: 'clientKey',
    label: '客户端私钥',
    visible: (e) => e.sslMode !== 'disable',
  },
];

function getFieldValue(e: DbEnvironment, f: Field): string {
  switch (f) {
    case 'name':
      return e.name;
    case 'host':
      return e.host;
    case 'port':
      return String(e.port);
    case 'user':
      return e.user;
    case 'password':
      return e.password ?? '';
    case 'database':
      return e.database;
    case 'ssl':
      return e.sslMode;
    case 'rootCert':
      return e.sslRootCert ?? '';
    case 'clientCert':
      return e.sslCert ?? '';
    case 'clientKey':
      return e.sslKey ?? '';
  }
}

function setFieldValue(e: DbEnvironment, f: Field, v: string): DbEnvironment {
  switch (f) {
    case 'name':
      return { ...e, name: v };
    case 'host':
      return { ...e, host: v };
    case 'port':
      return { ...e, port: parseInt(v, 10) || 5432 };
    case 'user':
      return { ...e, user: v };
    case 'password':
      return { ...e, password: v || undefined };
    case 'database':
      return { ...e, database: v };
    case 'ssl':
      return { ...e, sslMode: v };
    case 'rootCert':
      return { ...e, sslRootCert: v || undefined };
    case 'clientCert':
      return { ...e, sslCert: v || undefined };
    case 'clientKey':
      return { ...e, sslKey: v || undefined };
  }
}

export interface EnvironmentFormProps {
  initial: DbEnvironment;
  /** 保存时不允许重复的环境名（不含自身） */
  takenNames: string[];
  onSave: (env: DbEnvironment) => void;
  onCancel: () => void;
}

/**
 * 网页表单风格的环境编辑器：
 * - 所有字段内联显示，Tab/Shift+Tab 切换焦点
 * - 文本字段直接编辑，SSL 用下拉选择器，证书用文件选择器（弹出）
 * - 底部有保存按钮，Enter 提交
 */
export function EnvironmentForm({ initial, takenNames, onSave, onCancel }: EnvironmentFormProps) {
  const [env, setEnv] = useState<DbEnvironment>(initial);
  const [focusIndex, setFocusIndex] = useState(0);
  const [error, setError] = useState('');
  const [sslOpen, setSslOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState<Field | null>(null);

  const visibleFields = FIELD_DEFS.filter((d) => d.visible(env));
  const safeIndex = Math.min(focusIndex, visibleFields.length); // 最后一项是保存按钮

  const currentField = focusIndex < visibleFields.length ? visibleFields[focusIndex] : null;
  const isSaveButton = focusIndex === visibleFields.length;

  // Tab / Shift+Tab / ↑/↓ 切换焦点
  useInput((input, key) => {
    if (sslOpen || filePickerOpen) return; // 子组件独占输入

    if (key.tab) {
      setError('');
      if (key.shift) {
        // Shift+Tab: 向上
        setFocusIndex((i) => (i <= 0 ? visibleFields.length : i - 1));
      } else {
        // Tab: 向下
        setFocusIndex((i) => (i >= visibleFields.length ? 0 : i + 1));
      }
    } else if (key.upArrow) {
      setError('');
      setFocusIndex((i) => (i <= 0 ? visibleFields.length : i - 1));
    } else if (key.downArrow) {
      setError('');
      setFocusIndex((i) => (i >= visibleFields.length ? 0 : i + 1));
    } else if (key.return) {
      setError('');
      if (isSaveButton) {
        save();
      } else if (currentField) {
        // SSL 字段打开下拉选择器
        if (currentField.key === 'ssl') {
          setSslOpen(true);
        }
        // 证书字段打开文件选择器
        else if (currentField.key === 'rootCert' || currentField.key === 'clientCert' || currentField.key === 'clientKey') {
          setFilePickerOpen(currentField.key);
        }
      }
    } else if (key.escape) {
      onCancel();
    }
  });

  const save = (): void => {
    const name = env.name.trim();
    const host = env.host.trim();
    if (!name) {
      setError('环境名不能为空，例如 sit1 / prod');
      setFocusIndex(0);
      return;
    }
    if (takenNames.includes(name)) {
      setError(`环境名 "${name}" 已存在，请换一个`);
      setFocusIndex(0);
      return;
    }
    if (!host) {
      setError('主机 / IP 不能为空');
      setFocusIndex(FIELD_DEFS.findIndex((d) => d.key === 'host'));
      return;
    }
    if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
      setError('端口必须是 1~65535 的整数');
      setFocusIndex(FIELD_DEFS.findIndex((d) => d.key === 'port'));
      return;
    }
    if (!env.user.trim()) {
      setError('用户名不能为空');
      setFocusIndex(FIELD_DEFS.findIndex((d) => d.key === 'user'));
      return;
    }
    if (!env.database.trim()) {
      setError('数据库名不能为空');
      setFocusIndex(FIELD_DEFS.findIndex((d) => d.key === 'database'));
      return;
    }
    onSave({
      ...env,
      name,
      host,
      user: env.user.trim(),
      database: env.database.trim(),
    });
  };

  const isNew = initial.name === '';

  // ---- SSL 下拉选择器 ----
  if (sslOpen) {
    return (
      <Box flexDirection="column">
        <StepHeader title="SSL 模式" />
        <SelectInput
          items={SSL_MODES.map((m) => ({ label: m.label, value: m.value }))}
          onSelect={(item) => {
            setEnv((e) => ({ ...e, sslMode: String(item.value) }));
            setSslOpen(false);
          }}
        />
        <Hint>Enter 选择 · Esc 取消</Hint>
      </Box>
    );
  }

  // ---- 文件选择器 ----
  if (filePickerOpen) {
    const field = filePickerOpen;
    const label = FIELD_DEFS.find((d) => d.key === field)?.label ?? field;
    return (
      <Box flexDirection="column" flexGrow={1}>
        <StepHeader title={`${label}（可选）`} />
        <FilePicker
          onlyFiles
          filter={field === 'clientKey' ? KEY_FILTER : CERT_FILTER}
          title={label}
          startDir={os.homedir()}
          onSelect={(full) => {
            setEnv((e) => setFieldValue(e, field, full));
            setFilePickerOpen(null);
          }}
          onCancel={() => setFilePickerOpen(null)}
        />
        <Hint>仅展示证书/密钥文件 · Esc 取消</Hint>
      </Box>
    );
  }

  // ---- 表单主体 ----
  return (
    <Box flexDirection="column" flexGrow={1}>
      <StepHeader title={isNew ? '新建环境' : `编辑环境 · ${initial.name}`} />

      {visibleFields.map((d, i) => {
        const focused = i === focusIndex;
        const value = getFieldValue(env, d.key);
        const isTextField = !['ssl', 'rootCert', 'clientCert', 'clientKey'].includes(d.key);
        const isSsl = d.key === 'ssl';
        const isFile = ['rootCert', 'clientCert', 'clientKey'].includes(d.key);

        return (
          <Box key={d.key} marginTop={i === 0 ? 0 : 1}>
            <Box width={16}>
              <Text color={focused ? 'cyan' : undefined} bold={focused}>
                {focused ? '▸ ' : '  '}
                {d.label}
              </Text>
            </Box>
            <Box flexGrow={1}>
              {isTextField ? (
                focused ? (
                  <TextInput
                    value={value}
                    mask={d.key === 'password' ? '*' : undefined}
                    onChange={(v) => setEnv((e) => setFieldValue(e, d.key, v))}
                    onSubmit={() => {
                      // Enter 在文本字段：跳到下一个字段
                      setFocusIndex((idx) => Math.min(visibleFields.length, idx + 1));
                    }}
                  />
                ) : (
                  <Text>
                    {d.key === 'password' && value ? '●'.repeat(6) : value || '（未设置）'}
                  </Text>
                )
              ) : isSsl ? (
                <Box>
                  <Text
                    color={focused ? 'black' : undefined}
                    backgroundColor={focused ? 'blue' : undefined}
                    bold={focused}
                  >
                    {value || 'prefer'}
                  </Text>
                  {focused ? <Text dimColor>  [Enter 选择]</Text> : null}
                </Box>
              ) : isFile ? (
                <Box>
                  <Text
                    color={focused ? 'black' : undefined}
                    backgroundColor={focused ? 'blue' : undefined}
                    bold={focused}
                    wrap="truncate-end"
                  >
                    {value || '（未设置）'}
                  </Text>
                  {focused ? <Text dimColor>  [Enter 选择文件]</Text> : null}
                </Box>
              ) : null}
            </Box>
          </Box>
        );
      })}

      {/* 保存按钮 */}
      <Box marginTop={2} justifyContent="center">
        <Text
          color={isSaveButton ? 'black' : 'green'}
          backgroundColor={isSaveButton ? 'green' : undefined}
          bold={isSaveButton}
        >
          {isSaveButton ? '▸ ' : '  '}💾 保存环境
        </Text>
      </Box>

      {error ? (
        <Box marginTop={1}>
          <Text color="yellow">⚠ {error}</Text>
        </Box>
      ) : null}

      <Hint>
        Tab/↑/↓ 切换字段 · Enter 提交（文本字段跳下一个，证书字段选文件）· Esc 取消
      </Hint>
    </Box>
  );
}
