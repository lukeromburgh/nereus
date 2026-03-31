import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useToasts } from '@/lib/toast';

export function ToastContainer() {
  const toasts = useToasts();

  const getClassnames = (type: 'success' | 'error' | 'info') => {
    switch (type) {
      case 'success':
        return 'bg-accent-emerald/20 border border-accent-emerald/50 text-accent-emerald';
      case 'error':
        return 'bg-accent-rose/20 border border-accent-rose/50 text-accent-rose';
      case 'info':
      default:
        return 'bg-accent-cyan/20 border border-accent-cyan/50 text-accent-cyan';
    }
  };

  const getIcon = (type: 'success' | 'error' | 'info') => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      case 'info':
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-md px-4 py-2.5 text-sm font-medium flex items-center gap-2 animate-slide-up pointer-events-auto ${getClassnames(
            toast.type,
          )}`}
        >
          {getIcon(toast.type)}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
