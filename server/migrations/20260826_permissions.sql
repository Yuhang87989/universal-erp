-- 权限系统：为users表添加permissions列
-- 注意：CentOS 7 MySQL 5.7不支持IF NOT EXISTS for ADD COLUMN，用存储过程兼容

SET @dbname = DATABASE();
SET @tablename = 'users';
SET @columnname = 'permissions';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_schema = @dbname AND table_name = @tablename AND column_name = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` TEXT NULL COMMENT "JSON权限列表"')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 确保admin用户为owner且permissions为NULL（全部权限）
UPDATE users SET role = 'owner', permissions = NULL WHERE username = 'admin';
