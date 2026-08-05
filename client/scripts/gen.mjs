#!/usr/bin/env node
/**
 * gen.mjs — Angular standalone component generator
 *
 * Usage (from anywhere inside the project):
 *
 *   node scripts/gen.mjs spinner
 *       → src/app/components/spinner/index.ts  (class: SpinnerComponent)
 *
 *   node scripts/gen.mjs pages/home
 *       → src/app/components/pages/home/index.ts  (class: HomeComponent)
 *
 *   node scripts/gen.mjs pages/home --name HomePage
 *       → src/app/components/pages/home/index.ts  (class: HomePageComponent)
 *
 *   node scripts/gen.mjs ui/dialog/password --name PasswordDialog
 *       → src/app/components/ui/dialog/password/index.ts  (class: PasswordDialogComponent)
 *
 *   node scripts/gen.mjs --service editor-auth
 *       → src/app/core/services/editor-auth.service.ts  (class: EditorAuthService)
 *
 *   node scripts/gen.mjs --service editor-auth --name EditorAuth
 *       → same file, same class name (service suffix always appended automatically)
 *
 *   node scripts/gen.mjs --guard lawyer-auth --name LawyerAuth
 *       → src/app/core/guards/lawyer-auth.guard.ts  (export: lawyerAuthGuard)
 *
 *   node scripts/gen.mjs --scss spinner
 *       → also creates src/app/components/spinner/index.scss
 *
 * Flags:
 *   --name / -n   override the class/export name (folder path unchanged)
 *   --scss        also scaffold an index.scss file
 *   --service     generate a service instead of a component
 *   --guard       generate a functional route guard
 *   --pipe        generate a standalone pipe
 *   --dry         print what would be created without writing anything
 *   --force       overwrite existing files
 */

import fs   from 'fs';
import path from 'path';

// ── Colours ───────────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  blue:   '\x1b[34m',
};

const ok    = (s) => console.log(`  ${c.green}✓${c.reset}  ${s}`);
const skip  = (s) => console.log(`  ${c.yellow}–${c.reset}  ${c.dim}${s} (already exists)${c.reset}`);
const dryLog= (s) => console.log(`  ${c.cyan}~${c.reset}  ${c.dim}[dry]${c.reset} ${s}`);
const fatal = (s) => { console.error(`\n  ${c.red}✗${c.reset}  ${s}\n`); process.exit(1); };
const info  = (s) => console.log(`  ${c.blue}i${c.reset}  ${c.dim}${s}${c.reset}`);

// ── Arg parsing ───────────────────────────────────────────────────────────────
//
// Supports both:
//   --name PasswordDialog
//   --name=PasswordDialog
//   -n PasswordDialog

const rawArgs = process.argv.slice(2);

/** Extract a valued flag (--name foo | --name=foo | -n foo) → string | null */
function extractValueFlag(args, ...keys) {
  for (let i = 0; i < args.length; i++) {
    for (const key of keys) {
      // --name=Value form
      if (args[i].startsWith(`${key}=`)) {
        return { value: args[i].slice(key.length + 1), filtered: [...args.slice(0, i), ...args.slice(i + 1)] };
      }
      // --name Value form
      if (args[i] === key && i + 1 < args.length && !args[i + 1].startsWith('-')) {
        return { value: args[i + 1], filtered: [...args.slice(0, i), ...args.slice(i + 2)] };
      }
    }
  }
  return { value: null, filtered: args };
}

const { value: customName, filtered: argsAfterName } = extractValueFlag(rawArgs, '--name', '-n');

const flags   = new Set(argsAfterName.filter(a => a.startsWith('-')));
const posArgs = argsAfterName.filter(a => !a.startsWith('-'));

const withScss  = flags.has('--scss');
const isDry     = flags.has('--dry');
const isForce   = flags.has('--force');
const isService = flags.has('--service');
const isGuard   = flags.has('--guard');
const isPipe    = flags.has('--pipe');

if (posArgs.length === 0) {
  console.log(`
  ${c.bold}fl-ng-gen${c.reset} — Angular standalone component generator

  ${c.bold}USAGE${c.reset}
    node scripts/gen.mjs <path>                     component
    node scripts/gen.mjs <path> --name <ClassName>  component with custom class name
    node scripts/gen.mjs --service <path>           injectable service
    node scripts/gen.mjs --guard <path>             functional route guard
    node scripts/gen.mjs --pipe <path>              standalone pipe

  ${c.bold}EXAMPLES${c.reset}
    node scripts/gen.mjs spinner
    node scripts/gen.mjs pages/home --name HomePage
    node scripts/gen.mjs ui/dialog/password --name PasswordDialog
    node scripts/gen.mjs --service editor-auth
    node scripts/gen.mjs --guard lawyer-auth --name LawyerAuth
    node scripts/gen.mjs --pipe safe-html -n SafeHtml

  ${c.bold}FLAGS${c.reset}
    --name / -n   override class/export name (folder path stays as given)
    --scss        also create index.scss
    --dry         preview without writing
    --force       overwrite existing files
  `);
  process.exit(0);
}

// ── Project root detection ────────────────────────────────────────────────────

function findProjectRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'angular.json'))) return dir;
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const p = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        if (p.dependencies?.['@angular/core'] || p.devDependencies?.['@angular/core']) return dir;
      } catch {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const root = findProjectRoot(process.cwd());
if (!root) fatal('Could not find Angular project root (no angular.json found). Run from inside the project.');

// ── Config ────────────────────────────────────────────────────────────────────

const COMPONENT_BASE = path.join(root, 'src', 'app', 'components');
const SERVICE_BASE   = path.join(root, 'src', 'app', 'core', 'services');
const GUARD_BASE     = path.join(root, 'src', 'app', 'core', 'guards');
const PIPE_BASE      = path.join(root, 'src', 'app', 'core', 'pipes');

// ── Name utilities ────────────────────────────────────────────────────────────

/** 'my-component' | 'MyComponent' → 'MyComponent' (handles both forms) */
function toPascalCase(s) {
  // Already PascalCase if it starts with uppercase and has no hyphens
  if (/^[A-Z]/.test(s) && !s.includes('-') && !s.includes('_')) return s;
  return s
    .split(/[-_/]/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

/** 'MyComponent' | 'my-comp' → 'myComp' */
function toCamelCase(s) {
  const pascal = toPascalCase(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** 'MyComponent' | 'my-comp' → 'app-my-comp' (for selector) */
function toSelector(s) {
  // Convert PascalCase or kebab-case to kebab for the selector
  const kebab = s
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/--+/g, '-');
  return `app-${kebab}`;
}

/** 'pages/about-us' → { segments: ['pages','about-us'], dirName: 'about-us' } */
function parsePath(input) {
  const normalised = input.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments   = normalised.split('/');
  const dirName    = segments[segments.length - 1];
  return { segments, dirName };
}

/**
 * Resolve the class name to use in generated files.
 *
 * Priority:
 *   1. --name / -n flag value  (taken as-is, PascalCased if not already)
 *   2. Derived from the last path segment
 *
 * The type suffix (Component / Service / Guard / Pipe) is always appended
 * by the template — customName should NOT include it.
 *
 * Examples:
 *   dirName='password', customName='PasswordDialog'  → 'PasswordDialog'
 *   dirName='home',     customName='HomePage'         → 'HomePage'
 *   dirName='spinner',  customName=null               → 'Spinner'
 */
function resolveClassName(dirName, customName) {
  if (customName) return toPascalCase(customName);
  return toPascalCase(dirName);
}

// ── File writing ──────────────────────────────────────────────────────────────

function write(filePath, content) {
  if (isDry)                                { dryLog(path.relative(root, filePath)); return; }
  if (fs.existsSync(filePath) && !isForce) { skip(path.relative(root, filePath));   return; }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  ok(path.relative(root, filePath));
}

// ── Templates ─────────────────────────────────────────────────────────────────

function componentTs(className, dirName, withScss) {
  const selector  = toSelector(className);
  const styleUrls = withScss ? `\n  styleUrls:   ['./index.scss'],` : '';

  return `import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
} from '@angular/core';

@Component({
  selector:    '${selector}',
  standalone:  true,
  imports:     [],
  templateUrl: './index.html',${styleUrls}
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ${className}Component {
  // inject(SomeService)
  // someSignal = signal<string>('');
}
`;
}

function componentHtml(className) {
  const selector = toSelector(className);
  return `<!-- ${selector} -->\n<div class="">\n\n</div>\n`;
}

function componentScss(className) {
  const selector = toSelector(className);
  return `// ${selector}\n// Component-scoped styles (prefer Tailwind utilities in the template).\n`;
}

function serviceTs(className, dirName) {
  return `import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { env } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ${className}Service {
  private http = inject(HttpClient);

  // Example:
  // private _data = signal<unknown[]>([]);
  // readonly data = this._data.asReadonly();
}
`;
}

function guardTs(className, dirName) {
  const exportName = toCamelCase(className) + 'Guard';
  return `import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
// import { ${className}Service } from '../services/${dirName}.service';

export const ${exportName}: CanActivateFn = (_route, _state) => {
  const router = inject(Router);
  // const auth = inject(${className}Service);
  // if (auth.isAuthenticated()) return true;
  // return router.createUrlTree(['/login']);
  return true;
};
`;
}

function pipeTs(className, dirName) {
  const pipeName = toCamelCase(className);
  return `import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: '${pipeName}', standalone: true })
export class ${className}Pipe implements PipeTransform {
  transform(value: unknown, ...args: unknown[]): unknown {
    return value;
  }
}
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const rawPathArg           = posArgs[0];
const { segments, dirName } = parsePath(rawPathArg);
const className             = resolveClassName(dirName, customName);

// Print header
console.log(`\n  ${c.bold}fl-ng-gen${c.reset}  ${c.gray}${isDry ? '[dry run] ' : ''}${c.reset}`);
console.log(`  ${c.dim}root: ${root}${c.reset}`);

if (customName) {
  info(`class name overridden: ${c.reset}${c.bold}${className}${c.reset}${c.dim} (folder: ${dirName})`);
}
console.log('');

// ── Dispatch ──────────────────────────────────────────────────────────────────

if (isService) {
  const filePath = path.join(SERVICE_BASE, ...segments.slice(0, -1), `${dirName}.service.ts`);
  write(filePath, serviceTs(className, dirName));

} else if (isGuard) {
  const filePath = path.join(GUARD_BASE, ...segments.slice(0, -1), `${dirName}.guard.ts`);
  write(filePath, guardTs(className, dirName));

} else if (isPipe) {
  const filePath = path.join(PIPE_BASE, ...segments.slice(0, -1), `${dirName}.pipe.ts`);
  write(filePath, pipeTs(className, dirName));

} else {
  // Component — resolve base directory
  let compDir;
  if (rawPathArg.startsWith('src/') || rawPathArg.startsWith('app/')) {
    compDir = path.join(root, rawPathArg);
  } else {
    compDir = path.join(COMPONENT_BASE, ...segments);
  }

  write(path.join(compDir, 'index.ts'),   componentTs(className, dirName, withScss));
  write(path.join(compDir, 'index.html'), componentHtml(className));
  if (withScss) {
    write(path.join(compDir, 'index.scss'), componentScss(className));
  }
}

console.log('');
