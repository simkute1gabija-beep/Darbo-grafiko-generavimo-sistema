function timeToMinutes(time) {
  // Pvz., '13:30' padalijame į '13' ir '30'.
  const parts = time.split(":");

  // Tekstą paverčiame skaičiais.
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  // 13 * 60 + 30 = 810 minučių nuo vidurnakčio.
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minutesText = String(minutes % 60).padStart(2, "0");
  return `${hours}:${minutesText}`;
}

function findBestShift(
  day,
  missing,
  assignedEmployeeIds,
  hoursByEmployee,
  minimum,
  maximum,
) {
  let bestShift = null;

  for (const employee of day.employees) {
    if (employee.dayOff === true || assignedEmployeeIds.has(employee.id)) {
      continue;
    }

    const assignedHours =
      hoursByEmployee.get(employee.id) ?? employee.assignedHours ?? 0;

    
    let remainingMinutes = Infinity;
    if (employee.monthlyHours !== undefined) {
      remainingMinutes = Math.round(
        (employee.monthlyHours - assignedHours) * 60,
      );
    }

    // Tuščias prieinamumas reiškia, kad tinka visas darbo laikas.
    const availableStart = timeToMinutes(employee.availableFrom || day.open);
    const availableEnd = timeToMinutes(employee.availableTo || day.close);
    const firstStart = Math.max(availableStart, timeToMinutes(day.open));
    const lastEnd = Math.min(availableEnd, timeToMinutes(day.close));

    // 360 min. = 6 val., 480 min. = 8 val.
    let regularMaximum;

    if (employee.employmentFraction < 1) {
      regularMaximum = 360; // 6 val.
    } else {
      regularMaximum = 480; // 8 val.
    }

    
    let shiftMaximum;

    if (maximum === Infinity) {
      shiftMaximum = regularMaximum;
    } else {
      shiftMaximum = maximum;
    }

    
    for (let start = firstStart; start + minimum <= lastEnd; start++) {
      const latestEnd = Math.min(
        lastEnd,
        start + remainingMinutes,
        start + shiftMaximum,
      );
      if (latestEnd < start + minimum) {
        continue;
      }

      let coveredMinutes = 0;
      let end = start + minimum;

      for (let minute = start; minute < latestEnd; minute++) {
        if (missing[minute] > 0) {
          coveredMinutes++;
          // Pamaina trunka bent minimumą ir gali tęstis iki paskutinės
          // minutės, kurią darbuotoja dar padeda padengti.
          end = Math.max(end, minute + 1);
        }
      }

      if (coveredMinutes === 0) {
        continue;
      }

      const availability = lastEnd - firstStart;
      const coversMore =
        bestShift === null || coveredMinutes > bestShift.coveredMinutes;
      let winsTie = false;

      if (bestShift !== null && coveredMinutes === bestShift.coveredMinutes) {
        if (remainingMinutes > bestShift.remainingMinutes) {
          winsTie = true;
        } else if (remainingMinutes === bestShift.remainingMinutes) {
          winsTie = availability < bestShift.availability;
        }
      }
      if (coversMore || winsTie) {
        bestShift = {
          employee,
          start,
          end,
          coveredMinutes,
          availability,
          remainingMinutes,
          assignedHours,
        };
      }
    }
  }

  return bestShift;
}
function hasWorkedPreviousFiveDays(employeeId, date, shifts) {
  const previousDay = new Date(date + "T00:00:00Z");

  for (let i = 0; i < 5; i++) {
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    const previousDate = previousDay.toISOString().slice(0, 10);

    const worked = shifts.some((shift) => {
      return shift.employeeId === employeeId && shift.date === previousDate;
    });

    if (!worked) {
      return false;
    }
  }
  return true;
}

function reduceStaffingShortage(missing, start, end) {
  for (let minute = start; minute < end; minute++) {
    missing[minute] = Math.max(0, missing[minute] - 1);
  }
}

