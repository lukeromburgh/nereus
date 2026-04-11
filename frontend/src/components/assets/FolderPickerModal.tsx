import { useEffect, useRef, useState } from "react";
import { ChevronRight, Folder as FolderIcon, X } from "lucide-react";
import type { Folder } from "../../types/assets";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (folderId: number | null) => void;
  folders: Folder[];
  excludeId?: number;
  title?: string;
}

function FolderNode({
  folder,
  depth,
  onSelect,
  excludeId,
}: {
  folder: Folder;
  depth: number;
  onSelect: (id: number) => void;
  excludeId?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  if (folder.id === excludeId) return null;
  return (
    <div>
      <button
        onClick={() => onSelect(folder.id)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {folder.children.length > 0 ? (
          <ChevronRight
            className={`h-[10px] w-[10px] text-[rgba(255,255,255,0.3)] transition-transform ${expanded ? "rotate-90" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          />
        ) : (
          <span className="w-[10px]" />
        )}
        <FolderIcon className="h-[14px] w-[14px] text-[#fbbf24]" />
        <span className="truncate">{folder.name}</span>
      </button>
      {expanded &&
        folder.children
          .filter((c) => c.id !== excludeId)
          .map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              onSelect={onSelect}
              excludeId={excludeId}
            />
          ))}
    </div>
  );
}

export default function FolderPickerModal({
  open,
  onClose,
  onSelect,
  folders,
  excludeId,
  title = "Move to...",
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
      <div className="bg-nereus-panel border border-[rgba(255,255,255,0.08)] w-full max-w-sm p-3" style={{ borderRadius: '2px' }}>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[12px] font-medium text-[rgba(255,255,255,0.85)]">{title}</h3>
          <button
            onClick={onClose}
            className="text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.6)] transition-colors"
          >
            <X className="h-[14px] w-[14px]" />
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.2)] p-1 mb-2.5" style={{ borderRadius: '2px' }}>
          <button
            onClick={() => onSelect(null)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
          >
            <FolderIcon className="h-[14px] w-[14px] text-[rgba(255,255,255,0.4)]" />
            <span>Project Root</span>
          </button>
          {folders.map((f) => (
            <FolderNode
              key={f.id}
              folder={f}
              depth={1}
              onSelect={onSelect}
              excludeId={excludeId}
            />
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-[11px] text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.8)] border border-[rgba(255,255,255,0.08)] transition-colors" style={{ borderRadius: '2px' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
