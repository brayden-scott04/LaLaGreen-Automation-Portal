"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff, Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { changeOwnPassword, getCurrentUser } from "@/lib/actions/staff";
import { type Role, ROLE_LABELS } from "@/lib/roles";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Password input with its own show/hide toggle. Each field owns its reveal
 * state, so unmasking one doesn't unmask the others -- the point is to
 * check a single field you've just typed, not to expose the whole form.
 */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          // Room for the toggle so long values don't run underneath it.
          className="pr-9"
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-label={revealed ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [user, setUser] = useState<{ username: string; role: Role } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isOpen, setIsOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getCurrentUser().then((data) => {
      setUser(data);
      setIsLoading(false);
    });
  }, []);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  function close() {
    reset();
    setIsOpen(false);
  }

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm &&
    !isPending;

  function submit() {
    if (!canSubmit) return;
    setSuccess(false);
    startTransition(async () => {
      // `confirm` is a client-side typo guard only and is never sent.
      const { error } = await changeOwnPassword(current, next);
      if (error) {
        setError(error);
        return;
      }
      close();
      setSuccess(true);
    });
  }

  return (
    <>
      <PageHeader
        icon={SettingsIcon}
        title="Profile settings"
        description="Your account details and password"
      />

      <div className="max-w-xl space-y-6 p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Managed by an administrator</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-32" />
              </div>
            ) : !user ? (
              <p className="text-sm text-muted-foreground">Not signed in.</p>
            ) : (
              <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="text-foreground">{user.username}</dd>
                <dt className="text-muted-foreground">Role</dt>
                <dd className="text-foreground">{ROLE_LABELS[user.role]}</dd>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Changing this signs you out of nothing — your current session stays
              active, but the old password stops working immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success && !isOpen && (
              <div className="mb-4 rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
                Password updated. Use your new password next time you sign in.
              </div>
            )}

            {!isOpen ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSuccess(false);
                  setIsOpen(true);
                }}
              >
                Change password
              </Button>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <PasswordField
                  id="current-password"
                  label="Old password"
                  value={current}
                  onChange={setCurrent}
                  autoComplete="current-password"
                />
                <PasswordField
                  id="new-password"
                  label="New password"
                  value={next}
                  onChange={setNext}
                  autoComplete="new-password"
                />
                <PasswordField
                  id="confirm-password"
                  label="Confirm new password"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                />

                {tooShort && (
                  <p className="text-xs text-muted-foreground">
                    Must be at least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                )}
                {mismatch && (
                  <p className="text-xs text-destructive">
                    New passwords don&apos;t match.
                  </p>
                )}

                <div className="flex gap-2">
                  <Button onClick={submit} disabled={!canSubmit}>
                    {isPending ? "Updating…" : "Update password"}
                  </Button>
                  <Button variant="ghost" onClick={close} disabled={isPending}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
