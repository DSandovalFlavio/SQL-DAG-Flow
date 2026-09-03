-- @description: Writes an audit row after each refresh
CREATE PROCEDURE analytics_project.ops.audit_refresh()
BEGIN
  INSERT INTO analytics_project.ops.audit_log (event) SELECT 'refresh';
END;
