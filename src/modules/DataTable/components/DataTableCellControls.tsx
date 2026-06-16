import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ArrowUpDown, MessageSquare, Tag, X } from 'lucide-react';

export function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted) return <ArrowUpDown size={12} style={{ opacity: 0.3 }} />;
  if (sorted === 'asc') return <ArrowUp size={12} />;
  return <ArrowDown size={12} />;
}

export function TagPicker({
  structureId,
  currentTags,
  allTags,
  onToggle,
}: {
  structureId: number;
  currentTags: string[];
  allTags: { id: string; nameKey: string; color: string }[];
  onToggle: (id: number, tags: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos((prev) => {
      let { top, left } = prev;
      if (rect.right > vw - 8) left = left - (rect.right - vw + 8);
      if (rect.bottom > vh - 8 && triggerRef.current) {
        const triggerRect = triggerRef.current.getBoundingClientRect();
        top = triggerRect.top - rect.height - 4;
      }
      if (left < 8) left = 8;
      return { top, left };
    });
  }, [open]);

  const toggle = (tagId: string) => {
    const next = currentTags.includes(tagId)
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId];
    onToggle(structureId, next);
  };

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((v) => !v);
  };

  return (
    <div ref={triggerRef}>
      <div
        onClick={handleOpen}
        style={{
          display: 'flex', gap: 4, flexWrap: 'wrap', cursor: 'pointer',
          minHeight: 24, alignItems: 'center', padding: '2px 4px',
          borderRadius: 4, border: '1px solid transparent',
        }}
        title="点击编辑标签"
      >
        {currentTags.length === 0 && <Tag size={12} style={{ opacity: 0.3 }} />}
        {currentTags.map((tagId) => {
          const tag = allTags.find((t) => t.id === tagId);
          if (!tag) return null;
          return (
            <span
              key={tagId}
              className="tag-badge"
              style={{ background: `${tag.color}20`, color: tag.color, fontSize: 11 }}
            >
              {t(tag.nameKey)}
            </span>
          );
        })}
      </div>

      {open && createPortal(
        <div ref={dropdownRef} style={{
          position: 'fixed', top: pos.top, left: pos.left,
          zIndex: 9999,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 8, padding: 6, minWidth: 160,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {allTags.map((tag) => {
            const checked = currentTags.includes(tag.id);
            return (
              <label key={tag.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                fontSize: 12, color: 'var(--color-text)',
              }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(tag.id)}
                  style={{ accentColor: tag.color }}
                />
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: tag.color, flexShrink: 0,
                }} />
                {t(tag.nameKey)}
              </label>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function NotesEditor({
  structureId,
  currentNotes,
  onSave,
}: {
  structureId: number;
  currentNotes: string;
  onSave: (id: number, notes: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(currentNotes);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const outsidePopup = popupRef.current && !popupRef.current.contains(target);
      const outsideTrigger = triggerRef.current && !triggerRef.current.contains(target);
      if (outsidePopup && outsideTrigger) {
        onSave(structureId, text);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, text, structureId, onSave]);

  useEffect(() => {
    if (!open || !popupRef.current || !triggerRef.current) return;
    const popupRect = popupRef.current.getBoundingClientRect();
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    if (popupRect.bottom > vh - 8) {
      setPos((prev) => ({
        ...prev,
        top: triggerRect.top - popupRect.height - 4,
      }));
    }
  }, [open]);

  const handleOpen = () => {
    setText(currentNotes);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="btn btn-ghost btn-sm"
        onClick={handleOpen}
        title={currentNotes || '添加备注'}
        style={{ padding: '2px 6px', color: currentNotes ? 'var(--color-primary)' : undefined }}
      >
        <MessageSquare size={14} />
      </button>

      {open && createPortal(
        <div ref={popupRef} style={{
          position: 'fixed', top: pos.top, right: pos.right,
          zIndex: 9999,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 8, padding: 10, width: 240,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>EA{structureId} 备注</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                onSave(structureId, text);
                setOpen(false);
              }}
              style={{ padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="写点备注..."
            rows={3}
            autoFocus
            style={{
              width: '100%', padding: 8, borderRadius: 6, fontSize: 12,
              border: '1px solid var(--color-border)', resize: 'vertical',
              background: 'var(--color-bg)', color: 'var(--color-text)',
              boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
