import React from 'react';
import { Code, Gamepad2, Globe } from 'lucide-react';
import { Project } from '../../types';
import { cn } from '../ui';

export const PROJECT_TYPE_META: Record<Project['type'], { icon: React.ComponentType<{ className?: string }>; tile: string; label: string; blurb: string }> = {
  Game: {
    icon: Gamepad2,
    tile: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    label: 'Game',
    blurb: 'Design docs, levels, balance sheets and a bug board.',
  },
  Software: {
    icon: Code,
    tile: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    label: 'Software',
    blurb: 'Specs, architecture notes, tasks and releases.',
  },
  Web: {
    icon: Globe,
    tile: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    label: 'Web',
    blurb: 'Sitemaps, page copy, flows and launch plans.',
  },
};

/** Rounded tile with the project type's icon, tinted per type. */
const ProjectIcon: React.FC<{ type: Project['type']; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ type, size = 'md', className }) => {
  const meta = PROJECT_TYPE_META[type] || PROJECT_TYPE_META.Software;
  const Icon = meta.icon;
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        meta.tile,
        size === 'sm' && 'h-7 w-7 rounded-lg',
        size === 'md' && 'h-9 w-9 rounded-[10px]',
        size === 'lg' && 'h-11 w-11 rounded-xl',
        className,
      )}
    >
      <Icon className={cn(size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-[18px] w-[18px]' : 'h-5 w-5')} />
    </span>
  );
};

export default ProjectIcon;
