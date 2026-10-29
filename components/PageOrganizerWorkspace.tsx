'use client';

import React, { useState } from 'react';
import {
  RotateCw,
  RotateCcw,
  Trash2,
  Copy,
  ArrowLeft,
  ArrowRight,
  Plus,
  CheckSquare,
  Square,
  RefreshCw,
  FilePlus2,
  GripVertical,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { PageOrganizerInstruction } from '@/lib/pdf-engine-client';

export type OrganizerPageItem = PageOrganizerInstruction & {
  id?: string;
  thumbUrl?: string;
  label: string;
};

interface PageOrganizerWorkspaceProps {
  pages: OrganizerPageItem[];
  onChangePages: (pages: OrganizerPageItem[]) => void;
  onResetOriginal: () => void;
  onReplaceDocument: () => void;
  onCloseDocument: () => void;
  isRenderingThumbs?: boolean;
  defaultPageWidthPt?: number;
  defaultPageHeightPt?: number;
}

export function PageOrganizerWorkspace({
  pages,
  onChangePages,
  onResetOriginal,
  onReplaceDocument,
  onCloseDocument,
  isRenderingThumbs = false,
  defaultPageWidthPt = 612,
  defaultPageHeightPt = 792,
}: PageOrganizerWorkspaceProps) {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [insertModal, setInsertModal] = useState<{
    targetIdx: number;
    position: 'before' | 'after';
    orientation: 'portrait' | 'landscape';
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    indices: number[];
    isSingleRemaining: boolean;
  } | null>(null);

  const toggleSelect = (idx: number) => {
    setSelectedIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const selectAll = () => {
    if (selectedIndices.length === pages.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(pages.map((_, idx) => idx));
    }
  };

  const rotatePage = (idx: number, delta: number) => {
    const next = [...pages];
    const current = next[idx].extraRotation || 0;
    next[idx] = {
      ...next[idx],
      extraRotation: (current + delta + 360) % 360,
    };
    onChangePages(next);
  };

  const rotateSelected = (delta: number) => {
    const targets =
      selectedIndices.length > 0
        ? new Set(selectedIndices)
        : new Set(pages.map((_, i) => i));
    const next = pages.map((p, idx) =>
      targets.has(idx)
        ? {
            ...p,
            extraRotation: ((p.extraRotation || 0) + delta + 360) % 360,
          }
        : p
    );
    onChangePages(next);
  };

  const movePage = (fromIdx: number, toIdx: number) => {
    if (
      toIdx < 0 ||
      toIdx >= pages.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const next = [...pages];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onChangePages(next);
    setSelectedIndices([]);
  };

  const duplicatePage = (idx: number) => {
    const next = [...pages];
    const source = next[idx];
    next.splice(idx + 1, 0, {
      ...source,
      id: `dup-${Date.now()}-${Math.random()}`,
      label: `${source.label} (Copy)`,
    });
    onChangePages(next);
  };

  const handleInsertBlankConfirm = () => {
    if (!insertModal) return;
    const isLandscape = insertModal.orientation === 'landscape';
    const w = isLandscape
      ? Math.max(defaultPageWidthPt, defaultPageHeightPt)
      : Math.min(defaultPageWidthPt, defaultPageHeightPt);
    const h = isLandscape
      ? Math.min(defaultPageWidthPt, defaultPageHeightPt)
      : Math.max(defaultPageWidthPt, defaultPageHeightPt);

    const blankItem: OrganizerPageItem = {
      id: `blank-${Date.now()}-${Math.random()}`,
      type: 'blank',
      widthPt: w,
      heightPt: h,
      extraRotation: 0,
      label: `Blank Page (${isLandscape ? 'Landscape' : 'Portrait'})`,
    };

    const next = [...pages];
    const insertAt =
      insertModal.position === 'before'
        ? insertModal.targetIdx
        : insertModal.targetIdx + 1;
    next.splice(insertAt, 0, blankItem);
    onChangePages(next);
    setInsertModal(null);
  };

  const requestDeleteIndices = (indices: number[]) => {
    if (indices.length === 0) return;
    if (pages.length - indices.length < 1) {
      setDeleteConfirm({ indices, isSingleRemaining: true });
    } else {
      setDeleteConfirm({ indices, isSingleRemaining: false });
    }
  };

  const confirmDeletePages = () => {
    if (!deleteConfirm || deleteConfirm.isSingleRemaining) return;
    const toRemove = new Set(deleteConfirm.indices);
    const next = pages.filter((_, idx) => !toRemove.has(idx));
    onChangePages(next);
    setSelectedIndices([]);
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-4">
      {/* Top Batch Organizer Toolbar */}
      <div className="p-3 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C] text-[#18181B] dark:text-[#FAFAFA] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {selectedIndices.length === pages.length && pages.length > 0 ? (
              <CheckSquare className="w-3.5 h-3.5 text-[#B91C1C]" />
            ) : (
              <Square className="w-3.5 h-3.5 text-[#52525B]" />
            )}
            <span>
              {selectedIndices.length > 0
                ? `${selectedIndices.length} Selected`
                : `Select All (${pages.length})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => rotateSelected(-90)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#18181B] hover:bg-[#F4F4F5] dark:hover:bg-[#09090B] border border-[#E4E4E7] dark:border-[#3F3F46] text-[#18181B] dark:text-[#FAFAFA] rounded-lg whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>
              {selectedIndices.length > 0 ? 'Rotate Selected -90°' : 'Rotate All -90°'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => rotateSelected(90)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#18181B] hover:bg-[#F4F4F5] dark:hover:bg-[#09090B] border border-[#E4E4E7] dark:border-[#3F3F46] text-[#18181B] dark:text-[#FAFAFA] rounded-lg whitespace-nowrap shrink-0"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>
              {selectedIndices.length > 0 ? 'Rotate Selected +90°' : 'Rotate All +90°'}
            </span>
          </button>

          {selectedIndices.length > 0 && (
            <button
              type="button"
              onClick={() => requestDeleteIndices(selectedIndices)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#D64545]/10 hover:bg-[#D64545]/20 border border-[#D64545]/30 text-[#D64545] dark:text-[#F87171] rounded-lg whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedIndices.length})</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setInsertModal({
                targetIdx: Math.max(0, pages.length - 1),
                position: 'after',
                orientation: 'portrait',
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-[#18181B] hover:border-[#B91C1C] border border-[#E4E4E7] dark:border-[#3F3F46] text-[#18181B] dark:text-[#FAFAFA] rounded-lg whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-[#B91C1C]" />
            <span>Insert Blank Page</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedIndices([]);
              onResetOriginal();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#18181B] hover:bg-[#F4F4F5] dark:hover:bg-[#09090B] border border-[#E4E4E7] dark:border-[#3F3F46] text-[#52525B] dark:text-[#D4D4D8] rounded-lg whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Pages</span>
          </button>
        </div>
      </div>

      {/* Helper instruction strip */}
      <div className="flex items-center justify-between text-xs text-[#52525B] dark:text-[#D4D4D8] px-1">
        <span>
          Drag and drop any page card to reorder, or use the per-page controls below each thumbnail.
        </span>
        <span className="font-mono font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums">
          Total Output: {pages.length} {pages.length === 1 ? 'Page' : 'Pages'}
        </span>
      </div>

      {/* Responsive Thumbnail Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {pages.map((item, idx) => {
          const isSelected = selectedIndices.includes(idx);
          const isDragTarget = dragOverIdx === idx && draggedIdx !== idx;
          return (
            <div
              key={item.id || `${item.label}-${idx}`}
              draggable
              onDragStart={(e) => {
                setDraggedIdx(idx);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(idx));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverIdx !== idx) {
                  setDragOverIdx(idx);
                }
              }}
              onDragLeave={() => {
                if (dragOverIdx === idx) {
                  setDragOverIdx(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from =
                  draggedIdx !== null
                    ? draggedIdx
                    : Number(e.dataTransfer.getData('text/plain'));
                setDraggedIdx(null);
                setDragOverIdx(null);
                if (!Number.isNaN(from) && from !== idx) {
                  movePage(from, idx);
                }
              }}
              onDragEnd={() => {
                setDraggedIdx(null);
                setDragOverIdx(null);
              }}
              className={`group p-3 bg-[#FAFAFA] dark:bg-[#27272A] border rounded-xl flex flex-col justify-between space-y-2.5 transition-all select-none cursor-grab active:cursor-grabbing ${
                isDragTarget
                  ? 'border-2 border-[#B91C1C] ring-2 ring-[#B91C1C]/20 scale-[1.02]'
                  : isSelected
                  ? 'border-[#B91C1C] dark:border-[#EF4444] bg-[#FEF2F2]/40 dark:bg-[#B91C1C]/10'
                  : 'border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#A1A1AA]'
              }`}
            >
              {/* Card Header: Checkbox, Sequence Badge, Drag Grip */}
              <div className="flex items-center justify-between gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => toggleSelect(idx)}
                  aria-label={`Select page ${idx + 1}`}
                  className="inline-flex items-center gap-1.5 font-bold text-[#18181B] dark:text-[#FAFAFA]"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444]" />
                  ) : (
                    <Square className="w-4 h-4 text-[#71717A]" />
                  )}
                  <span className="tabular-nums">Page {idx + 1}</span>
                </button>
                <div className="flex items-center gap-1">
                  {item.extraRotation ? (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[#B91C1C]/15 text-[#B91C1C] dark:text-[#EF4444] rounded tabular-nums">
                      {item.extraRotation}°
                    </span>
                  ) : null}
                  <GripVertical className="w-3.5 h-3.5 text-[#71717A]" />
                </div>
              </div>

              {/* Page Thumbnail Container */}
              <div
                onClick={() => toggleSelect(idx)}
                className="aspect-[1/1.32] bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg flex items-center justify-center overflow-hidden p-2 shadow-2xs relative"
              >
                {item.type === 'blank' ? (
                  <div className="text-center space-y-1 p-2">
                    <FilePlus2 className="w-6 h-6 text-[#71717A] mx-auto" />
                    <div className="text-[11px] font-medium text-[#52525B] dark:text-[#D4D4D8]">
                      {item.label}
                    </div>
                    <div className="text-[10px] font-mono text-[#71717A] tabular-nums">
                      {item.widthPt || 612} × {item.heightPt || 792} pt
                    </div>
                  </div>
                ) : item.thumbUrl ? (
                  <img
                    src={item.thumbUrl}
                    alt={item.label}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    style={{
                      transform: `rotate(${item.extraRotation || 0}deg)`,
                    }}
                    className="w-full h-full object-contain transition-transform duration-150 select-none pointer-events-none"
                  />
                ) : isRenderingThumbs ? (
                  <div className="flex flex-col items-center gap-1.5 text-[11px] text-[#71717A]">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#B91C1C]" />
                    <span>Rendering...</span>
                  </div>
                ) : (
                  <div className="text-center space-y-1">
                    <span className="text-xs font-semibold text-[#52525B] dark:text-[#D4D4D8] block">
                      {item.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Source Label */}
              <div className="text-[11px] text-[#52525B] dark:text-[#D4D4D8] truncate text-center font-medium">
                {item.type === 'blank' ? item.label : `Source: ${item.label}`}
              </div>

              {/* Per-Page Action Bar */}
              <div className="flex items-center justify-between gap-1 pt-2 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => movePage(idx, idx - 1)}
                  title="Move Left"
                  aria-label={`Move page ${idx + 1} left`}
                  className="p-1.5 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#F4F4F5] dark:hover:bg-[#09090B] disabled:opacity-35"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => rotatePage(idx, -90)}
                  title="Rotate Counterclockwise (-90°)"
                  aria-label={`Rotate page ${idx + 1} counterclockwise`}
                  className="p-1.5 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#F4F4F5] dark:hover:bg-[#09090B]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => rotatePage(idx, 90)}
                  title="Rotate Clockwise (+90°)"
                  aria-label={`Rotate page ${idx + 1} clockwise`}
                  className="p-1.5 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#F4F4F5] dark:hover:bg-[#09090B]"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => duplicatePage(idx)}
                  title="Duplicate Page"
                  aria-label={`Duplicate page ${idx + 1}`}
                  className="p-1.5 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#F4F4F5] dark:hover:bg-[#09090B]"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setInsertModal({
                      targetIdx: idx,
                      position: 'after',
                      orientation: 'portrait',
                    })
                  }
                  title="Insert Blank Page Here"
                  aria-label={`Insert blank page near page ${idx + 1}`}
                  className="p-1.5 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#F4F4F5] dark:hover:bg-[#09090B]"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => requestDeleteIndices([idx])}
                  title="Delete Page"
                  aria-label={`Delete page ${idx + 1}`}
                  className="p-1.5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] text-[#D64545] rounded hover:bg-[#D64545]/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === pages.length - 1}
                  onClick={() => movePage(idx, idx + 1)}
                  title="Move Right"
                  aria-label={`Move page ${idx + 1} right`}
                  className="p-1.5 bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded hover:bg-[#F4F4F5] dark:hover:bg-[#09090B] disabled:opacity-35"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Insert Blank Page Modal */}
      {insertModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="insert-blank-title"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3
              id="insert-blank-title"
              className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]"
            >
              Insert Blank Page
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1.5">
                  Placement Position
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setInsertModal({ ...insertModal, position: 'before' })
                    }
                    className={`px-3 py-2 rounded-lg border font-semibold ${
                      insertModal.position === 'before'
                        ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                        : 'bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border-[#E4E4E7] dark:border-[#3F3F46]'
                    }`}
                  >
                    Before Page {insertModal.targetIdx + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setInsertModal({ ...insertModal, position: 'after' })
                    }
                    className={`px-3 py-2 rounded-lg border font-semibold ${
                      insertModal.position === 'after'
                        ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                        : 'bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border-[#E4E4E7] dark:border-[#3F3F46]'
                    }`}
                  >
                    After Page {insertModal.targetIdx + 1}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1.5">
                  Page Orientation
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setInsertModal({
                        ...insertModal,
                        orientation: 'portrait',
                      })
                    }
                    className={`px-3 py-2 rounded-lg border font-semibold ${
                      insertModal.orientation === 'portrait'
                        ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                        : 'bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border-[#E4E4E7] dark:border-[#3F3F46]'
                    }`}
                  >
                    Portrait
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setInsertModal({
                        ...insertModal,
                        orientation: 'landscape',
                      })
                    }
                    className={`px-3 py-2 rounded-lg border font-semibold ${
                      insertModal.orientation === 'landscape'
                        ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                        : 'bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border-[#E4E4E7] dark:border-[#3F3F46]'
                    }`}
                  >
                    Landscape
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
              <button
                type="button"
                onClick={() => setInsertModal(null)}
                className="px-3.5 py-2 text-xs font-semibold text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertBlankConfirm}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg"
              >
                Insert Blank Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Page / Single-Page Safeguard Modal */}
      {deleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-page-dialog-title"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#D64545]/15 text-[#D64545] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3
                  id="delete-page-dialog-title"
                  className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]"
                >
                  {deleteConfirm.isSingleRemaining
                    ? 'Cannot Delete the Only Remaining Page'
                    : `Delete ${deleteConfirm.indices.length} Selected ${
                        deleteConfirm.indices.length === 1 ? 'Page' : 'Pages'
                      }?`}
                </h3>
                <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                  {deleteConfirm.isSingleRemaining
                    ? 'A valid PDF document must contain at least one page. Would you like to replace this PDF with another file or close the current document?'
                    : `Page ${deleteConfirm.indices
                        .map((i) => i + 1)
                        .join(', ')} will be removed from the organized output sequence. You can restore all pages anytime using Reset Pages.`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="px-3.5 py-2 text-xs font-semibold text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
              >
                Cancel
              </button>
              {deleteConfirm.isSingleRemaining ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirm(null);
                      onCloseDocument();
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-[#D64545] bg-[#D64545]/10 hover:bg-[#D64545]/20 rounded-lg"
                  >
                    Close Document
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirm(null);
                      onReplaceDocument();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Replace PDF</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={confirmDeletePages}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#D64545] hover:bg-[#B91C1C] rounded-lg"
                >
                  Delete {deleteConfirm.indices.length === 1 ? 'Page' : 'Pages'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
