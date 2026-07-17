'use client';

// Users admin: table + inline edit + create form. Mutations via admin actions
// (server re-checks the ADMIN role on every call).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setUserActiveAction, upsertUserAction } from '@/app/actions/admin-actions';
import { ROLES } from '@/lib/domain';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  active: boolean;
  createdAt: string;
}

export function UsersPanel({
  users,
  departments,
  selfId,
}: {
  users: UserDto[];
  departments: string[];
  selfId: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  self={u.id === selfId}
                  departments={departments}
                  editing={editing === u.id}
                  onEdit={() => setEditing(editing === u.id ? null : u.id)}
                  onDone={() => setEditing(null)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {creating ? (
        <div className="card p-5 max-w-2xl">
          <p className="micro-label mb-4">New user</p>
          <UserForm departments={departments} onDone={() => setCreating(false)} />
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          Add user
        </button>
      )}
    </div>
  );
}

function UserRow({
  user, self, departments, editing, onEdit, onDone,
}: {
  user: UserDto; self: boolean; departments: string[];
  editing: boolean; onEdit: () => void; onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <tr style={user.active ? undefined : { opacity: 0.5 }}>
        <td className="font-medium whitespace-nowrap">{user.name}{self && <span className="micro-label ml-2">you</span>}</td>
        <td className="mono text-[12px]">{user.email}</td>
        <td><span className="badge bg-white">{user.role.replace('_', ' ')}</span></td>
        <td>{user.department ?? '—'}</td>
        <td className="mono text-[11px]">{user.active ? 'Active' : 'Inactive'}</td>
        <td className="whitespace-nowrap text-right">
          <button type="button" className="btn btn-outline mr-2" style={{ padding: '4px 12px', fontSize: 12 }} onClick={onEdit}>
            {editing ? 'Close' : 'Edit'}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '4px 12px', fontSize: 12 }}
            disabled={pending || (self && user.active)}
            title={self && user.active ? 'You cannot deactivate yourself' : undefined}
            onClick={() =>
              startTransition(async () => {
                const res = await setUserActiveAction(user.id, !user.active);
                if (!res.ok) setError(res.error ?? 'Failed');
                else router.refresh();
              })
            }
          >
            {user.active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
      {(editing || error) && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--panel)' }}>
            {error && <p className="text-[12.5px] mb-2" style={{ color: 'var(--danger)' }}>{error}</p>}
            {editing && <UserForm departments={departments} user={user} onDone={onDone} />}
          </td>
        </tr>
      )}
    </>
  );
}

function UserForm({
  user, departments, onDone,
}: {
  user?: UserDto; departments: string[]; onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    startTransition(async () => {
      const res = await upsertUserAction(fd);
      if (!res.ok) {
        setError(res.error ?? 'Failed');
      } else {
        setError(null);
        onDone();
        router.refresh();
      }
    });
  }

  return (
    <form action={submit} className="grid grid-cols-2 md:grid-cols-3 gap-3 py-2">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div>
        <label className="field-label" htmlFor={`name-${user?.id ?? 'new'}`}>Name</label>
        <input id={`name-${user?.id ?? 'new'}`} name="name" required defaultValue={user?.name} className="input" />
      </div>
      <div>
        <label className="field-label" htmlFor={`email-${user?.id ?? 'new'}`}>Email</label>
        <input id={`email-${user?.id ?? 'new'}`} name="email" type="email" required defaultValue={user?.email} className="input" />
      </div>
      <div>
        <label className="field-label" htmlFor={`role-${user?.id ?? 'new'}`}>Role</label>
        <select id={`role-${user?.id ?? 'new'}`} name="role" defaultValue={user?.role ?? 'ORIGINATOR'} className="input">
          {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor={`dept-${user?.id ?? 'new'}`}>Department</label>
        <select id={`dept-${user?.id ?? 'new'}`} name="department" defaultValue={user?.department ?? ''} className="input">
          <option value="">—</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor={`pw-${user?.id ?? 'new'}`}>
          {user ? 'Password (blank = keep)' : 'Password'}
        </label>
        <input id={`pw-${user?.id ?? 'new'}`} name="password" type="password" className="input"
          required={!user} minLength={6} autoComplete="new-password" />
      </div>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : user ? 'Save' : 'Create'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onDone}>Cancel</button>
      </div>
      {error && <p className="col-span-full text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</p>}
    </form>
  );
}
