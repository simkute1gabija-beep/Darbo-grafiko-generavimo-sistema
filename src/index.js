const db = require("./database");
const express = require("express");
const path = require("node:path");
const { generateSchedule } = require("./scheduleGenerator");

const app = express();
app.use(express.json());

// Atidarius localhost:3000, Express pateikia public/index.html.
app.use(express.static(path.join(__dirname, "../public")));
async function findCompany(demoKey) {
  if (!demoKey) return null;

  const [companies] = await db.execute(
    "SELECT id, name FROM companies WHERE access_key = ?",
    [demoKey],
  );

  return companies[0] ?? null;
}

function getMonthRange(month) {
  if (
    typeof month !== "string" ||
    !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)
  ) {
    return null;
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    daysInMonth,
    firstDate: `${month}-01`,
    lastDate: `${month}-${daysInMonth}`,
  };
}

async function findCompanyOrReject(demoKey, res) {
  const company = await findCompany(demoKey);

  if (!company) {
    res.status(401).json({ error: "Neteisingas įmonės raktas." });
  }

  return company;
}

app.get("/api/company", async (req, res) => {
  try {
    const company = await findCompanyOrReject(req.get("X-Demo-Key"), res);
    if (!company) return;

    const [employees] = await db.execute(
      `SELECT id, name, role, employment_fraction, target_monthly_hours, is_active
   FROM employees
   WHERE company_id = ?
   ORDER BY is_active DESC, name`,
      [company.id],
    );

    res.json({ companyName: company.name, employees });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Nepavyko užkrauti įmonės." });
  }
});

