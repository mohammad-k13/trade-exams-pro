import { listQuestions } from "@/server/questions";
import type { MasterActor } from "@/server/authz";
import { listGroups, listStudents } from "@/server/students";

export async function loadBuilderOptions(master: MasterActor) {
  const [questions, groups, students] = await Promise.all([listQuestions(master), listGroups(master), listStudents(master)]);
  return {
    questions: questions.map((q) => ({ id: q.id, title: q.title, type: q.type, topics: q.topics.map((x) => x.topic.name) })),
    groups: groups.map((g) => ({ id: g.id, name: g.name, count: g.members.length })),
    students: students.filter((s) => s.isActive).map((s) => ({ id: s.id, fullName: s.fullName })),
  };
}
