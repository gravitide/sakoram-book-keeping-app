-- Phase: payroll — employee number / payroll ID for staff lists.
--
-- Added as nullable text. Businesses use varied schemes (E001,
-- EMP-2024-001, the NIC suffix, plain integers) and many small
-- ones don't bother — so no UNIQUE constraint either, by design.
-- The UI surfaces the field on the employee form and includes it
-- in search; the payslip snapshot picks it up going forward.

ALTER TABLE employees ADD COLUMN employee_number TEXT;
CREATE INDEX IF NOT EXISTS idx_employees_employee_number ON employees(employee_number);