app.patch("/api/employees/:id/employment", async (req, res) => {
  const employeeId = Number(req.params.id);
  const { employmentFraction } = req.body ?? {};

  if (
    !Number.isSafeInteger(employeeId) ||
    employeeId <= 0 ||
    ![0.25, 0.5, 0.75, 1].includes(employmentFraction)
  ) {
    return res.status(400).json({ error: "Pasirink tinkamą etatą." });
  }

  const fullTimeMonthlyHours = 168;
  const targetMonthlyHours = fullTimeMonthlyHours * employmentFraction;

  try {
    const company = await findCompanyOrReject(req.get("X-Demo-Key"), res);
    if (!company) return;

    const [result] = await db.execute(
      `UPDATE employees
       SET employment_fraction = ?, target_monthly_hours = ?
       WHERE id = ? AND company_id = ? AND is_active = 1`,
      [employmentFraction, targetMonthlyHours, employeeId, company.id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Aktyvus darbuotojas nerastas." });
    }

    res.json({ employmentFraction, targetMonthlyHours });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Nepavyko išsaugoti etato." });
  }
});

// Paspaudus mygtuką, puslapis iš šio adreso pasiima grafiką.
app.get("/api/schedule", async (req, res) => {
  const demoKey = req.get("X-Demo-Key");

  if (!demoKey) {
    return res.status(401).json({ error: "Trūksta įmonės rakto." });
  }

  try {
    const company = await findCompanyOrReject(demoKey, res);
    if (!company) return;

    const selectedMonth = req.query.month ?? "2026-11";

    const monthRange = getMonthRange(selectedMonth);

    if (!monthRange) {
      return res.status(400).json({ error: "Mėnesį nurodyk formatu YYYY-MM." });
    }

    const requiredCounts = [
      req.query.morningRequired,
      req.query.afternoonRequired,
      req.query.eveningRequired,
    ];

    if (
      requiredCounts.some(
        (value) =>
          typeof value !== "string" ||
          !/^\d+$/.test(value) ||
          !Number.isSafeInteger(Number(value)),
      )
    ) {
      return res.status(400).json({
        error: "Kiekvienam intervalui įvesk sveiką darbuotojų skaičių nuo 0.",
      });
    }

    const [morning, afternoon, evening] = requiredCounts.map(Number);
    const { daysInMonth, firstDate, lastDate } = monthRange;

    // Paimame visus aktyvius įmonės darbuotojus ir jų įvestą prieinamumą.
    const [rows] = await db.execute(
      `
  SELECT e.id, e.name, e.target_monthly_hours,
         e.employment_fraction,
         DATE_FORMAT(a.work_date, '%Y-%m-%d') AS workDate,
         TIME_FORMAT(a.available_from, '%H:%i') AS availableFrom,
         TIME_FORMAT(a.available_to, '%H:%i') AS availableTo,
         a.is_unavailable,
         e.role
  FROM employees e
  LEFT JOIN availability a
    ON a.employee_id = e.id
    AND a.company_id = e.company_id
    AND a.work_date BETWEEN ? AND ?
  WHERE e.company_id = ?
    AND e.is_active = 1
  ORDER BY e.id, a.work_date
`,
      [firstDate, lastDate, company.id],
    );

    const employeesById = new Map();
    const availabilityByDay = new Map();

    for (const row of rows) {
      employeesById.set(row.id, {
        id: row.id,
        name: row.name,
        monthlyHours: Number(row.target_monthly_hours),
        employmentFraction: Number(row.employment_fraction),
        role: row.role,
      });

      if (row.workDate) {
        availabilityByDay.set(`${row.id}:${row.workDate}`, row);
      }
    }

    const days = [];
    const intervals = [
      { start: "10:00", end: "13:00", required: morning },
      { start: "13:00", end: "16:00", required: afternoon },
      { start: "16:00", end: "20:00", required: evening },
    ];

    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
      const date = `${selectedMonth}-${String(dayNumber).padStart(2, "0")}`;
      const employees = [];
      const fixedShifts = [];
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

      for (const employee of employeesById.values()) {
        const availability = availabilityByDay.get(`${employee.id}:${date}`);
        if (employee.role === "MANAGER" || employee.role === "DEPUTY_MANAGER") {
          const worksOnWeekday = weekday >= 1 && weekday <= 5;

          if (
            worksOnWeekday &&
            availability &&
            Number(availability.is_unavailable) !== 1
          ) {
            fixedShifts.push({
              employeeId: employee.id,
              name: employee.name,
              start: availability.availableFrom ?? "10:00",
              end: availability.availableTo ?? "20:00",
              isReserve: true,
            });
          }

          continue;
        }
        employees.push({
          ...employee,
          availableFrom: availability?.availableFrom ?? "10:00",
          availableTo: availability?.availableTo ?? "20:00",
          dayOff: Number(availability?.is_unavailable) === 1,
        });
      }

      days.push({
        date,
        intervals,
        employees,
        fixedShifts,
      });
    }

    const result = generateSchedule(days);

    const monthlyHours = Array.from(employeesById.values(), (employee) => {
      const assignedMinutes = Math.round(
        (result.hoursByEmployee.get(employee.id) ?? 0) * 60,
      );
      const targetMinutes = Math.round(employee.monthlyHours * 60);

      return {
        name: employee.name,
        employmentFraction: employee.employmentFraction,
        targetMinutes,
        assignedMinutes,
        differenceMinutes: assignedMinutes - targetMinutes,
      };
    });

    res.json({
      companyName: company.name,
      shifts: result.shifts,
      schedule: result.schedule,
      monthlyHours,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Nepavyko sugeneruoti grafiko." });
  }
});
app.post("/api/availability", async (req, res) => {
  const { employeeId, date, from, to, dayOff } = req.body ?? {};
  const noTimes = (from === "" || from == null) && (to === "" || to == null);
  const timeFormat = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (
    !Number.isInteger(employeeId) ||
    typeof dayOff !== "boolean" ||
    typeof date !== "string" ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date ||
    (!dayOff &&
      !noTimes &&
      (!timeFormat.test(from) || !timeFormat.test(to) || from >= to))
  ) {
    return res.status(400).json({ error: "Patikrink datą ir darbo laikus." });
  }

  let connection;

  try {
    const company = await findCompanyOrReject(req.get("X-Demo-Key"), res);
    if (!company) return;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Darbuotojas turi priklausyti aktyviai įmonei.
    const [employees] = await connection.execute(
      "SELECT id FROM employees WHERE id = ? AND company_id = ? AND is_active = 1 FOR UPDATE",
      [employeeId, company.id],
    );

    if (employees.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Darbuotojas nerastas." });
    }

    const entryKey = [company.id, employeeId, date];
    const times = [
      dayOff || noTimes ? null : from,
      dayOff || noTimes ? null : to,
      dayOff ? 1 : 0,
    ];

    const [existing] = await connection.execute(
      "SELECT employee_id FROM availability WHERE company_id = ? AND employee_id = ? AND work_date = ? LIMIT 1",
      entryKey,
    );

    if (existing.length > 0) {
      await connection.execute(
        `UPDATE availability
         SET available_from = ?, available_to = ?, is_unavailable = ?
         WHERE company_id = ? AND employee_id = ? AND work_date = ?`,
        [...times, ...entryKey],
      );
    } else {
      await connection.execute(
        `INSERT INTO availability
         (company_id, employee_id, work_date, available_from, available_to, is_unavailable)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [...entryKey, ...times],
      );
    }

    await connection.commit();
    res.json({ message: "Prieinamumas išsaugotas." });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(console.error);
    }
    console.error(error);
    res.status(500).json({ error: "Nepavyko išsaugoti prieinamumo." });
  } finally {
    if (connection) connection.release();
  }
});

app.get("/api/availability", async (req, res) => {
  const monthRange = getMonthRange(req.query.month);

  if (!monthRange) {
    return res.status(400).json({ error: "Pasirink mėnesį." });
  }

  const { firstDate, lastDate } = monthRange;

  try {
    const company = await findCompanyOrReject(req.get("X-Demo-Key"), res);
    if (!company) return;

    const [entries] = await db.execute(
      `
      SELECT e.name,
             DATE_FORMAT(a.work_date, '%Y-%m-%d') AS date,
             TIME_FORMAT(a.available_from, '%H:%i') AS availableFrom,
             TIME_FORMAT(a.available_to, '%H:%i') AS availableTo,
             a.is_unavailable AS dayOff
      FROM availability a
      JOIN employees e ON e.id = a.employee_id AND e.company_id = a.company_id
      WHERE a.company_id = ?
        AND a.work_date BETWEEN ? AND ?
      ORDER BY a.work_date, a.is_unavailable, a.available_from, e.name
    `,
      [company.id, firstDate, lastDate],
    );

    res.json({ entries });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Nepavyko įkelti prieinamumo." });
  }
});

app.listen(3000, () => {
  console.log("Atidaryk http://localhost:3000");
});
