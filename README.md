# 备忘录

在线笔记记录网页，多用户 + 分权控制。

## 账户体系

- **管理员**：可查看所有笔记、管理用户（创建/重置密码/删除）
- **普通用户**：只看自己的笔记，管理员创建账号
- 首次启动自动创建管理员，默认 `admin` / `admin123`

## 部署

### 1. 上传项目

```bash
scp -r my-project/ root@你的服务器IP:/opt/memo/
ssh root@你的服务器IP
```

### 2. 安装依赖

```bash
cd /opt/memo/my-project
npm install
```

### 3. 设置管理员密码

```bash
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=你的密码
```

### 4. 用 PM2 后台运行

```bash
npm install -g pm2
PORT=3001 ADMIN_USERNAME=admin ADMIN_PASSWORD=你的密码 pm2 start server.js --name memo
pm2 save
pm2 startup
```

访问 `http://你的服务器IP:3001`

## Nginx 反向代理（可选）

如需 80 端口访问，复制 `nginx.conf` 到 `/etc/nginx/conf.d/` 并重启 nginx。
