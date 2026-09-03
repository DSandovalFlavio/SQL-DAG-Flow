-- @description: Rebuilds gold user statistics from the silver layer
-- @author: data-team
CREATE OR REPLACE PROCEDURE analytics_project.ops.refresh_user_stats()
BEGIN
  INSERT INTO analytics_project.gold_dataset.user_stats (user_id, total_orders)
  SELECT u.user_id, COUNT(*) AS total_orders
  FROM analytics_project.silver_dataset.users_cleaned u
  GROUP BY u.user_id;

  CALL analytics_project.ops.audit_refresh();
END;
