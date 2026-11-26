import React, { useMemo } from 'react';
import SearchPicker, { PickerItem } from '../ui/SearchPicker';
import type { ProjectFile } from '../../types';
import { EntryKind, getEntryKindMeta, readWorldEntries } from '../../utils/worldModel';
import { getFileTypeMeta, SINGLE_INSTANCE_FILE_TYPES } from '../fileTypes';

interface EntryPickerProps {
  anchor: HTMLElement | null;
  files: ProjectFile[];
  /** Only offer entries of these kinds (e.g. characters for a POV field). */
  kinds?: EntryKind[];
  /** Also list ordinary project files after the world entries. */
  includeFiles?: boolean;
  placeholder?: string;
  excludeFileId?: string | null;
  onPick: (name: string) => void;
  onClose: () => void;
}

/** Searchable list of world entries (and optionally other files); picks a name to link. */
const EntryPicker: React.FC<EntryPickerProps> = ({ anchor, files, kinds, includeFiles = false, placeholder, excludeFileId, onPick, onClose }) => {
  const items = useMemo<PickerItem[]>(() => {
    const entries = readWorldEntries(files).filter(e => (!kinds || kinds.includes(e.kind)) && e.file.id !== excludeFileId);
    const entryIds = new Set(entries.map(e => e.file.id));
    const list: PickerItem[] = entries
      .sort((a, b) => a.file.name.localeCompare(b.file.name))
      .map(e => {
        const meta = getEntryKindMeta(e.kind);
        return { id: e.file.id, label: e.file.name, sub: meta.label, icon: meta.icon };
      });
    if (includeFiles) {
      for (const f of files) {
        if (entryIds.has(f.id) || f.id === excludeFileId || SINGLE_INSTANCE_FILE_TYPES.has(f.type)) continue;
        const meta = getFileTypeMeta(f.type);
        list.push({ id: f.id, label: f.name, sub: meta.label, icon: meta.icon });
      }
    }
    return list;
  }, [files, kinds, includeFiles, excludeFileId]);

  const kindLabel = kinds?.length === 1 ? getEntryKindMeta(kinds[0]).plural.toLowerCase() : 'entries';
  return (
    <SearchPicker
      anchor={anchor}
      items={items}
      placeholder={placeholder || `Link to ${includeFiles ? 'an entry or file' : kindLabel}…`}
      emptyText={kinds ? `No ${kindLabel} yet. Create them from the Codex.` : 'Nothing to link yet.'}
      onPick={item => onPick(item.label)}
      onClose={onClose}
    />
  );
};

export default EntryPicker;
