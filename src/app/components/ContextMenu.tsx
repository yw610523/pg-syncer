import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

export interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
}

export interface ContextMenuProps {
  items: MenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * 右键弹出菜单：显示在 (x, y) 位置，↑/↓ 选择，Enter 执行，Esc/点击外部关闭。
 */
export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const [cursor, setCursor] = React.useState(0);
  const enabledItems = items.filter((i) => !i.disabled);

  useEffect(() => {
    setCursor(0);
  }, [items]);

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => (c <= 0 ? enabledItems.length - 1 : c - 1));
    } else if (key.downArrow) {
      setCursor((c) => (c >= enabledItems.length - 1 ? 0 : c + 1));
    } else if (key.return && enabledItems[cursor]) {
      enabledItems[cursor].action();
      onClose();
    } else if (key.escape) {
      onClose();
    }
  });

  // 计算菜单宽度
  const maxLabelWidth = Math.max(...items.map((i) => i.label.length));
  const maxShortcutWidth = Math.max(...items.map((i) => i.shortcut?.length ?? 0));
  const width = maxLabelWidth + maxShortcutWidth + 6; // padding

  return (
    <Box
      position="absolute"
      left={x - 1}
      top={y - 1}
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      backgroundColor="black"
      width={width}
      paddingX={1}
    >
      {items.map((item, i) => {
        const active = !item.disabled && enabledItems.indexOf(item) === cursor;
        return (
          <Box key={i} justifyContent="space-between">
            <Text
              color={item.disabled ? 'gray' : active ? 'black' : undefined}
              backgroundColor={active ? 'blue' : undefined}
              bold={active}
            >
              {active ? '› ' : '  '}
              {item.label}
            </Text>
            {item.shortcut ? (
              <Text dimColor={!active} color={active ? 'black' : undefined} backgroundColor={active ? 'blue' : undefined}>
                {item.shortcut}
              </Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
