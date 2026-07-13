import { Alert } from "@/components/ui/alert";

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <Alert variant="destructive" className="flex items-start justify-between gap-4">
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-sm underline underline-offset-2"
        >
          Dismiss
        </button>
      )}
    </Alert>
  );
}
