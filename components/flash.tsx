export function Flash({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return (
    <div className="space-y-2">
      {success && (
        <div className="rounded-md border border-success/30 bg-success/10 text-success-foreground text-sm px-3 py-2">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
