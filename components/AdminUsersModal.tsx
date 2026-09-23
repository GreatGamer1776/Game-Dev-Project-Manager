import React, { useCallback, useEffect, useState } from 'react';
import { Shield, ShieldCheck, KeyRound, Trash2, UserPlus, RefreshCw } from 'lucide-react';
import { Modal, Button, Input, Field } from './ui';
import { api, AdminUser, ApiError } from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';

interface AdminUsersModalProps {
  open: boolean;
  onClose: () => void;
}

const AdminUsersModal: React.FC<AdminUsersModalProps> = ({ open, onClose }) => {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.adminListUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void refresh();
      setNewUsername('');
      setNewPassword('');
      setNewIsAdmin(false);
    }
  }, [open, refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await api.adminCreateUser(newUsername.trim(), newPassword, newIsAdmin);
      setNewUsername('');
      setNewPassword('');
      setNewIsAdmin(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create user.');
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    const password = prompt(`New password for ${user.username} (min 8 characters):`);
    if (password === null) return;
    try {
      await api.adminUpdateUser(user.id, { password });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password.');
    }
  };

  const handleToggleAdmin = async (user: AdminUser) => {
    try {
      await api.adminUpdateUser(user.id, { isAdmin: !user.isAdmin });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update user.');
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`Delete ${user.username}? All of their projects will be permanently deleted.`)) return;
    try {
      await api.adminDeleteUser(user.id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete user.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage Users"
      description="Accounts are invite-only — create them here."
      size="lg"
    >
      <form onSubmit={handleCreate} className="flex items-end gap-2 pb-4 border-b border-border">
        <Field label="Username" htmlFor="new-username" className="flex-1">
          <Input
            id="new-username"
            required
            minLength={3}
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="username"
          />
        </Field>
        <Field label="Password" htmlFor="new-password" className="flex-1">
          <Input
            id="new-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="min 8 characters"
          />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={newIsAdmin}
            onChange={(e) => setNewIsAdmin(e.target.checked)}
            className="accent-accent"
          />
          Admin
        </label>
        <Button type="submit" size="md" icon={UserPlus} disabled={creating}>
          Add
        </Button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
        {loading && users.length === 0 ? (
          <p className="text-sm text-faint py-4 text-center">Loading users…</p>
        ) : (
          users.map((user) => {
            const isSelf = user.id === currentUser?.id;
            return (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-content truncate">
                      {user.username}
                      {isSelf && <span className="text-faint"> (you)</span>}
                    </span>
                    {user.isAdmin && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        <ShieldCheck className="w-3 h-3" /> admin
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-faint">
                    Created {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleResetPassword(user)}
                  title="Reset password"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                </Button>
                {!isSelf && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleAdmin(user)}
                      title={user.isAdmin ? 'Remove admin' : 'Make admin'}
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(user)}
                      title="Delete user"
                      className="hover:text-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 flex justify-between items-center">
        <p className="text-xs text-faint">{users.length} account{users.length === 1 ? '' : 's'}</p>
        <Button variant="subtle" size="sm" icon={RefreshCw} onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>
    </Modal>
  );
};

export default AdminUsersModal;
