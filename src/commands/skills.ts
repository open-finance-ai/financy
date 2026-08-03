import { existsSync } from 'node:fs'
import { cp, readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CliError } from '../errors.js'
import { EXIT } from '../exit-codes.js'

/** Where installed skills land, relative to the target directory. */
const INSTALL_SUBPATH = join('.claude', 'skills')

export interface Skill {
  name: string
  description: string
}

export interface SkillsContext {
  /** Root of the bundled `skills/` directory. Injected in tests. */
  skillsRoot: string
  /** Directory the `.claude/skills/` tree is created under. Defaults to cwd. */
  targetDir: string
  json: boolean
  out: (chunk: string) => void
}

/**
 * Locate the bundled `skills/` directory. It sits at the package root, one level
 * above the built `dist/` bundle — and two above `src/commands/` when running
 * from source, so walk up until it turns up.
 */
export function resolveSkillsRoot(moduleDir = dirname(fileURLToPath(import.meta.url))): string {
  let dir = moduleDir
  for (let depth = 0; depth < 4; depth++) {
    dir = join(dir, '..')
    // Sync existence check is fine here: at most four stats, once per invocation.
    const candidate = join(dir, 'skills')
    if (existsSync(candidate)) return candidate
  }
  return join(moduleDir, '..', 'skills')
}

/**
 * Read the `name` and `description` out of a SKILL.md YAML frontmatter block.
 * Only the two shapes the bundled skills use are supported: `key: value` and a
 * folded `key: >` scalar whose continuation lines are indented.
 */
export function parseFrontmatter(source: string): Partial<Skill> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)
  if (!match?.[1]) return {}

  const result: Record<string, string> = {}
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!kv?.[1]) continue
    const [, key, rest = ''] = kv

    if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-') {
      // Folded/literal scalar: consume the indented block that follows.
      const block: string[] = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1] ?? '')) {
        block.push((lines[++i] ?? '').trim())
      }
      result[key] = block.join(' ')
    } else {
      result[key] = rest.replace(/^["']|["']$/g, '')
    }
  }
  return result as Partial<Skill>
}

/** Every skill bundled with this CLI, in directory order. */
export async function listSkills(skillsRoot: string): Promise<Skill[]> {
  let entries: string[]
  try {
    entries = (await readdir(skillsRoot, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }

  const skills: Skill[] = []
  for (const name of entries) {
    const file = join(skillsRoot, name, 'SKILL.md')
    try {
      const front = parseFrontmatter(await readFile(file, 'utf8'))
      skills.push({ name: front.name ?? name, description: front.description ?? '' })
    } catch {
      // A directory without a readable SKILL.md is not a skill.
    }
  }
  return skills
}

/** `financy skills list` — what ships in the box. */
export async function skillsListCommand(ctx: SkillsContext): Promise<number> {
  const skills = await listSkills(ctx.skillsRoot)

  if (ctx.json) {
    ctx.out(JSON.stringify({ data: skills, count: skills.length }, null, 2))
    return EXIT.OK
  }

  if (skills.length === 0) {
    ctx.out('No skills are bundled with this build.\n')
    return EXIT.OK
  }

  const lines = ['Skills bundled with financy:', '']
  const width = Math.max(...skills.map((s) => s.name.length))
  for (const skill of skills) {
    lines.push(`  ${skill.name.padEnd(width)}  ${firstSentence(skill.description)}`)
  }
  lines.push('', `Install them with: financy skills install --all`)
  ctx.out(lines.join('\n') + '\n')
  return EXIT.OK
}

/** Trim a folded description down to something that fits one terminal line. */
function firstSentence(description: string): string {
  const sentence = description.split(/\.\s/)[0] ?? description
  return sentence.length > 96 ? sentence.slice(0, 93) + '…' : sentence
}

export interface SkillsInstallContext extends SkillsContext {
  /** Skill names to install; empty means "all" when `all` is set. */
  names: string[]
  all: boolean
}

/** `financy skills install` — copy skills into the project's `.claude/skills/`. */
export async function skillsInstallCommand(ctx: SkillsInstallContext): Promise<number> {
  const available = await listSkills(ctx.skillsRoot)
  if (available.length === 0) {
    throw new CliError(EXIT.UNEXPECTED, 'NO_SKILLS', 'no skills are bundled with this build')
  }

  if (!ctx.all && ctx.names.length === 0) {
    throw new CliError(
      EXIT.USAGE,
      'USAGE',
      `name a skill or pass --all (available: ${available.map((s) => s.name).join(', ')})`,
    )
  }

  const wanted = ctx.all ? available.map((s) => s.name) : ctx.names
  const unknown = wanted.filter((name) => !available.some((s) => s.name === name))
  if (unknown.length > 0) {
    throw new CliError(
      EXIT.NOT_FOUND,
      'NOT_FOUND',
      `unknown skill${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')} ` +
        `(available: ${available.map((s) => s.name).join(', ')})`,
    )
  }

  const destRoot = join(ctx.targetDir, INSTALL_SUBPATH)
  const installed: { name: string; path: string; replaced: boolean }[] = []

  for (const name of wanted) {
    const dest = join(destRoot, name)
    const replaced = await exists(dest)
    await cp(join(ctx.skillsRoot, name), dest, { recursive: true, force: true })
    installed.push({ name, path: dest, replaced })
  }

  if (ctx.json) {
    ctx.out(JSON.stringify({ data: installed, count: installed.length }, null, 2))
    return EXIT.OK
  }

  const lines: string[] = []
  for (const item of installed) {
    lines.push(`✓ ${item.name}${item.replaced ? ' (updated)' : ''} → ${item.path}`)
  }
  lines.push('', 'Restart Claude Code (or your agent) to pick them up.')
  ctx.out(lines.join('\n') + '\n')
  return EXIT.OK
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
