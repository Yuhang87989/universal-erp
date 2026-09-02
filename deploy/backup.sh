#!/bin/bash
# ERP MySQL 自动备份脚本
# 每天运行，保留最近 7 天的备份

BACKUP_DIR="/opt/universal-erp/backups"
DB_NAME="erp_db"
DB_USER="root"
DB_PASS="Qjj359899"
RETAIN_DAYS=7

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 生成备份文件名（带日期）
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz"

# 执行备份
mysqldump -u"$DB_USER" -p"$DB_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  --databases "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "[$(date)] 备份成功: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
    echo "[$(date)] 备份失败！" >&2
    exit 1
fi

# 清理过期备份
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +$RETAIN_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "[$(date)] 已清理 $DELETED 个过期备份"
fi

# 显示当前备份列表
echo "[$(date)] 当前备份数量: $(ls -1 "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | wc -l)"
