# pg-syncer

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

基于 PostgreSQL 官方命令行工具 `pg_dump` / `pg_restore` 实现的**跨环境多库批量同步** TUI（终端用户界面）工具。

- **默认单向同步**：远程源数据库 → 本地目标数据库。
- **默认 Directory 格式（`-Fd`）**：天然支持多线程并行 dump / restore，适合大库。
- 可切换为 Custom（`-Fc`）或 Plain SQL（`-Fp`）格式。
- **命名环境**：像 IDE 数据库插件一样，把每个连接保存为命名环境（如 `sit1`、`prod`），分字段填写 host / port / 用户 / 密码 / 库名 / SSL 证书。
- **多库批量同步**：选中源环境后自动查询所有用户数据库，默认全选，批量同步到目标环境。
- **目标库命名规则**：默认 `${source_db}_${source_env}`，例如 `appdb_sit1`。
- **开箱即带 localhost 环境**：首次启动自动预置本地环境，降低首次使用门槛。
- **全程键盘操作**，无需手写绝对路径。

## 目录

- [功能特性](#功能特性)
- [环境要求](#环境要求)
- [安装](#安装)
- [快速开始](#快速开始)
- [使用流程](#使用流程)
- [键盘操作](#键盘操作)
- [同步参数说明](#同步参数说明)
- [配置存储](#配置存储)
- [技术栈](#技术栈)
- [开发](#开发)
- [已知限制与待办](#已知限制与待办)
- [常见问题](#常见问题)
- [许可证](#许可证)

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 全屏接管 | 启动即进入终端备用屏幕缓冲区（类似 `vim` / `htop`），退出时自动还原原界面与光标位置。 |
| 工具自检 | 启动时在 `PATH` 与常见安装目录中探测 `pg_dump` / `pg_restore` / `psql`；未找到时通过键盘目录树引导选择 PostgreSQL 安装目录（`PG_HOME` 或 `bin`）。 |
| 命名环境 | 每个连接有独立名字（如 `sit1`），包含 host、port、user、password、database、SSL 模式、CA/客户端证书、客户端私钥；保存后持久化到配置文件。 |
| 默认 localhost | 首次启动自动注入 `localhost` 环境（`postgres/postgres/5432`，SSL `disable`），可立即开始同步。 |
| XShell 风格环境管理 | 双栏布局：左侧环境列表，右侧详情面板；支持 [n] 新建、[e] 编辑、[x] 删除、[s] 同步。 |
| 同步门禁 | 环境数 < 2 时禁用同步按钮并提示用户新建环境。 |
| 多库批量同步 | 选中源环境后自动用 `psql` 查询可连接用户数据库（排除 `template0` / `template1` / `postgres`），默认全选；支持 Space 勾选/取消、`a` 全选/全不选。 |
| 目标库命名规则 | 默认 `${sourceDb}_${sourceEnvName}`（如 `appdb_sit1`）。 |
| 冲突处理 | 目标库已存在时可在确认面板选择：覆盖（先 `DROP DATABASE` 再创建）、跳过、重命名。 |
| 目录/文件选择器 | 工具缺失或选择 SSL 证书时，可用键盘浏览目录树，按 `Space`（目录模式）或 `Enter`（文件模式）选择。 |
| 双栏日志 | Dump 与 Restore 实时日志左右分栏、自动滚动、↑/↓ 可回卷。 |
| 并行执行 | 通过 `-j N` 控制 `pg_dump` / `pg_restore` 并行线程数，范围 1~16，默认 4。 |
| SSL 透传 | 通过 `PGSSLMODE` / `PGSSLROOTCERT` / `PGSSLCERT` / `PGSSLKEY` 环境变量透传给子进程。 |
| 配置持久化 | 环境、工具路径、最近参数保存到 `~/.pg-syncer/config.json`，原子写入（先写临时文件再 rename）。 |
| 结果汇总 | 同步结束后展示每个库的成功/失败状态与最近失败日志。 |

## 环境要求

- **Node.js ≥ 20**（项目使用 ESM + TypeScript + Ink 7 + React 19）
- **PostgreSQL 客户端工具**：
  - `pg_dump`（必须）
  - `pg_restore`（必须）
  - `psql`（必须：用于查询源库列表、检查/创建/删除目标库；Plain SQL 格式恢复时也依赖它）
- **交互式终端**：TUI 依赖真实 TTY，通过管道 / CI / 脚本调用会在启动时主动退出。
- **现代终端**：Windows Terminal、PowerShell、macOS Terminal、iTerm2、GNOME Terminal 等支持 ANSI 备用屏幕缓冲区的终端。

## 安装

### 全局安装（推荐）

```bash
# 进入项目目录
npm install -g .
pg-syncer

# 或使用 npm link（开发时边改边用）
npm link
pg-syncer

# 卸载 / 解除链接
npm uninstall -g pg-syncer
npm unlink pg-syncer
```

`package.json` 已配置 `bin: { "pg-syncer": "dist/index.js" }`，`prepare` / `prepublishOnly` 会在安装/发布前自动执行 `npm run build`。

### 本地运行（开发调试）

```bash
npm install
npm run build      # 编译到 dist/
npm start          # 或 node dist/index.js
npm run dev        # 开发模式（tsx 免构建直接运行）
npm run typecheck  # 仅类型检查，不输出文件
```

## 快速开始

1. 确保本地已安装 PostgreSQL 并能在 `PATH` 中找到 `pg_dump`、`pg_restore`、`psql`。
2. 运行 `pg-syncer`。
3. 启动时会自动探测工具；若探测失败，用键盘目录树选择 PostgreSQL 的 `bin` 目录。
4. 进入主界面后，默认已有 `localhost` 环境；按 `n` 新建源环境（如 `sit1`）。
5. 选中源环境，按 `s` 开始同步向导。
6. 按向导提示：选库 → 选目标环境 → 选 dump 格式 → 设置并行数 → 处理目标库冲突 → 开始同步。

## 使用流程

```
启动
 ├─ 自检 pg_dump / pg_restore / psql
 │   ├─ 未找到 ──► 引导选择 PostgreSQL 安装目录（PG_HOME 或 bin，支持键盘导航）
 │   └─ 已找到 ──► 进入主界面
 ├─ 主界面（XShell 风格）
 │   ┌─ 左侧：环境列表 ──────────┬─ 右侧：选中环境详情 ─┐
 │   │ › sit1 · pgadmin@remote:5432 │ 环境名  sit1        │
 │   │   localhost · postgres@lo… │ 主机    remote:5432 │
 │   │   ➕ 新建环境…               │ 用户    pgadmin     │
 │   └────────────────────────────┴─ 数据库  appdb       ─┘
 │   [n] 新建 · [e] 编辑 · [x] 删除 · [s] 同步 · [Enter] 详情 · [q] 退出
 ├─ 同步向导（按 s 从主界面开始）
 │   ① 查询源环境数据库（自动，排除 template0/template1/postgres）
 │   ② 批量选择数据库（默认全选，Space 切换，a 全选/全不选）
 │   ③ 选择目标环境（默认 localhost，可修改）
 │   ④ 选择 Dump 格式（Directory / Custom / Plain）
 │   ⑤ 设置并行线程数（1~16，默认 4）
 │   ⑥ 确认面板（库名映射 + 冲突处理：覆盖/跳过/重命名）
 ├─ 执行面板  多库循环 dump → restore + 双栏日志 + 进度
 └─ 结果面板  每个库成功/失败状态 + 失败日志
```

## 键盘操作

| 场景 | 操作 |
| --- | --- |
| **主界面** | `↑`/`↓` 选择环境 · `n` 新建 · `e` 编辑 · `x` 删除 · `s` 同步（环境<2 时提示） · `Enter` 详情 · `q` 退出 |
| **批量选库** | `↑`/`↓` 移动 · `Space`/`Enter` 勾选 · `a` 全选/全不选 · `s` 确认 · `Esc` 取消 |
| **目标选择 / 格式选择** | `↑`/`↓` 移动 · `Enter` 选择 · `Esc` 取消 |
| **确认面板** | `↑`/`↓` 选择库 · `o` 覆盖 · `k` 跳过 · `r` 重命名（按 `r` 后输入自定义库名，Enter 确认） · `Enter` 开始同步 · `Esc` 取消 |
| **环境表单** | `Tab`/`Shift+Tab`/`↑`/`↓` 切换字段（自动编辑）· 文本字段 `Enter` 跳下一个 · SSL `Enter` 下拉选择 · 证书 `Enter` 文件选择器 · 💾 保存按钮 `Enter` 提交 · `Esc` 取消 |
| **目录 / 文件选择器** | `←`/`Backspace` 上级目录；目录模式 `Space` 选择当前目录；文件模式 `Enter` 选择当前文件 |
| **执行日志** | `↑`/`↓` 回卷（默认跟随底部自动滚动），`Ctrl+C` 中断任务 |
| **结果面板** | `Enter` / `q` 返回主界面 |
| **通用** | `Esc` 返回 / 取消 |

## 同步参数说明

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| 源环境 | — | 选中的命名环境；同步时以该环境为源。 |
| 目标环境 | `localhost`（若存在） | 数据恢复到的目标环境。 |
| 数据库 | 源环境全部用户库 | 通过 `psql` 查询，默认全选。 |
| 目标库名 | `${sourceDb}_${sourceEnvName}` | 可在确认面板为每个库单独重命名。 |
| Dump 格式 | `directory`（`-Fd`） | 目录格式，支持并行 dump/restore，适合大库。 |
| 并行线程数 `-j` | 4 | 范围 1~16；Plain SQL 格式 dump 不使用并行。 |
| `--no-owner --no-privileges` | 开启 | 跨环境恢复时避免 owner/权限错误；如需保留原 owner，可在 `src/core/pipeline.ts` 中把 `noOwner` 置为 `false`。 |

## 配置存储

配置文件路径：`~/.pg-syncer/config.json`

```json
{
  "version": 1,
  "tools": {
    "pgDump": "D:\\soft\\PostgreSQL\\18\\bin\\pg_dump.exe",
    "pgRestore": "D:\\soft\\PostgreSQL\\18\\bin\\pg_restore.exe",
    "psql": "D:\\soft\\PostgreSQL\\18\\bin\\psql.exe"
  },
  "environments": [
    {
      "name": "sit1",
      "host": "remote-host",
      "port": 5432,
      "user": "pgadmin",
      "password": "********",
      "database": "appdb",
      "sslMode": "verify-full",
      "sslRootCert": "C:\\certs\\prod.crt"
    },
    {
      "name": "local",
      "host": "localhost",
      "port": 5432,
      "user": "postgres",
      "database": "appdb",
      "sslMode": "prefer"
    }
  ],
  "last": { "source": "sit1", "target": "local", "format": "directory", "jobs": 4, "noOwner": true }
}
```

- `version`：配置文件版本号，当前为 `1`。
- `tools`：已解析的 PostgreSQL 工具绝对路径。
- `environments`：命名环境列表；每个环境包含 `name`、`host`、`port`、`user`、`password`（可选）、`database`、`sslMode`、以及可选的 `sslRootCert` / `sslCert` / `sslKey`。
- `last`：最近一次同步的参数快照（源/目标按环境名记录）。

> 安全说明：界面中密码字段以 `●●●●●●` 掩码显示；连接串只包含 `user@host:port/db`，密码通过 `PGPASSWORD` 环境变量透传给子进程，不会出现在进程列表或日志中。但配置文件以明文保存，请注意文件权限。

## 技术栈

- **Node.js ESM + TypeScript**（`module: NodeNext`）
- **Ink 7 + React 19**：TUI 渲染框架
- **全屏接管**：`render(<App/>, { alternateScreen: true })` 进入备用屏幕缓冲区；根组件用 `useWindowSize()` 铺满终端并随 resize 自适应
- **ink-select-input** / **ink-text-input**：基础交互组件
- 子进程通过原生 `child_process.spawn` 启动（直接拿到 stdout/stderr 流）

## 开发

```bash
# 安装依赖
npm install

# 开发模式（tsx 热运行）
npm run dev

# 类型检查
npm run typecheck

# 构建到 dist/
npm run build

# 运行构建产物
npm start
```

项目当前**未配置测试框架**（无 Jest / Vitest / Playwright），也**未配置 linter / formatter**（无 ESLint / Prettier / Biome）。如需引入，请在项目根目录添加对应配置文件并在 `package.json` 补充脚本。

### 代码结构

```
src/
├── index.tsx              # 入口：TTY 检查 + 全屏渲染 App
├── app/
│   ├── App.tsx            # 全局屏幕状态机
│   ├── components/        # 复用组件（LogPanel、FilePicker、DatabasePicker、Spinner 等）
│   ├── screens/           # 各全屏页面
│   └── hooks/             # React hooks
├── core/                  # 与 UI 无关的核心逻辑
│   ├── types.ts           # 共享类型
│   ├── toolkit.ts         # 工具探测
│   ├── dbinfo.ts          # 数据库查询与 DDL
│   ├── pipeline.ts        # 多库同步管线
│   ├── connstring.ts      # 连接串生成
│   └── linestream.ts      # 子进程输出按行切分
├── config/
│   ├── types.ts           # ConfigData 结构
│   └── store.ts           # ~/.pg-syncer/config.json 原子读写
└── utils/
    └── format.ts          # 耗时格式化与标签
```

更详细的协作指引请参见根目录 [`CLAUDE.md`](./CLAUDE.md)。

## 已知限制与待办

> 以下功能尚未实现，已记录为后续开发计划。

- [ ] **dump 目录管理**：将临时 dump 从 `os.tmpdir()` 迁移到可配置的持久化目录，支持按时间/环境/数据库组织 dump 文件，并提供生命周期清理策略。
- [ ] **dump 资源占用管理**：在执行前预估或监控磁盘空间、CPU/内存占用，增加并发数上限与磁盘空间安全检查，避免资源耗尽。
- [ ] **从历史 dump 记录中恢复**：记录每次 dump 的元数据（源环境、库名、时间、格式、校验信息），支持在历史 dump 列表中选择并直接恢复到目标环境，无需重新 dump。

## 常见问题

- **Windows 下点击运行无反应 / 中文乱码**：请使用 Windows Terminal、Windows PowerShell 等支持 ANSI 的终端，并确保代码页为 UTF-8。
- **如何修改/删除已保存的环境？** 在「主界面」把光标移到目标环境上按 `e` 编辑、按 `x` 删除（按 `y` 确认）；环境配置保存在 `~/.pg-syncer/config.json` 的 `environments` 中。
- **提示“需要交互式终端（TTY）”**：说明你是通过管道 / 脚本 / CI 调用的。TUI 依赖键盘输入与原始终端模式，请在真实终端里直接执行 `pg-syncer`。
- **全屏（备用屏幕缓冲区）无效**：全屏依赖终端的 ANSI 备用屏幕支持，请使用 Windows Terminal / macOS Terminal / iTerm2 / GNOME Terminal 等现代终端；在管道或 CI 等非交互环境下 Ink 会自动忽略全屏。
- **`pg-syncer` 命令找不到**：全局安装后请确认 npm 的全局 bin 目录已加入 `PATH`（Windows 下通常是 `%APPDATA%\npm`，运行 `npm prefix -g` 查看）。
- **提示缺少 psql**：查询数据库列表、目标库 DDL 以及 Plain SQL 格式恢复都依赖 `psql`，缺省时请切换到 Directory 或 Custom 格式，或安装完整 PostgreSQL 客户端。
- **恢复时权限报错**：已默认携带 `--no-owner --no-privileges`；如需保留原 owner，可在 `src/core/pipeline.ts` 中把 `noOwner` 置为 `false`。
- **同步失败但找不到临时 dump 文件**：当前实现会在每个库 dump/restore 周期结束后清理 `os.tmpdir()` 中的临时 dump；失败日志可在结果面板查看。持久化 dump 与失败保留属于后续 [待办](#已知限制与待办) 功能。

## 许可证

MIT
