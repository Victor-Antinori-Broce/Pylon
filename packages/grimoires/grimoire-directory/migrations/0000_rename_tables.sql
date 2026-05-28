-- Rename tables
ALTER TABLE IF EXISTS organizations RENAME TO directory_organizations;
ALTER TABLE IF EXISTS departments RENAME TO directory_departments;
ALTER TABLE IF EXISTS positions RENAME TO directory_positions;
ALTER TABLE IF EXISTS employees RENAME TO directory_employees;
ALTER TABLE IF EXISTS employee_documents RENAME TO directory_employee_documents;
ALTER TABLE IF EXISTS org_chart_cache RENAME TO directory_org_chart_cache;

-- Rename enums
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_status') THEN
    ALTER TYPE employee_status RENAME TO directory_employee_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type') THEN
    ALTER TYPE employment_type RENAME TO directory_employment_type;
  END IF;
END $$;
