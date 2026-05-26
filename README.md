# 备忘录 (Memo App)

一个支持多用户、多级目录、标签分类、修改历史的在线笔记应用。Node.js 后端 + 原生前端，单文件部署。

## 功能

- **多用户**：管理员创建账号，普通用户只看自己的笔记
- **多级目录**：支持无限嵌套文件夹，父目录自动聚合子目录笔记
- **标签分类**：每条笔记可打多个标签，侧边栏按标签筛选
- **修改历史**：每次保存自动留快照，可预览和恢复历史版本
- **全文搜索**：搜索标题和内容
- **PWA**：手机浏览器打开可添加到桌面，接近 App 体验
- **响应式**：手机/平板/电脑自动适配

## 环境要求

- [Node.js](https://nodejs.org/) 18 或以上版本
- 安装 Node.js 后自带 `npm` 包管理器

验证是否已安装：

```bash
node -v    # 应输出 v18.x.x 或更高
npm -v     # 应输出 9.x.x 或更高
```

## 下载项目

### 方式一：Git 克隆（推荐，方便后续更新）

```bash
git clone https://github.com/LarmesDelaLune/Memo-app.git
cd Memo-app
```

更新时：

```bash
git pull
```

### 方式二：直接下载 ZIP

在 GitHub 仓库页面点 "Code" → "Download ZIP"，解压到任意目录。

## 安装依赖

```bash
npm install
```

> 此命令根据 `package.json` 自动下载 `express` 和 `uuid`，生成 `node_modules` 文件夹。不需要手动创建。

## 本地运行

```bash
node server.js
```

启动后访问 `http://localhost:3000`，默认管理员账户：
- 用户名：`admin`
- 密码：`admin123`

> `data/` 文件夹会在首次启动时自动创建，笔记数据和用户数据都保存在这里。

## 自定义配置

通过环境变量设置：

```bash
# Linux / Mac
export ADMIN_USERNAME=你的管理员用户名
export ADMIN_PASSWORD=你的管理员密码
export PORT=3000
node server.js

# Windows PowerShell
$env:ADMIN_USERNAME="你的管理员用户名"
$env:ADMIN_PASSWORD="你的管理员密码"
$env:PORT=3000
node server.js
```

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ADMIN_USERNAME` | `admin` | 首次启动自动创建的管理员账户名 |
| `ADMIN_PASSWORD` | `admin123` | 管理员密码 |
| `PORT` | `3000` | 监听端口 |

## 部署到云服务器

### 1. 上传代码

```bash
# 本机执行
scp -r Memo-app/ root@你的服务器IP:/opt/memo/
ssh root@你的服务器IP
```

或者用 Git：

```bash
# 服务器上执行
cd /opt
git clone https://github.com/LarmesDelaLune/Memo-app.git memo
cd memo
```

### 2. 安装依赖

```bash
cd /opt/memo
npm install
```

### 3. 使用 PM2 后台运行

[PM2](https://pm2.keymetrics.io/) 是 Node.js 进程管理器，负责后台运行、崩溃自动重启、开机自启。

```bash
# 安装 PM2
npm install -g pm2

# 启动（带上环境变量）
PORT=3001 ADMIN_USERNAME=admin ADMIN_PASSWORD=你的密码 pm2 start server.js --name memo

# 设置开机自启
pm2 save
pm2 startup
# 执行 pm2 startup 输出的那条命令

# 常用 PM2 命令
pm2 status          # 查看状态
pm2 logs memo       # 查看日志
pm2 restart memo    # 重启
pm2 stop memo       # 停止
pm2 delete memo     # 删除进程
```

### 4. 配置防火墙

如果服务器开启了防火墙，需要放行端口：

```bash
sudo ufw allow 3001
```

云服务器（阿里云/腾讯云等）还需要在**安全组**里添加入站规则，放行对应端口。

### 5. 访问

浏览器打开 `http://你的服务器IP:3001`

## Nginx 反向代理（可选）

如果想让用户直接通过 `http://你的域名` 或 `http://IP`（80 端口）访问，不输端口号，配置 Nginx：

```bash
# 安装 Nginx
sudo apt install -y nginx    # Ubuntu/Debian

# 使用项目自带的配置文件
sudo cp nginx.conf /etc/nginx/conf.d/memo.conf
# 如果服务器上已有其他站点，注意修改 server_name 或端口

# 测试配置
sudo nginx -t

# 重载
sudo systemctl reload nginx
```

项目中的 `nginx.conf` 内容：

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## PWA 安装（手机桌面 App）

用手机 Chrome 打开网址 → 点右上角菜单 `⋮` → **添加到主屏幕**。

> 非 HTTPS 下不会自动弹窗，需手动添加。部署 HTTPS 后即可自动弹出安装提示。

## 数据备份

所有数据存储在 `data/` 目录：

- `notes.json` — 笔记数据
- `users.json` — 用户账户（密码已哈希）
- `folders.json` — 目录结构
- `history.json` — 修改历史

备份方法：

```bash
# 简单备份
cp -r data/ data_backup_$(date +%Y%m%d)/

# 下载到本地
scp -r root@你的服务器IP:/opt/memo/data/ ./
```

恢复时把文件放回 `data/` 目录，重启应用即可。

## 项目结构

```
Memo-app/
├── server.js              # Express 后端（全部接口）
├── package.json           # 依赖声明
├── nginx.conf             # Nginx 反向代理配置
├── .env.example           # 环境变量示例
├── .gitignore             # 排除 node_modules、data、.env
├── README.md
├── public/
│   ├── index.html         # 前端页面（全部内联 CSS/JS）
│   ├── manifest.json      # PWA 配置
│   ├── sw.js              # Service Worker
│   └── icon.svg           # App 图标
└── data/                  # 运行时数据（自动创建，不提交 Git）
    ├── notes.json
    ├── users.json
    ├── folders.json
    └── history.json
```

## 更新项目

```bash
# 本机更新代码后
git add .
git commit -m "描述改动"
git push

# 服务器同步
ssh root@你的服务器IP
cd /opt/memo
git pull
pm2 restart memo
```
