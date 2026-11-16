const test = require("node:test");
const assert = require("node:assert/strict");
const { generateSchedule } = require("../src/scheduleGenerator");

test("Įprastas atvejis: spalio 1 d. paskiriamos Ema ir Emilija", () => {
  const date = "2026-10-01";
  const result = generateSchedule([
    {
      date,
      open: "10:00",
      close: "20:00",
      employees: [
        {
          id: 1,
          name: "Emilija",
          availableFrom: "10:00",
          availableTo: "20:00",
        },
        { id: 2, name: "Ema", availableFrom: "10:00", availableTo: "14:00" },
      ],
      intervals: [{ start: "10:00", end: "13:00", required: 2 }],
      fixedShifts: [
        {
          employeeId: 3,
          name: "Vadovas",
          start: "08:00",
          end: "17:00",
          isReserve: true,
        },
      ],
    },
  ]);

  const byEmployee = result.shifts
    .slice()
    .sort((a, b) => a.employeeId - b.employeeId);
  assert.deepEqual(byEmployee, [
    { date, employeeId: 1, name: "Emilija", start: "10:00", end: "14:00" },
    { date, employeeId: 2, name: "Ema", start: "10:00", end: "14:00" },
    { date, employeeId: 3, name: "Vadovas", start: "08:00", end: "17:00" },
  ]);
  assert.deepEqual(result.schedule, [
    { date, start: "10:00", end: "13:00", missingEmployees: 0 },
  ]);
});

test("Ribinis atvejis: spalio 2 d. Ema pasiekia 84 val. normą", () => {
  const date = "2026-10-02";
  const result = generateSchedule([
    {
      date,
      employees: [
        {
          id: 2,
          name: "Ema",
          availableFrom: "10:00",
          availableTo: "16:00",
          employmentFraction: 0.5,
          assignedHours: 80,
          monthlyHours: 84,
        },
      ],
      intervals: [{ start: "10:00", end: "16:00", required: 1 }],
    },
  ]);

  assert.deepEqual(result.shifts, [
    { date, employeeId: 2, name: "Ema", start: "10:00", end: "14:00" },
  ]);
  assert.equal(result.hoursByEmployee.get(2), 84);
  assert.deepEqual(result.schedule, [
    { date, start: "10:00", end: "14:00", missingEmployees: 0 },
    { date, start: "14:00", end: "16:00", missingEmployees: 1 },
  ]);
});

test("Neįmanomas poreikis: spalio 3 d. trūksta vieno darbuotojo", () => {
  const date = "2026-10-03";
  const result = generateSchedule([
    {
      date,
      employees: [
        {
          id: 1,
          name: "Emilija",
          availableFrom: "16:00",
          availableTo: "20:00",
        },
        { id: 2, name: "Ema", availableFrom: "16:00", availableTo: "20:00" },
      ],
      intervals: [{ start: "16:00", end: "20:00", required: 3 }],
    },
  ]);

  const byEmployee = result.shifts
    .slice()
    .sort((a, b) => a.employeeId - b.employeeId);
  assert.deepEqual(byEmployee, [
    { date, employeeId: 1, name: "Emilija", start: "16:00", end: "20:00" },
    { date, employeeId: 2, name: "Ema", start: "16:00", end: "20:00" },
  ]);
  assert.deepEqual(result.schedule, [
    { date, start: "16:00", end: "20:00", missingEmployees: 1 },
  ]);
});
