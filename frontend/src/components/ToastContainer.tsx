import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useToasts } from '@/lib/toast';

export function ToastContainer() {
  const toasts = useToasts();

  const getClassnames = (type: 'success' | 'error' | 'info') => {
    switch (type) {
      case 'success':
        return 'bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.3)] text-nereus-accent';
      case 'error':
        return 'bg-[rgba(255,107,53,0.1)] border border-[rgba(255,107,53,0.3)] text-nereus-orange';
      case 'info':
      default:
        return 'bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.3)] text-nereus-accent';
    }
  };

  const getIcon = (type: 'success' | 'error' | 'info') => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-[14px] w-[14px]" />;
      case 'error':
        return <AlertCircle className="h-[14px] w-[14px]" />;
      case 'info':
      default:
        return <Info className="h-[14px] w-[14px]" />;
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-50 space-y-1.5 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-3 py-2 text-[12px] font-medium flex items-center gap-1.5 animate-slide-up pointer-events-auto ${getClassnames(
            toast.type,
          )}`}
          style={{ borderRadius: '2px' }}
        >
          {getIcon(toast.type)}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
