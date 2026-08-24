-- 重置所有admin用户密码为admin123
SET @new_hash = '$2b$10$2sTR6jUQtg6ClG2wg5ucP.h.qLmPgZM75ICuZwWaSJ/YMtQKYeOLi';
UPDATE users SET password_hash = @new_hash WHERE username = 'admin';
SELECT id, username, tenant_id, real_name, status FROM users;
