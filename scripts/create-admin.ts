// Creates the system admin on a database that should not contain demo data.
// ADMIN_USERNAME=... ADMIN_PASSWORD=... npm run db:create-admin
import "dotenv/config"; // must stay first: the database client reads DATABASE_URL on import
import { password as passwordSchema, username as usernameSchema } from "../src/lib/schemas";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/passwords";

async function main() {
  const username = usernameSchema.safeParse(process.env.ADMIN_USERNAME);
  const password = passwordSchema.safeParse(process.env.ADMIN_PASSWORD);
  if (!username.success) throw new Error("Set ADMIN_USERNAME: 3 to 40 of a-z, 0-9, dot or underscore.");
  if (!password.success || password.data.length < 12) throw new Error("Set ADMIN_PASSWORD to at least 12 characters.");
  if (await db.user.findFirst({ where: { role: "ADMIN" } })) {
    console.log("An admin already exists; nothing changed.");
    return;
  }
  await db.user.create({
    data: { role: "ADMIN", username: username.data, fullName: "مدیر سیستم", passwordHash: await hashPassword(password.data) },
  });
  console.log(`Admin "${username.data}" created.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
