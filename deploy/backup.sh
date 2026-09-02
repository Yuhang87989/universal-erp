#!/bin/bash
# ERP MySQL 自动备份脚本
# 每天运行，保留最近 7 天的备份
# 凭据自动从 server/.env 读取（与 ERP 应用一致），改密码只需改 .env

BACKUP_DIR="/opt/universal-erp/backups"
ENV_FILE="/opt/universal-erp/server/.env"
RETAIN_DAYS=7

# 从 .env 读取数据库凭据
if [ -f "$ENV_FILE" ]; then
    DB_USER=$(grep -E "^DB_USER=" "$ENV_FILE" | cut -d= -f2 | tr -d ' \r"')
    DB_PASS=$(grep -E "^DB_PASSWORD=" "$ENV_FILE" | cut -d= -f2 | tr -d ' \r"')
    DB_NAME=$(grep -E "^DB_NAME=" "$ENV_FILE" | cut -d= -f2 | tr -d ' \r"')
fi
DB_USER="${DB_USER:-erp_user}"
DB_PASS="${DB_PASS:-Erp@Secure2026}"
DB_NAME="${DB_NAME:-erp_db}"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz"

# 执行备份
# --no-tablespaces: 规避 erp_user 缺少 PROCESS 权限导致的 Access denied
# PIPESTATUS[0]: 捕获管道中 mysqldump 的真实退出码（$? 只反映 gzip）
mysqldump -u"$DB_USER" -p"$DB_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  --no-tablespaces \
  --databases "$DB_NAME" | gzip > "$BACKUP_FILE"
DUMP_EXIT=${PIPESTATUS[0]}

# 退出码为 0 且文件非空才算成功
if [ "$DUMP_EXIT" -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
    echo "[$(date)] 备份成功: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
    echo "[$(date)] 备份失败！mysqldump 退出码: $DUMP_EXIT" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

# 清理过期备份
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +$RETAIN_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "[$(date)] 已清理 $DELETED 个过期备份"
fi

echo "[$(date)] 当前备份数量: $(ls -1 "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | wc -l)"
