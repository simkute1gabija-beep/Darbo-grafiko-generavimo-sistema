

CREATE DATABASE IF NOT EXISTS work_schedule
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE work_schedule;

DROP TABLE IF EXISTS shifts;
DROP TABLE IF EXISTS staffing_requirements;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS availability;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS companies;

-- Kompanijos (nuomininkai). access_key naudojamas tik prototipe vietoje prisijungimo.
CREATE TABLE companies (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  access_key  VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE employees (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  company_id            INT NOT NULL,
  name                  VARCHAR(100) NOT NULL,
  role                  ENUM('EMPLOYEE', 'MANAGER', 'DEPUTY_MANAGER') NOT NULL DEFAULT 'EMPLOYEE',
  employment_fraction   DECIMAL(3,2) NOT NULL,
  target_monthly_hours  DECIMAL(5,1) NOT NULL,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  -- Reikalinga, kad kitos lentelės galėtų sujungti (id, company_id) poromis.
  UNIQUE KEY uq_employees_id_company (id, company_id),
  CONSTRAINT fk_employees_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB;

-- Kada darbuotojas gali dirbti konkrečią dieną.
-- Jei is_unavailable = 1, tą dieną darbuotojas dirbti negali (laikai gali būti NULL).
CREATE TABLE availability (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  company_id      INT NOT NULL,
  employee_id     INT NOT NULL,
  work_date       DATE NOT NULL,
  available_from  TIME NULL,
  available_to    TIME NULL,
  is_unavailable  TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_availability_company_date (company_id, work_date),
  -- (employee_id, company_id) užtikrina, kad darbuotojas priklauso TAI PAČIAI kompanijai.
  CONSTRAINT fk_availability_employee FOREIGN KEY (employee_id, company_id)
    REFERENCES employees (id, company_id)
) ENGINE=InnoDB;

CREATE TABLE schedules (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  company_id     INT NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  warnings_json  LONGTEXT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_schedules_id_company (id, company_id),
  CONSTRAINT fk_schedules_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB;

-- Poreikiai, pagal kuriuos buvo sugeneruotas konkretus grafikas.
CREATE TABLE staffing_requirements (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  company_id              INT NOT NULL,
  schedule_id             INT NOT NULL,
  work_date               DATE NOT NULL,
  start_time              TIME NOT NULL,
  end_time                TIME NOT NULL,
  required_employee_count INT UNSIGNED NOT NULL,
  CONSTRAINT fk_requirements_schedule FOREIGN KEY (schedule_id, company_id)
    REFERENCES schedules (id, company_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE shifts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  company_id    INT NOT NULL,
  schedule_id   INT NOT NULL,
  employee_id   INT NOT NULL,
  work_date     DATE NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  worked_hours  DECIMAL(4,2) NOT NULL,
  KEY idx_shifts_company_date (company_id, work_date),
  CONSTRAINT fk_shifts_schedule FOREIGN KEY (schedule_id, company_id)
    REFERENCES schedules (id, company_id) ON DELETE CASCADE,
  CONSTRAINT fk_shifts_employee FOREIGN KEY (employee_id, company_id)
    REFERENCES employees (id, company_id)
) ENGINE=InnoDB;
