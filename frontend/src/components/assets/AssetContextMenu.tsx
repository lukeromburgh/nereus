import { useEffect, useRef } from "react";
import {
  FolderPlus,
  Pencil,
  FolderInput,
  Trash2,
  ExternalLink,
} from "lucide-react";

export interface ContextMenuAction {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface Props {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function getItemActions(opts: {
  type: "folder" | "asset";
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onOpen?: () => void;
  onNewFolder?: () => void;
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];

  if (opts.type === "folder" && opts.onNewFolder) {
    actions.push({
      label: "New Folder Inside",
      icon: FolderPlus,
      onClick: opts.onNewFolder,
    });
  }

  actions.push({ label: "Rename", icon: Pencil, onClick: opts.onRename });
  actions.push({ label: "Move to...", icon: FolderInput, onClick: opts.onMove });

  if (opts.type === "asset" && opts.onOpen) {
    actions.push({
      label: "Open in Simulation",
      icon: ExternalLink,
      onClick: opts.onOpen,
      divider: true,
    });
  }

  actions.push({
    label: "Delete",
    icon: Trash2,
    onClick: opts.onDelete,
    danger: true,
    divider: actions[actions.length - 1]?.divider !== true,
  });

  return actions;
}

export function getBackgroundActions(opts: {
  onNewFolder: () => void;
}): ContextMenuAction[] {
  return [
    {
      label: "New Folder",
      icon: FolderPlus,
      onClick: opts.onNewFolder,
    },
  ];
}

export default function AssetContextMenu({ x, y, actions, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Adjust position so menu stays within viewport
  const style: React.CSSProperties = {
    left: x,
    top: y,
  };

  return (
    <div
      ref={ref}
      style={{ ...style, borderRadius: "2px" }}
      className="fixed z-50 bg-nereus-panel border border-[rgba(255,255,255,0.08)] py-1 min-w-[160px]"
    >
      {actions.map((action, i) => {
        const Icon = action.icon;
        return (
          <div key={i}>
            {action.divider && i > 0 && (
              <div className="border-t border-[rgba(255,255,255,0.06)] my-1" />
            )}
            <button
              onClick={() => {
                action.onClick();
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors ${
                action.danger
                  ? "text-nereus-orange hover:bg-[rgba(255,107,53,0.08)]"
                  : "text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.04)]"
              }`}
            >
              <Icon className="h-[14px] w-[14px]" />
              {action.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