function generateSchedule(days, previousShifts = []) {
  const schedule = [];
  const shifts = [];
  const hoursByEmployee = new Map();

  const sortedDays = days.slice().sort((first, second) => {
    return first.date.localeCompare(second.date);
  });

  for (const day of sortedDays) {
    if (day.intervals.length === 0) {
      continue;
    }

    const intervals = day.intervals.slice();
    intervals.sort((first, second) => first.start.localeCompare(second.start));

    // Jei demo duomenyse nėra atskirų darbo valandų, naudojame poreikio ribas.
    const firstInterval = intervals[0];
    const lastInterval = intervals[intervals.length - 1];
    const shiftHistory = previousShifts.concat(shifts);

    const eligibleEmployees = day.employees.filter((employee) => {
      return !hasWorkedPreviousFiveDays(employee.id, day.date, shiftHistory);
    });
    const workDay = {
      ...day,
      employees: eligibleEmployees,
      open: day.open || firstInterval.start,
      close: day.close || lastInterval.end,
    };

    
    const missing = new Array(1440).fill(0);
    const assignedEmployeeIds = new Set();

    for (const interval of intervals) {
      const start = timeToMinutes(interval.start);
      const end = timeToMinutes(interval.end);

      for (let minute = start; minute < end; minute++) {
        missing[minute] = interval.required;
      }
    }

    const fixedShifts = day.fixedShifts ?? [];

    for (const fixedShift of fixedShifts) {
      const start = timeToMinutes(fixedShift.start);
      const end = timeToMinutes(fixedShift.end);

      shifts.push({
        date: day.date,
        employeeId: fixedShift.employeeId,
        name: fixedShift.name,
        start: fixedShift.start,
        end: fixedShift.end,
      });

      assignedEmployeeIds.add(fixedShift.employeeId);

      const previousHours =
        hoursByEmployee.get(fixedShift.employeeId) ??
        fixedShift.assignedHours ??
        0;
      const shiftMinutes = end - start;
      const breakMinutes = shiftMinutes === 540 ? 60 : 0;
      hoursByEmployee.set(
        fixedShift.employeeId,
        previousHours + (shiftMinutes - breakMinutes) / 60,
      );

      // Įprasto darbuotojo fiksuota pamaina poreikį dengia iš karto.
      if (fixedShift.isReserve !== true) {
        reduceStaffingShortage(missing, start, end);
      }
    }

    const shiftAssignmentStages = [
      { minimum: 240, maximum: Infinity }, // Įprastos pamainos iki 6 arba 8 val.
      { minimum: 240, maximum: 480 }, // Jei lieka trūkumas, galima iki 8 val.
      { minimum: 180, maximum: 239 }, // 3 val. išimtis, jei vis dar trūksta.
    ];

    for (const stage of shiftAssignmentStages) {
      while (true) {
        const shift = findBestShift(
          workDay,
          missing,
          assignedEmployeeIds,
          hoursByEmployee,
          stage.minimum,
          stage.maximum,
        );

        if (shift === null) {
          break;
        }

        const employee = shift.employee;
        assignedEmployeeIds.add(employee.id);

        shifts.push({
          date: day.date,
          employeeId: employee.id,
          name: employee.name,
          start: minutesToTime(shift.start),
          end: minutesToTime(shift.end),
        });

        const shiftHours = (shift.end - shift.start) / 60;
        hoursByEmployee.set(employee.id, shift.assignedHours + shiftHours);

        reduceStaffingShortage(missing, shift.start, shift.end);
      }
    }

    for (const fixedShift of fixedShifts) {
      if (fixedShift.isReserve !== true) {
        continue;
      }

      const start = timeToMinutes(fixedShift.start);
      const end = timeToMinutes(fixedShift.end);

      reduceStaffingShortage(missing, start, end);
    }

    // Jei trūkumas pasikeičia viduryje intervalo, išveda atskiras jo dalis.
    for (const interval of intervals) {
      let start = timeToMinutes(interval.start);
      const end = timeToMinutes(interval.end);

      for (let minute = start + 1; minute <= end; minute++) {
        if (minute === end || missing[minute] !== missing[start]) {
          schedule.push({
            date: day.date,
            start: minutesToTime(start),
            end: minutesToTime(minute),
            missingEmployees: missing[start],
          });

          start = minute;
        }
      }
    }
  }

  return { schedule, shifts, hoursByEmployee };
}

module.exports = { generateSchedule };
