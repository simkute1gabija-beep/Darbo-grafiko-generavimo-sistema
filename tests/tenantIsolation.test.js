const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/database");

test("CoffeePoint ir UrbanStyle mato tik savo darbuotojus", async () => {
  try {
    const [companies] = await db.execute(
      "SELECT id, name, access_key FROM companies WHERE name IN (?, ?)",
      ["CoffeePoint", "UrbanStyle"],
    );

    assert.deepEqual(companies.map(({ name }) => name).sort(), [
      "CoffeePoint",
      "UrbanStyle",
    ]);

    for (const company of companies) {
      const [ownEmployees] = await db.execute(
        "SELECT id FROM employees WHERE company_id = ?",
        [company.id],
      );
      assert.ok(
        ownEmployees.length > 0,
        `${company.name} DB turi turėti darbuotojų.`,
      );

      const response = await fetch("http://localhost:3000/api/company", {
        headers: { "X-Demo-Key": company.access_key },
        signal: AbortSignal.timeout(5000),
      });

      assert.equal(
        response.status,
        200,
        `Nepavyko įkelti ${company.name} duomenų.`,
      );
      const result = await response.json();

      assert.equal(result.companyName, company.name);
      assert.deepEqual(
        result.employees.map(({ id }) => String(id)).sort(),
        ownEmployees.map(({ id }) => String(id)).sort(),
        `${company.name} turi gauti tik savo darbuotojų ID.`,
      );
    }
  } finally {
    await db.end();
  }
});
