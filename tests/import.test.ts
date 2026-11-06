import { beforeEach, describe, expect, it } from "vitest";
import { login } from "@/server/auth";
import { db } from "@/server/db";
import { createStudent, importStudents } from "@/server/students";
import { makeInstitute, resetDb } from "./helpers";

beforeEach(resetDb);

describe("student CSV import", () => {
  it("creates valid rows, reports bad ones by row, and creates groups", async () => {
    const { master } = await makeInstitute();
    const csv = [
      "full_name,username,phone,group",
      "علی رضایی,ali.rezaei,۰۹۱۲۱۲۳۴۵۶۷,کلاس الف",
      "بدون نام کاربری,,,",
      '"نام، با کاما",sara_1,,کلاس الف',
      "تکراری,ali.rezaei,,",
      "موبایل بد,bad.phone,123,",
    ].join("\n");
    const r = await importStudents(master, csv);
    expect(r.created.map((c) => c.username)).toEqual(["ali.rezaei", "sara_1"]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 5, 6]);
    const group = await db.group.findFirstOrThrow({ where: { name: "کلاس الف" }, include: { members: true } });
    expect(group.organizationId).toBe(master.organizationId);
    expect(group.members).toHaveLength(2);
    const ali = await db.user.findUniqueOrThrow({ where: { username: "ali.rezaei" } });
    expect(ali.phone).toBe("09121234567");
    expect(ali.mustChangePassword).toBe(true);
  });

  it("returns temp passwords that work, and stores only hashes", async () => {
    const { master } = await makeInstitute();
    const r = await importStudents(master, "full_name,username\nعلی,ali.test");
    const { tempPassword } = r.created[0];
    const u = await db.user.findUniqueOrThrow({ where: { username: "ali.test" } });
    expect(u.passwordHash).not.toContain(tempPassword);
    await expect(login("ali.test", tempPassword, "1.1.1.1")).resolves.toBeTruthy();
  });

  it("rejects a file without the required columns, or an oversized one", async () => {
    const { master } = await makeInstitute();
    await expect(importStudents(master, "name,user\na,b")).rejects.toMatchObject({ status: 400 });
    const big = ["full_name,username", ...Array.from({ length: 501 }, (_, i) => `n,u${i}`)].join("\n");
    await expect(importStudents(master, big)).rejects.toMatchObject({ status: 400 });
  });

  it("names the field when a required value is missing", async () => {
    const { master } = await makeInstitute();
    await expect(createStudent(master, { fullName: "", username: "abc", phone: "", groupIds: [] })).rejects.toThrow(/نام و نام خانوادگی/);
  });
});
