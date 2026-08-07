# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

pg-syncer 是一个基于 PostgreSQL 自带 `pg_dump` / `pg_restore` 实现的跨环境多库批量同步 TUI 工具。使用 Node.js ESM + TypeScript + React + Ink 7 构建全屏终端界面。

## 常用命令

所有命令都在项目根目录执行。

```bash
# 安装依赖
npm install

# 开发模式（免构建，tsx 直接运行）
npm run dev

# 类型检查（不输出文件）
npm run typecheck

# 构建（tsc 编译到 dist/）
npm run build

# 运行已构建产物
npm start

# 全局安装到本机（方便用 pg-syncer 命令）
npm link
pg-syncer

# 解除全局链接
npm unlink pg-syncer
```

> 当前项目**没有配置测试框架**（无 jest/vitest/playwright）和**没有配置 linter/formatter**（无 eslint/prettier/biome）。如需添加，先在 `package.json` / `tsconfig.json` 同级引入对应配置文件。

## 运行要求

- Node.js ≥ 20
- 已安装 PostgreSQL 客户端工具：`pg_dump`、`pg_restore`；使用 Plain SQL (`-Fp`) 格式时还需要 `psql`
- 必须在真实交互式终端中运行（TTY），管道 / CI / 脚本调用会主动退出

## 代码结构

```
src/
├── index.tsx              # 入口：TTY 检查 + 全屏渲染 App
├── app/
│   ├── App.tsx            # 全局屏幕状态机（boot → tool-setup → home → sync-setup → run → result）
│   ├── components/        # 可复用 UI 组件（LogPanel、FilePicker、DatabasePicker、Spinner、UI 等）
│   ├── screens/           # 各全屏页面（HomeScreen、SyncSetupScreen、RunScreen、ResultScreen 等）
│   └── hooks/             # React hooks（目前仅 useMouse，已禁用）
├── core/                  # 与 UI 无关的核心逻辑
│   ├── types.ts           # 共享类型（DbEnvironment、SyncParams、RunResult、ToolPaths 等）
│   ├── toolkit.ts         # 探测 pg_dump / pg_restore / psql（PATH + 常见安装目录）
│   ├── dbinfo.ts          # 用 psql 查询数据库列表、检查/创建/删除库
│   ├── pipeline.ts        # 多库同步管线：spawn 子进程、双栏日志流、SSL 环境变量传递
│   ├── connstring.ts      # 连接串生成与掩码
│   └── linestream.ts      # 子进程输出按行切分
├── config/
│   ├── types.ts           # ConfigData 结构
│   └── store.ts           # ~/.pg-syncer/config.json 原子读写单例
└── utils/
    └── format.ts          # 耗时格式化与 Dump 格式标签
```

## 关键架构

### 屏幕状态机

`src/app/App.tsx` 持有 `ScreenName` 状态，所有页面切换都通过 `setScreen` 完成：

1. `boot` — 启动屏，同时后台 `detectAll()` 探测工具
2. `tool-setup` — 未找到 `pg_dump` / `pg_restore` 时引导用户选择 PG_HOME 或 bin 目录
3. `home` — XShell 风格环境管理主界面
4. `env-form` — 新建/编辑环境表单
5. `confirm-delete` — 删除环境确认
6. `sync-setup` — 同步向导：查库 → 选库 → 选目标 → 选格式 → 设并行数 → 确认
7. `run` — 执行同步与双栏日志
8. `result` — 结果汇总

### 同步执行管线

`src/core/pipeline.ts` 的 `Pipeline` 类是执行核心：

- 对每个 `DbMapping` 串行执行：检查/处理冲突 → 创建目标库 → `pg_dump` → `pg_restore`/`psql`
- 默认 dump 到 `os.tmpdir()` 的临时目录/文件，成功或失败后都会 `fs.rmSync` 清理
- 通过 `EventEmitter` 向 `RunScreen` 发送 `db-start` / `db-done` / `line` / `all-done` 事件
- 默认 restore 携带 `--no-owner --no-privileges`（跨环境同步避免 owner/权限错误）
- 密码通过 `PGPASSWORD` 环境变量透传给子进程，不写入连接串

### 配置持久化

`src/config/store.ts` 提供全局单例 `config`：

- 文件位置：`~/.pg-syncer/config.json`
- 原子写入：先写 `.tmp` 再 `renameSync`
- 默认预置 `localhost` 环境（postgres/postgres/5432/SSL disable）
- 保存内容：工具路径、命名环境列表、最近一次同步参数

### 工具探测

`src/core/toolkit.ts`：

- 优先在 `PATH` 中查找
- Windows 额外探测 `C:\Program Files\PostgreSQL`、`C:\Program Files (x86)\PostgreSQL`、`C:\PostgreSQL`、`D:\PostgreSQL`、`%PG_BIN%`
- Linux/macOS 额外探测 `/usr/bin`、`/usr/local/bin`、Homebrew/MacPorts、`/usr/lib/postgresql/*/bin`
- `detectInDir(dir)` 会同时把 `dir` 本身和 `dir/bin` 当作候选路径

## 开发注意事项

### Ink 7 与 React 19

- 当前使用 Ink 7 + React 19 + JSX transform `react-jsx`
- **Ink 7 的 Text 组件把 `dim` 属性改名为 `dimColor`**。如果未来从旧示例/文档复制代码，请用 `dimColor` 而不是 `dim`，否则类型会报错
- 全屏接管通过 `render(<App />, { alternateScreen: true })` 实现，退出时自动还原终端
- 鼠标支持当前已禁用（与键盘输入冲突）

### 模块规范

- `package.json` 设置 `"type": "module"`，`tsconfig.json` 使用 `"module": "NodeNext"`
- TypeScript 文件之间的 import **必须带 `.js` 扩展名**，例如 `import { App } from './app/App.js'`
- JSX 无需手动 import React（已配置 `jsx: react-jsx`）

### 子进程与环境变量

- 所有 PostgreSQL 工具都通过原生 `child_process.spawn` 启动
- SSL 参数通过 `PGSSLMODE` / `PGSSLROOTCERT` / `PGSSLCERT` / `PGSSLKEY` 环境变量透传
- 不要在代码或日志中硬编码密码；密码字段在 UI 中以 `●●●●●●` 掩码显示

### 添加新屏幕

1. 在 `src/app/App.tsx` 的 `ScreenName` 联合类型中增加新状态
2. 在 `switch (screen)` 中渲染对应组件
3. 新增 `src/app/screens/YourScreen.tsx`，接收 `onDone` / `onCancel` 回调把控制权交还 `App.tsx`

### 构建产物

- `npm run build` 输出到 `dist/`，保持与 `src/` 相同的相对结构
- `package.json` 的 `bin` 指向 `dist/index.js`，`files` 只发布 `dist`
- 提交前通常不需要提交 `dist/`，由 `prepare` / `prepublishOnly` 自动构建
