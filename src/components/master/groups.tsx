"use client";

import { useState, useTransition } from "react";
import { deleteGroupAction, saveGroupAction } from "@/app/actions/master";
import { Alert, Button, Card, Checkbox, Empty, Field, Input } from "@/components/ui";
import { ConfirmButton } from "@/components/ui/client";
import { toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";

const g = t.groups;

interface Group {
  id: string;
  name: string;
  memberIds: string[];
}

function GroupEditor({ group, students, onClose }: { group: Group | null; students: { id: string; fullName: string }[]; onClose: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const [members, setMembers] = useState(new Set(group?.memberIds ?? []));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card title={group ? t.common.edit : g.add}>
      <form
        className="space-y-4"
        action={() => {
          setError(null);
          start(async () => {
            const r = await saveGroupAction(group?.id ?? null, name, [...members]);
            if (r.error) setError(r.error);
            else onClose();
          });
        }}
      >
        {error && <Alert>{error}</Alert>}
        <Field label={g.name} htmlFor="group-name">
          <Input id="group-name" required value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{g.manageMembers}</legend>
          {students.length === 0 ? (
            <p className="text-sm text-muted">{t.students.empty}</p>
          ) : (
            <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {students.map((s) => (
                <Checkbox
                  key={s.id}
                  label={s.fullName}
                  checked={members.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(members);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setMembers(next);
                  }}
                />
              ))}
            </div>
          )}
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
          <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        </div>
      </form>
    </Card>
  );
}

export function GroupsManager({ groups, students }: { groups: Group[]; students: { id: string; fullName: string }[] }) {
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  return (
    <div className="space-y-4">
      {editing ? (
        <GroupEditor group={editing === "new" ? null : editing} students={students} onClose={() => setEditing(null)} />
      ) : (
        <Button onClick={() => setEditing("new")}>{g.add}</Button>
      )}
      {groups.length === 0 && !editing ? (
        <Empty title={g.empty} hint={g.emptyHint} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <li key={group.id} className="rounded-xl border border-line p-4">
              <p className="font-medium">{group.name}</p>
              <p className="mt-1 text-sm text-muted">{toFaDigits(g.membersCount(group.memberIds.length))}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="min-h-9" onClick={() => setEditing(group)}>{t.common.edit}</Button>
                <ConfirmButton label={t.common.delete} message={g.deleteConfirm} action={() => deleteGroupAction(group.id)} className="min-h-9" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
