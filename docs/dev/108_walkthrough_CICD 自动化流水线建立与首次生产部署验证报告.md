# NormScale CI/CD 自动化流水线建立与首次生产部署验证报告

本报告记录了 **准衡 NormScale** 基于 GitHub Actions (GitHub Hosted) 与目标生产服务器 (Ubuntu 22.04 LTS, Node.js 22 LTS) 的 CI/CD 自动化流水线实施过程、基础设施配置与首发部署验证结果。

---

## 一、 交付物清单与完成状态

| 需求项                          | 实施动作                                              | 交付状态  | 验证证据 / 产物                                                                           |
| ------------------------------- | ----------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| **1. 部署目录创建与权限** | 以`zpje` 身份创建 `/var/www/NormScale`            | ✅ 已完成 | `drwxrwxr-x 7 zpje zpje 4096`，读写执行权限完整                                         |
| **2. Nginx 反代配置**     | 配置域名`normscale.izpje.com` 反代至 `4006`       | ✅ 已完成 | `/etc/nginx/conf.d/normscale.conf`，泛域名 SSL 加密，HTTP 强制 301 跳转 HTTPS，重载成功 |
| **3. 服务器运行时适配**   | 为`zpje` 安装与配置 Node.js 22 LTS                  | ✅ 已完成 | `nvm install 22`，运行版本 `v22.23.2`，严格满足项目技术栈约束                         |
| **4. 专有部署鉴权密钥**   | 为`zpje` 生成专用 ed25519 密钥对                    | ✅ 已完成 | 公钥追加至`~/.ssh/authorized_keys`，免密连接测试通过                                    |
| **5. CI/CD 工作流脚本**   | 编写`.github/workflows/deploy.yml`                  | ✅ 已完成 | GitHub Hosted (ubuntu-latest)，涵盖 CI 测试、云端打包、SCP 传输与 PM2 热重载              |
| **6. PM2 生态与发布脚本** | 编写`ecosystem.config.cjs` 与 `scripts/deploy.sh` | ✅ 已完成 | 守护进程名`NormScale`，端口 `4006`，内置健康检查与 `pm2 save`                       |
| **7. 首次生产部署执行**   | 执行完整首发部署与生产依赖安装                        | ✅ 已完成 | PM2 进程`NormScale` 成功 `online`，本地及公网域名响应 `HTTP/2 200 OK`               |

---

## 二、 核心配置文件展示

### 1. Nginx 反向代理配置 (`/etc/nginx/conf.d/normscale.conf`)

```nginx
# 1. HTTP 自动重定向至 HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name normscale.izpje.com;
    return 301 https://$host$request_uri;
}

# 2. HTTPS 正式反向代理服务
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name normscale.izpje.com;

    ssl_certificate     /etc/nginx/ssl/izpje/izpje.com.pem; 
    ssl_certificate_key /etc/nginx/ssl/izpje/izpje.com.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    client_max_body_size 50M;

    access_log /var/log/nginx/normscale.izpje.com.access.log;
    error_log  /var/log/nginx/normscale.izpje.com.error.log;

    location / {
        proxy_pass http://127.0.0.1:4006;
      
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

### 2. PM2 配置文件 (`ecosystem.config.cjs`)

```javascript
module.exports = {
  apps: [
    {
      name: 'NormScale',
      cwd: '/var/www/NormScale',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 4006',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4006,
      },
    },
  ],
};
```

### 3. GitHub Actions CI/CD 流水线 (`.github/workflows/deploy.yml`)

流水线由两个自动化阶段组成：

- **`ci`**：检出代码 $\to$ pnpm 环境就绪 $\to$ Node 22 $\to$ `pnpm typecheck` (严格静态类型检查) $\to$ `pnpm test` (54 套件、265 项测试全部通过)；
- **`build-and-deploy`**：云端执行 `pnpm build` $\to$ 排除 `.next/cache` 压缩为 6.6MB 紧凑包 $\to$ `appleboy/scp-action` 传输至服务器 $\to$ `appleboy/ssh-action` 触发 `deploy.sh` 解包、安装生产依赖并以 PM2 热重载。

**GitHub Actions 官方在线运行证据**：

- 最新运行记录：[Run #34464610316](https://github.com/ShiroMaple/NormScale/actions/runs/34464610316)
- 运行状态：
  - `CI (TypeCheck & Unit Tests)`: `completed / success` (37s)
  - `Build & Deploy to Production`: `completed / success` (1m 30s)

---

## 三、 实机部署与网络验证证据

### 1. PM2 进程状态

```bash
$ pm2 status NormScale
┌────┬───────────┬───────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name      │ namespace │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼───────────┼───────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 14 │ NormScale │ default   │ 15.5.23 │ cluster │ 3391493  │ 12m    │ 0    │ online    │ 0%       │ 253.6mb  │ zpje     │ disabled │
└────┴───────────┴───────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
```

### 2. 本地 4006 端口响应

```http
$ curl -I http://127.0.0.1:4006
HTTP/1.1 200 OK
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
x-nextjs-cache: HIT
X-Powered-By: Next.js
Content-Type: text/html; charset=utf-8
Content-Length: 48649
```

### 3. HTTP 强制 301 跳转 HTTPS

```http
$ curl.exe -I --resolve normscale.izpje.com:80:47.99.125.9 http://normscale.izpje.com
HTTP/1.1 301 Moved Permanently
Server: nginx/1.24.0 (Ubuntu)
Location: https://normscale.izpje.com/
```

### 4. 外网 HTTPS 域名访问实测

```http
$ curl.exe -k -I --resolve normscale.izpje.com:443:47.99.125.9 https://normscale.izpje.com
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
Date: Thu, 10 Sep 2026 09:51:32 GMT
Content-Type: text/html; charset=utf-8
Content-Length: 48649
X-Powered-By: Next.js
```

### 5. 核心 API 接口自检 (`/api/admin/logs`)

```json
{
  "success": true,
  "currentLevel": "debug",
  "total": 2,
  "logs": [
    {
      "timestamp": "2026-09-10T09:50:48.873Z",
      "level": "info",
      "tag": "WORKFLOW",
      "message": "[LlmPropertyResolverService] 配置装配就绪: model=kimi-k2.7-code-highspeed, provider=Moonshot, hasValidKey=true"
    }
  ]
}
```

---

## 四、 GitHub Secrets 配置指引

若要在 GitHub 仓库推送代码时触发自动部署，请在 GitHub 仓库页面进入 **Settings** $\to$ **Secrets and variables** $\to$ **Actions** $\to$ **New repository secret**，添加以下 4 个配置项：

| Secret 名称        | 填入内容说明                                     |
| ------------------ | ------------------------------------------------ |
| `SERVER_HOST`    | `47.99.125.9`                                  |
| `SERVER_PORT`    | `29922`                                        |
| `SERVER_USER`    | `zpje`                                         |
| `SERVER_SSH_KEY` | *(复制下方为服务器生成的专属部署私钥完整内容)* |

> [!IMPORTANT]
> **SERVER_SSH_KEY 私钥内容**（已在服务器授权，复制以下完整块至 GitHub Secret）：
>
> *已隐藏*
