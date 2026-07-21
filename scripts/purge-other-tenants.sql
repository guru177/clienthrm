-- Keep organization id=1 (mashuptech) and user id=1 (info@retaildaddy.in) only.
BEGIN;

DELETE FROM workflow_executions
WHERE workflow_id IN (SELECT id FROM workflows WHERE organization_id <> 1);

DELETE FROM workflows WHERE organization_id <> 1;

DELETE FROM jwt_refresh_tokens
WHERE user_id IN (SELECT id FROM users WHERE organization_id <> 1 OR id <> 1);

DELETE FROM role_user
WHERE user_id IN (SELECT id FROM users WHERE organization_id <> 1 OR id <> 1);

DELETE FROM permission_role
WHERE role_id IN (SELECT id FROM roles WHERE organization_id <> 1);

DELETE FROM user_presence
WHERE user_id IN (SELECT id FROM users WHERE organization_id <> 1 OR id <> 1)
   OR organization_id <> 1;

DELETE FROM fcm_tokens
WHERE user_id IN (SELECT id FROM users WHERE organization_id <> 1 OR id <> 1);

DELETE FROM password_reset_tokens
WHERE user_id IN (SELECT id FROM users WHERE organization_id <> 1 OR id <> 1);

DELETE FROM password_reset_otp_challenges
WHERE organization_id <> 1 OR user_id <> 1;

DELETE FROM signup_otp_challenges;

DELETE FROM task_comments
WHERE task_id IN (SELECT id FROM tasks WHERE organization_id <> 1);

DELETE FROM project_user
WHERE project_id IN (SELECT id FROM projects WHERE organization_id <> 1);

DELETE FROM salary_structure_items
WHERE user_id IN (SELECT id FROM users WHERE organization_id <> 1 OR id <> 1);

DELETE FROM salary_structures
WHERE user_id IN (SELECT id FROM users WHERE organization_id <> 1 OR id <> 1);

DELETE FROM app_settings WHERE organization_id <> 1;
DELETE FROM archived_data_exports WHERE organization_id <> 1;
DELETE FROM attendance WHERE organization_id <> 1;
DELETE FROM biometric_devices WHERE organization_id <> 1;
DELETE FROM biometric_punches WHERE organization_id <> 1;
DELETE FROM biometric_user_map WHERE organization_id <> 1;
DELETE FROM careers WHERE organization_id <> 1;
DELETE FROM centers WHERE organization_id <> 1;
DELETE FROM departments WHERE organization_id <> 1;
DELETE FROM designations WHERE organization_id <> 1;
DELETE FROM employee_advances WHERE organization_id <> 1;
DELETE FROM employee_exit_settlements WHERE organization_id <> 1;
DELETE FROM employee_salary_profiles WHERE organization_id <> 1;
DELETE FROM employee_tax_declarations WHERE organization_id <> 1;
DELETE FROM holidays WHERE organization_id <> 1;
DELETE FROM job_applications WHERE organization_id <> 1;
DELETE FROM leave_credits WHERE organization_id <> 1;
DELETE FROM leave_requests WHERE organization_id <> 1;
DELETE FROM leave_types WHERE organization_id <> 1;
DELETE FROM org_notification_reads
WHERE notification_id IN (SELECT id FROM org_notifications WHERE organization_id <> 1);
DELETE FROM org_notifications WHERE organization_id <> 1;
DELETE FROM pay_groups WHERE organization_id <> 1;
DELETE FROM payroll_audit_log WHERE organization_id <> 1;
DELETE FROM payroll_runs WHERE organization_id <> 1;
DELETE FROM payroll_variable_items WHERE organization_id <> 1;
DELETE FROM payslips WHERE organization_id <> 1;
DELETE FROM projects WHERE organization_id <> 1;
DELETE FROM reimbursement_claims WHERE organization_id <> 1;
DELETE FROM roles WHERE organization_id <> 1;
DELETE FROM salary_components WHERE organization_id <> 1;
DELETE FROM salary_templates WHERE organization_id <> 1;
DELETE FROM shift_daily_roster WHERE organization_id <> 1;
DELETE FROM shift_templates WHERE organization_id <> 1;
DELETE FROM tasks WHERE organization_id <> 1;
DELETE FROM tenant_feature_overrides WHERE organization_id <> 1;
DELETE FROM user_shift_assignments WHERE organization_id <> 1;

DELETE FROM chat_message_attachments
WHERE message_id IN (
  SELECT m.id FROM chat_messages m
  JOIN chat_spaces s ON s.id = m.space_id
  WHERE s.organization_id <> 1
);
DELETE FROM chat_message_reactions
WHERE message_id IN (
  SELECT m.id FROM chat_messages m
  JOIN chat_spaces s ON s.id = m.space_id
  WHERE s.organization_id <> 1
);
DELETE FROM chat_starred_messages
WHERE message_id IN (
  SELECT m.id FROM chat_messages m
  JOIN chat_spaces s ON s.id = m.space_id
  WHERE s.organization_id <> 1
);
DELETE FROM chat_pinned_messages
WHERE message_id IN (
  SELECT m.id FROM chat_messages m
  JOIN chat_spaces s ON s.id = m.space_id
  WHERE s.organization_id <> 1
);
DELETE FROM chat_messages WHERE organization_id <> 1;
DELETE FROM chat_space_members
WHERE space_id IN (SELECT id FROM chat_spaces WHERE organization_id <> 1);
DELETE FROM chat_spaces WHERE organization_id <> 1;

DELETE FROM platform_org_notes WHERE organization_id <> 1;
DELETE FROM platform_plan_change_requests WHERE organization_id <> 1;
DELETE FROM platform_support_tickets WHERE organization_id <> 1;
DELETE FROM platform_invoices WHERE organization_id <> 1;

-- Remove extra users inside kept org as well
DELETE FROM attendance WHERE organization_id = 1 AND user_id <> 1;
DELETE FROM leave_requests WHERE organization_id = 1 AND user_id <> 1;
DELETE FROM leave_credits WHERE organization_id = 1 AND user_id <> 1;
DELETE FROM payslips WHERE organization_id = 1 AND user_id <> 1;
DELETE FROM payroll_variable_items WHERE organization_id = 1 AND user_id <> 1;
DELETE FROM employee_salary_profiles WHERE organization_id = 1 AND user_id <> 1;
DELETE FROM user_shift_assignments WHERE organization_id = 1 AND user_id <> 1;
DELETE FROM biometric_user_map WHERE organization_id = 1 AND user_id <> 1;
DELETE FROM biometric_punches WHERE organization_id = 1 AND user_id <> 1;
DELETE FROM tasks WHERE organization_id <> 1;
DELETE FROM chat_space_members WHERE user_id <> 1;
DELETE FROM role_user WHERE user_id <> 1;

DELETE FROM users WHERE organization_id <> 1 OR id <> 1;
DELETE FROM organizations WHERE id <> 1;

UPDATE organizations SET status = 'active' WHERE id = 1;

COMMIT;

SELECT (SELECT COUNT(*) FROM organizations) AS orgs,
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT email FROM users LIMIT 1) AS kept_email;
