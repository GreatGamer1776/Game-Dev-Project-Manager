import React from 'react';
import {
  Code, Gamepad2, Globe, Joystick, Swords, Sword, Shield, Crown, Castle, Ghost, Skull, Dices, Puzzle, Trophy,
  Target, Rocket, Orbit, Atom, Car, Plane, Ship, Sailboat, Bike, Map, Compass, Mountain, TreePine, Tent, Sprout,
  Leaf, Fish, Bird, Cat, Dog, Bot, Brain, Wand2, Flame, Zap, Sun, Moon, Snowflake, Gem, Heart, Star, Key,
  Pickaxe, Axe, Hammer, Wrench, FlaskConical, Music, Headphones, Film, Clapperboard, Camera, Palette, Brush,
  Feather, BookOpen, Box, Package, Blocks, Shapes, Hexagon, Layers, Cpu, Terminal, Database, Server, Cloud,
  Workflow, GitBranch, Bug, Smartphone, Monitor, AppWindow, ShoppingCart, Store, Building2, Radio, Satellite,
  type LucideIcon,
} from 'lucide-react';
import { Project } from '../../types';
import { cn } from '../ui';

type IconComponent = LucideIcon;

/**
 * The icons a project can wear, grouped so the picker reads as a small library
 * rather than a wall of glyphs. Keys are what gets stored on the project, so
 * never rename one.
 */
export const PROJECT_ICON_GROUPS: { label: string; icons: Record<string, IconComponent> }[] = [
  {
    label: 'Games',
    icons: {
      gamepad: Gamepad2, joystick: Joystick, swords: Swords, sword: Sword, shield: Shield, crown: Crown,
      castle: Castle, ghost: Ghost, skull: Skull, dice: Dices, puzzle: Puzzle, trophy: Trophy, target: Target,
      wand: Wand2, gem: Gem, key: Key, heart: Heart, star: Star,
    },
  },
  {
    label: 'Worlds',
    icons: {
      rocket: Rocket, orbit: Orbit, atom: Atom, car: Car, plane: Plane, ship: Ship, sailboat: Sailboat, bike: Bike,
      map: Map, compass: Compass, mountain: Mountain, tree: TreePine, tent: Tent, sprout: Sprout, leaf: Leaf,
      fish: Fish, bird: Bird, cat: Cat, dog: Dog, bot: Bot, brain: Brain, flame: Flame, zap: Zap, sun: Sun,
      moon: Moon, snowflake: Snowflake,
    },
  },
  {
    label: 'Craft',
    icons: {
      pickaxe: Pickaxe, axe: Axe, hammer: Hammer, wrench: Wrench, flask: FlaskConical, music: Music,
      headphones: Headphones, film: Film, clapperboard: Clapperboard, camera: Camera, palette: Palette,
      brush: Brush, feather: Feather, book: BookOpen,
    },
  },
  {
    label: 'Software and web',
    icons: {
      code: Code, terminal: Terminal, cpu: Cpu, database: Database, server: Server, cloud: Cloud,
      workflow: Workflow, branch: GitBranch, bug: Bug, box: Box, package: Package, blocks: Blocks, shapes: Shapes,
      hexagon: Hexagon, layers: Layers, globe: Globe, smartphone: Smartphone, monitor: Monitor, window: AppWindow,
      cart: ShoppingCart, store: Store, building: Building2, radio: Radio, satellite: Satellite,
    },
  },
];

/** Icon a new project starts with. */
export const DEFAULT_PROJECT_ICON = 'gamepad';

/**
 * Projects made before icons existed only have a legacy type (Game, Software,
 * Web); they keep the icon that type used to show.
 */
const LEGACY_TYPE_ICON: Record<string, string> = { Game: 'gamepad', Software: 'code', Web: 'globe' };

const ICONS_BY_KEY: Record<string, IconComponent> = Object.assign({}, ...PROJECT_ICON_GROUPS.map(g => g.icons));

/** The icon key a project shows: its own pick, else its legacy type's, else the default. */
export const projectIconKey = (project: Pick<Project, 'type' | 'icon'>): string =>
  (project.icon && ICONS_BY_KEY[project.icon] ? project.icon : null)
  ?? (project.type && LEGACY_TYPE_ICON[project.type])
  ?? DEFAULT_PROJECT_ICON;

export const projectIconFor = (project: Pick<Project, 'type' | 'icon'>): IconComponent =>
  ICONS_BY_KEY[projectIconKey(project)];

const TILE = {
  sm: 'h-7 w-7 rounded-md',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-11 w-11 rounded-xl',
};
const GLYPH = { sm: 'h-4 w-4', md: 'h-[18px] w-[18px]', lg: 'h-5 w-5' };

/** A neutral tile with the project's icon. */
const ProjectIcon: React.FC<{
  project: Pick<Project, 'type' | 'icon'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ project, size = 'md', className }) => {
  const Icon = projectIconFor(project);
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-border bg-surface-raised text-muted',
        TILE[size],
        className,
      )}
    >
      <Icon className={GLYPH[size]} strokeWidth={1.5} />
    </span>
  );
};

/** Grid of project icons, grouped. */
export const ProjectIconPicker: React.FC<{
  value: string;
  onChange: (icon: string) => void;
}> = ({ value, onChange }) => {
  const cell = (selected: boolean) => cn(
    'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
    selected
      ? 'border-accent bg-accent/10 text-accent'
      : 'border-transparent text-muted hover:border-border hover:bg-surface-hover hover:text-content',
  );
  return (
    <div className="max-h-64 space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-3" role="radiogroup" aria-label="Project icon">
      {PROJECT_ICON_GROUPS.map(group => (
        <div key={group.label}>
          <div className="eyebrow mb-2">{group.label}</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(group.icons).map(([key, Icon]) => {
              const label = key.charAt(0).toUpperCase() + key.slice(1);
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={value === key}
                  aria-label={label}
                  data-tip={label}
                  onClick={() => onChange(key)}
                  className={cell(value === key)}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProjectIcon;
