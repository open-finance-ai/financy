import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from './helpers/run-cli.js'
import { parseFrontmatter, resolveSkillsRoot } from '../src/commands/skills.js'

/** The skills that actually ship, read from the repo's own `skills/` directory. */
const BUNDLED = resolveSkillsRoot()

let target: string

beforeEach(async () => {
  target = await mkdtemp(join(tmpdir(), 'financy-skills-'))
})

describe('financy skills list', () => {
  it('lists the bundled skills as JSON', async () => {
    const { code, stdout, stderr } = await runCli(['skills', 'list', '--json'], {
      skillsRoot: BUNDLED,
      cwd: target,
    })

    expect(code).toBe(0)
    expect(stderr).toBe('')
    const parsed = JSON.parse(stdout) as { data: { name: string }[]; count: number }
    expect(parsed.data.map((s) => s.name).sort()).toEqual(['financy-setup', 'freshness-check'])
    expect(parsed.count).toBe(2)
  })

  it('renders a human table with a description per skill', async () => {
    const { code, stdout } = await runCli(['skills', 'list'], {
      skillsRoot: BUNDLED,
      cwd: target,
    })

    expect(code).toBe(0)
    expect(stdout).toContain('financy-setup')
    expect(stdout).toContain('freshness-check')
    expect(stdout).toContain('financy skills install --all')
  })
})

describe('financy skills install', () => {
  it('copies every skill into .claude/skills/ under --all', async () => {
    const { code, stdout } = await runCli(['skills', 'install', '--all'], {
      skillsRoot: BUNDLED,
      cwd: target,
    })

    expect(code).toBe(0)
    for (const name of ['financy-setup', 'freshness-check']) {
      const installed = await readFile(
        join(target, '.claude', 'skills', name, 'SKILL.md'),
        'utf8',
      )
      expect(installed).toContain(`name: ${name}`)
      expect(stdout).toContain(name)
    }
  })

  it('installs only the named skill', async () => {
    const { code } = await runCli(['skills', 'install', 'freshness-check'], {
      skillsRoot: BUNDLED,
      cwd: target,
    })

    expect(code).toBe(0)
    await expect(
      readFile(join(target, '.claude', 'skills', 'freshness-check', 'SKILL.md'), 'utf8'),
    ).resolves.toContain('freshness check')
    await expect(
      readFile(join(target, '.claude', 'skills', 'financy-setup', 'SKILL.md'), 'utf8'),
    ).rejects.toThrow()
  })

  it('honours --dir over the working directory', async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), 'financy-elsewhere-'))
    const { code } = await runCli(
      ['skills', 'install', 'financy-setup', '--dir', elsewhere],
      { skillsRoot: BUNDLED, cwd: target },
    )

    expect(code).toBe(0)
    await expect(
      readFile(join(elsewhere, '.claude', 'skills', 'financy-setup', 'SKILL.md'), 'utf8'),
    ).resolves.toContain('financy setup')
  })

  it('overwrites an existing install and reports it as updated', async () => {
    const dest = join(target, '.claude', 'skills', 'financy-setup')
    await mkdir(dest, { recursive: true })
    await writeFile(join(dest, 'SKILL.md'), 'stale content')

    const { code, stdout } = await runCli(['skills', 'install', 'financy-setup'], {
      skillsRoot: BUNDLED,
      cwd: target,
    })

    expect(code).toBe(0)
    expect(stdout).toContain('(updated)')
    const installed = await readFile(join(dest, 'SKILL.md'), 'utf8')
    expect(installed).not.toContain('stale content')
  })

  it('exits 6 for an unknown skill and names what is available', async () => {
    const { code, stderr } = await runCli(['skills', 'install', 'no-such-skill'], {
      skillsRoot: BUNDLED,
      cwd: target,
    })

    expect(code).toBe(6)
    expect(stderr).toContain('unknown skill: no-such-skill')
    expect(stderr).toContain('financy-setup')
  })

  it('exits 2 when neither a name nor --all is given', async () => {
    const { code, stderr } = await runCli(['skills', 'install'], {
      skillsRoot: BUNDLED,
      cwd: target,
    })

    expect(code).toBe(2)
    expect(stderr).toContain('name a skill or pass --all')
  })
})

describe('SKILL.md frontmatter', () => {
  it('reads a folded description across continuation lines', () => {
    const parsed = parseFrontmatter(
      ['---', 'name: demo', 'description: >', '  first line', '  second line', '---', '# body'].join(
        '\n',
      ),
    )

    expect(parsed).toEqual({ name: 'demo', description: 'first line second line' })
  })

  it('returns nothing for a file without frontmatter', () => {
    expect(parseFrontmatter('# just a heading\n')).toEqual({})
  })
})

const SKILL_NAMES = ['financy-setup', 'freshness-check']

describe('bundled skill contents', () => {
  it('states the guardrails and a minimum CLI version in every skill', async () => {
    for (const name of SKILL_NAMES) {
      const source = await readFile(join(BUNDLED, name, 'SKILL.md'), 'utf8')
      expect(source, `${name}: minimum version`).toMatch(/Minimum CLI version:/)
      expect(source, `${name}: secret guardrail`).toMatch(/[Nn]ever (?:handle|echo).{0,20}client secret/)
      expect(source, `${name}: credit guardrail`).toMatch(/20 credits/)
      expect(source, `${name}: exit-4 guardrail`).toMatch(/open-finance\.ai/)
    }
  })

  // A skill that tells an agent to inline the secret into a command puts it in the
  // transcript, shell history and process list — the exact leak the guardrail
  // forbids. Any `FINANCY_CLIENT_SECRET=` in a shell block must be an explicit
  // counter-example, so require a nearby "never"/"not" for each occurrence.
  it('never instructs an agent to pass the secret on a command line', async () => {
    for (const name of SKILL_NAMES) {
      const source = await readFile(join(BUNDLED, name, 'SKILL.md'), 'utf8')
      const lines = source.split('\n')
      lines.forEach((line, index) => {
        if (!/FINANCY_CLIENT_SECRET\s*=/.test(line)) return
        // Prose wraps, so look at the surrounding paragraph, not just this line.
        const context = lines.slice(Math.max(0, index - 3), index + 2).join(' ')
        expect(context, `${name}:${index + 1} unqualified secret on a command line`).toMatch(
          /\b(?:[Nn]ever|not|defeats)\b/,
        )
      })
    }
  })
})
