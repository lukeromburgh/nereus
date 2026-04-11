import { useRef, useEffect, useState } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}

export default function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  loading = false,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-nereus-panel border border-[rgba(255,255,255,0.08)] w-full max-w-md p-4" style={{ borderRadius: '2px' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-medium text-[rgba(255,255,255,0.85)]">{title}</h3>
          <button
            onClick={onClose}
            className="text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.6)] transition-colors"
          >
            <X className="h-[14px] w-[14px]" />
          </button>
        </div>

        <p className="text-[11px] text-[rgba(255,255,255,0.5)] mb-5 leading-relaxed whitespace-pre-line">
          {message}
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-[11px] text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.8)] border border-[rgba(255,255,255,0.08)] transition-colors" style={{ borderRadius: '2px' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-2.5 py-1 text-[11px] font-medium text-white bg-nereus-orange hover:bg-[#ff8355] transition-colors disabled:opacity-50" style={{ borderRadius: '2px' }}
          >
            {loading ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
