# 通用电商ERP

面向个体门店、菜市场、农用供销社的轻量级进销存管理系统。

## 功能模块

- 📊 **工作台** — 今日概览、销售趋势、热销排行、库存预警
- 🛒 **POS收银** — 触屏快速结账、支持现金/微信/支付宝
- 📦 **商品管理** — 商品增删改查、条码管理、分类筛选
- 🗂️ **商品分类** — 树形分类管理
- 📊 **库存管理** — 实时库存、盘点调整、库存预警、变动流水
- 📝 **采购管理** — 采购下单、入库确认、供应商管理
- 👥 **客户会员** — 会员等级、消费记录、积分管理
- 📈 **数据报表** — 销售统计、利润分析、经营报表
- 🌐 **电商账目** — 多平台订单汇总、自动对账、库存联动
- 🤖 **AI助手** — 自然语言查询、智能补货建议、经营日报

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Ant Design 5 + ECharts |
| 后端 | Node.js + Express + JWT |
| 数据库 | MySQL 8.0 |
| AI | DeepSeek API |
| 部署 | Docker / 自有服务器 |

## 快速启动

### 方式一：Docker（推荐）

```bash
# 修改数据库密码
cp docker-compose.yml docker-compose.override.yml
# 编辑密码后启动
docker-compose up -d
```

访问 http://localhost:3000，默认账号 admin / admin123

### 方式二：本地开发

```bash
# 1. 初始化数据库
mysql -u root -p < server/prisma/schema.sql

# 2. 启动后端
cd server
cp .env.example .env  # 修改配置
npm install
npm run dev

# 3. 启动前端
cd client
npm install
npm run dev
```

前端 http://localhost:5173（自动代理API到3000端口）

## 项目结构

```
project/
├── server/              # 后端
│   ├── src/
│   │   ├── config/      # 数据库配置
│   │   ├── middleware/   # 认证、权限中间件
│   │   ├── routes/      # API路由
│   │   └── index.js     # 入口
│   └── prisma/
│       └── schema.sql   # 数据库建表脚本
├── client/              # 前端
│   ├── src/
│   │   ├── api/         # HTTP请求封装
│   │   ├── context/     # 全局状态（认证）
│   │   ├── layouts/     # 页面布局
│   │   ├── pages/       # 页面组件
│   │   └── styles/      # 全局样式
│   └── index.html
├── docker/              # Docker配置
└── docker-compose.yml
```

## 角色权限

| 角色 | 权限 |
|---|---|
| 老板/owner | 全部权限 |
| 店长/manager | 商品管理、采购、报表、客户管理 |
| 收银员/cashier | POS收银、查看商品 |
| 仓管/warehouse | 库存管理、采购入库 |

## 开源协议

MIT
