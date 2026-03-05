import type { FleetKnowledge, InstanceKnowledge } from './insights'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.lastIndexOf(' ', max)
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, max)) + '...'
}

function extractSkillDescription(content: string): string {
  const lines = content.split('\n').slice(0, 10)
  for (const line of lines) {
    const match = line.match(/^description:\s*(.+)/i)
    if (match) return truncateAtWord(match[1].trim(), 100)
  }
  // Fallback: first non-heading, non-empty, non-blockquote line
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('>')) continue
    return truncateAtWord(trimmed, 100)
  }
  return ''
}

function renderMarkdownHtml(raw: string): string {
  return raw.split('\n').map(line => {
    if (!line.trim()) return '<div style="height:0.5em;"></div>'
    // Headings
    const h4 = line.match(/^####\s+(.+)/)
    if (h4) return `<div style="font-weight:600;font-size:0.8rem;margin:0.5em 0 0.25em;">${escapeHtml(h4[1])}</div>`
    const h3 = line.match(/^###\s+(.+)/)
    if (h3) return `<div style="font-weight:600;font-size:0.85rem;margin:0.5em 0 0.25em;">${escapeHtml(h3[1])}</div>`
    const h2 = line.match(/^##\s+(.+)/)
    if (h2) return `<div style="font-weight:700;font-size:0.9rem;margin:0.6em 0 0.25em;">${escapeHtml(h2[1])}</div>`
    const h1 = line.match(/^#\s+(.+)/)
    if (h1) return `<div style="font-weight:700;font-size:1rem;margin:0.6em 0 0.25em;">${escapeHtml(h1[1])}</div>`
    // List items
    const li = line.match(/^[-*]\s+(.+)/)
    if (li) return `<div style="padding-left:1em;"><span style="color:var(--slate-400);">&bull;</span> ${inlineMarkdown(li[1])}</div>`
    // Numbered list items
    const nl = line.match(/^(\d+)\.\s+(.+)/)
    if (nl) return `<div style="padding-left:1em;"><span style="color:var(--slate-400);">${escapeHtml(nl[1])}.</span> ${inlineMarkdown(nl[2])}</div>`
    // Normal text
    return `<div>${inlineMarkdown(line)}</div>`
  }).join('\n')
}

function inlineMarkdown(text: string): string {
  let result = escapeHtml(text)
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>')
  result = result.replace(/`(.+?)`/g, '<code style="background:var(--slate-100);padding:0.1em 0.3em;border-radius:0.2em;font-size:0.85em;">$1</code>')
  return result
}

function getStyles(): string {
  return `
    :root {
      --slate-50: #f8fafc; --slate-100: #f1f5f9; --slate-200: #e2e8f0;
      --slate-300: #cbd5e1; --slate-400: #94a3b8; --slate-500: #64748b;
      --slate-600: #475569; --slate-700: #334155; --slate-800: #1e293b;
      --slate-900: #0f172a;
      --indigo-50: #eef2ff; --indigo-100: #e0e7ff; --indigo-200: #c7d2fe;
      --indigo-500: #6366f1; --indigo-600: #4f46e5; --indigo-700: #4338ca;
      --amber-50: #fffbeb; --amber-100: #fef3c7; --amber-500: #f59e0b;
      --amber-600: #d97706; --amber-700: #b45309;
      --emerald-50: #ecfdf5; --emerald-100: #d1fae5; --emerald-500: #10b981;
      --emerald-600: #059669; --emerald-700: #047857;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--slate-50); color: var(--slate-800);
      line-height: 1.6; padding: 2rem; max-width: 1200px; margin: 0 auto;
    }
    code, pre, .mono { font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace; }
    a { color: var(--indigo-600); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .header { margin-bottom: 2rem; }
    .header h1 { font-size: 1.75rem; font-weight: 700; color: var(--slate-900); }
    .header .subtitle { font-size: 0.875rem; color: var(--slate-500); margin-top: 0.25rem; }
    .header .timestamp { font-size: 0.75rem; color: var(--slate-400); margin-top: 0.5rem; }

    .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .card {
      background: white; border: 1px solid var(--slate-200); border-radius: 0.75rem;
      padding: 1.25rem; text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      transition: box-shadow 0.15s, transform 0.15s;
    }
    .card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); transform: translateY(-1px); }
    .card .value { font-size: 1.75rem; font-weight: 700; }
    .card .label { font-size: 0.75rem; color: var(--slate-500); margin-top: 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .card-detail { font-size: 0.7rem; color: var(--slate-400); margin-top: 0.125rem; }
    .card.indigo .value { color: var(--indigo-600); }
    .card.amber .value { color: var(--amber-600); }
    .card.emerald .value { color: var(--emerald-600); }
    .card.slate .value { color: var(--slate-700); }

    .section { margin-bottom: 2rem; }
    .section-title {
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--slate-500); margin-bottom: 0.75rem;
    }

    .matrix-table {
      width: 100%; border-collapse: collapse; background: white;
      border: 1px solid var(--slate-200); border-radius: 0.75rem; overflow: hidden;
    }
    .matrix-table th, .matrix-table td {
      padding: 0.5rem 0.75rem; text-align: center; font-size: 0.8rem;
      border-bottom: 1px solid var(--slate-100);
    }
    .matrix-table th {
      background: var(--slate-50); font-weight: 600; color: var(--slate-600);
      font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em;
    }
    .matrix-table th.skill-name { text-align: left; }
    .matrix-table th.skill-desc { text-align: left; }
    .matrix-table td.skill-name { text-align: left; font-weight: 500; }
    .matrix-table td.skill-name code { font-size: 0.8rem; color: var(--indigo-700); }
    .matrix-table td.skill-desc { text-align: left; font-size: 0.75rem; color: var(--slate-500); max-width: 250px; }
    .matrix-table .alt-row { background: var(--slate-50); }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--indigo-500); }
    .dot-empty { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--slate-200); }
    .instance-name-header {
      writing-mode: vertical-lr; text-orientation: mixed; transform: rotate(180deg);
      font-size: 0.65rem; white-space: nowrap; max-height: 8rem;
    }

    .instance-card {
      background: white; border: 1px solid var(--slate-200); border-radius: 0.75rem;
      margin-bottom: 1rem; overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .instance-card summary {
      padding: 0.875rem 1.25rem; cursor: pointer; display: flex;
      align-items: center; justify-content: space-between;
      background: var(--slate-50); border-bottom: 1px solid var(--slate-200);
      list-style: none; transition: background 0.15s;
    }
    .instance-card summary:hover { background: var(--slate-100); }
    .instance-card summary::-webkit-details-marker { display: none; }
    .instance-card summary::before {
      content: '\\25B6'; font-size: 0.6rem; color: var(--slate-400);
      margin-right: 0.75rem; transition: transform 0.15s;
    }
    .instance-card[open] summary::before { transform: rotate(90deg); }
    .instance-card .instance-name { font-weight: 600; font-size: 0.875rem; color: var(--slate-800); }
    .instance-card .instance-meta { font-size: 0.75rem; color: var(--slate-400); }
    .instance-body { padding: 1.25rem; }

    .knowledge-section { margin-bottom: 1rem; }
    .knowledge-section:last-child { margin-bottom: 0; }
    .knowledge-label {
      font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; margin-bottom: 0.5rem;
    }
    .knowledge-label.skills { color: var(--indigo-600); }
    .knowledge-label.memories { color: var(--amber-600); }
    .knowledge-label.identity { color: var(--emerald-600); }
    .knowledge-label.config { color: var(--slate-600); }
    .knowledge-label.docs { color: var(--slate-500); }

    .file-card {
      border: 1px solid var(--slate-200); border-radius: 0.5rem;
      margin-bottom: 0.5rem; overflow: hidden;
    }
    .file-card summary {
      padding: 0.5rem 0.75rem; cursor: pointer; font-size: 0.8rem;
      list-style: none; display: flex; align-items: center; gap: 0.5rem;
    }
    .file-card summary::-webkit-details-marker { display: none; }
    .file-card summary::before {
      content: '\\25B6'; font-size: 0.5rem; color: var(--slate-400);
      transition: transform 0.15s;
    }
    .file-card[open] summary::before { transform: rotate(90deg); }
    .file-card .file-name { font-weight: 500; }
    .file-card .file-name.skill { color: var(--indigo-700); }
    .file-card .file-name.memory { color: var(--amber-700); }
    .file-card .file-name.identity-file { color: var(--emerald-700); }
    .file-card .file-name.config-file { color: var(--slate-600); }
    .file-card .file-name.doc-file { color: var(--slate-500); }
    .file-card .file-date { font-size: 0.7rem; color: var(--slate-400); margin-left: auto; }
    .file-content {
      padding: 0.75rem; background: var(--slate-50); border-top: 1px solid var(--slate-100);
      font-size: 0.8rem; line-height: 1.5;
      max-height: 500px; overflow-y: auto;
    }

    .badge {
      display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px;
      font-size: 0.7rem; font-weight: 500;
    }
    .badge.indigo { background: var(--indigo-50); color: var(--indigo-700); }
    .badge.amber { background: var(--amber-50); color: var(--amber-700); }
    .badge.emerald { background: var(--emerald-50); color: var(--emerald-700); }
    .badge.slate { background: var(--slate-100); color: var(--slate-600); }
    .badge.slate-light { background: var(--slate-50); color: var(--slate-500); border: 1px solid var(--slate-200); }

    .narrative-card {
      background: white; border: 1px solid var(--slate-200); border-radius: 0.75rem;
      padding: 1rem 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .narrative-item {
      padding: 0.5rem 0; font-size: 0.85rem; color: var(--slate-700);
      border-bottom: 1px solid var(--slate-100);
    }
    .narrative-item:last-child { border-bottom: none; }


    .footer {
      margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--slate-200);
      text-align: center; font-size: 0.75rem; color: var(--slate-400);
    }

    .empty { color: var(--slate-400); font-style: italic; font-size: 0.8rem; padding: 0.5rem 0; }

    @media print {
      body { padding: 0; max-width: none; }
      .instance-card, .file-card { break-inside: avoid; }
      details[open] summary ~ * { display: block !important; }
    }

    @media (max-width: 768px) {
      body { padding: 1rem; }
      .cards { grid-template-columns: repeat(2, 1fr); }
      .matrix-table { font-size: 0.7rem; }
      .matrix-table td.skill-desc { display: none; }
      .matrix-table th.skill-desc { display: none; }
    }
  `
}

function renderHeader(workspaceLabel?: string): string {
  const now = new Date().toLocaleString('en-US', {
    dateStyle: 'long', timeStyle: 'short',
  })
  return `
    <div class="header">
      <h1>Fleet Insights Report</h1>
      <div class="subtitle">${workspaceLabel ? escapeHtml(workspaceLabel) + ' workspace' : 'All instances'}</div>
      <div class="timestamp">Generated ${escapeHtml(now)}</div>
    </div>
  `
}

function renderSummaryCards(fleet: FleetKnowledge): string {
  const instanceCount = fleet.instances.length
  const skillNames = Object.keys(fleet.skillIndex)
  const withSkills = fleet.instances.filter(i => i.skills.length > 0).length

  // Most active: instance with most skills + memories
  let mostActive = ''
  let mostActiveScore = 0
  for (const inst of fleet.instances) {
    const score = inst.skills.length + inst.memories.length
    if (score > mostActiveScore) {
      mostActiveScore = score
      mostActive = inst.instance
    }
  }

  return `
    <div class="cards">
      <div class="card">
        <div class="value">${instanceCount}</div>
        <div class="label">Instances</div>
      </div>
      <div class="card indigo">
        <div class="value">${skillNames.length}</div>
        <div class="label">Unique Skills</div>
      </div>
      <div class="card amber">
        <div class="value">${fleet.totalMemories}</div>
        <div class="label">Total Memories</div>
      </div>
      <div class="card emerald">
        <div class="value">${withSkills}</div>
        <div class="label">With Skills</div>
        <div class="card-detail">of ${instanceCount} instances</div>
      </div>
      ${mostActive ? `
      <div class="card slate">
        <div class="value mono" style="font-size:1rem;">${escapeHtml(mostActive)}</div>
        <div class="label">Most Active</div>
        <div class="card-detail">${mostActiveScore} files</div>
      </div>
      ` : ''}
    </div>
  `
}

function renderFleetNarrative(fleet: FleetKnowledge): string {
  const observations: string[] = []

  // Most active instance
  let mostActive = ''
  let mostActiveScore = 0
  for (const inst of fleet.instances) {
    const score = inst.skills.length + inst.memories.length
    if (score > mostActiveScore) {
      mostActiveScore = score
      mostActive = inst.instance
    }
  }
  if (mostActive) {
    observations.push(`<strong>${escapeHtml(mostActive)}</strong> is the most active with ${mostActiveScore} knowledge files.`)
  }

  // Skill landscape
  const skillEntries = Object.entries(fleet.skillIndex).sort(([, a], [, b]) => b.length - a.length)
  const shared = skillEntries.filter(([, owners]) => owners.length > 1)
  if (shared.length > 0) {
    const list = shared.map(([name, owners]) => `<code>${escapeHtml(name)}</code> (${owners.length} instances)`).join(', ')
    observations.push(`Shared skills: ${list}.`)
  }

  if (skillEntries.length > 0 && shared.length === 0) {
    observations.push(`All ${skillEntries.length} skills are unique to a single instance — each agent is developing its own specializations.`)
  }

  // Instances still developing
  const noSkills = fleet.instances.filter(i => i.skills.length === 0)
  if (noSkills.length > 0 && noSkills.length < fleet.instances.length) {
    const names = noSkills.map(i => `<code>${escapeHtml(i.instance)}</code>`).join(', ')
    observations.push(`${noSkills.length} instance${noSkills.length !== 1 ? 's are' : ' is'} still developing: ${names}.`)
  }

  if (observations.length === 0) return ''

  const items = observations.map(o => `
    <div class="narrative-item">${o}</div>
  `).join('')

  return `
    <div class="section">
      <div class="section-title">Fleet Observations</div>
      <div class="narrative-card">${items}</div>
    </div>
  `
}

function renderLearningOpportunities(fleet: FleetKnowledge): string {
  const sections: string[] = []
  const sevenDaysAgo = Date.now() - 7 * 86400 * 1000

  // 1. Skills to spread: skills on exactly 1 instance
  const unique = Object.entries(fleet.skillIndex)
    .filter(([, owners]) => owners.length === 1)
    .sort(([a], [b]) => a.localeCompare(b))

  if (unique.length > 0) {
    const items = unique.map(([skillName, owners]) => {
      const owner = owners[0]
      const inst = fleet.instances.find(i => i.instance === owner)
      const skill = inst?.skills.find(s => s.name === skillName)
      const desc = skill ? extractSkillDescription(skill.content) : ''
      return `
        <div class="narrative-item" style="display:flex;align-items:baseline;gap:0.5rem;">
          <code style="color:var(--indigo-700);white-space:nowrap;">${escapeHtml(skillName)}</code>
          <span style="color:var(--slate-400);">on</span>
          <code style="font-size:0.8rem;">${escapeHtml(owner)}</code>
          ${desc ? `<span style="color:var(--slate-500);font-size:0.8rem;margin-left:auto;">— ${escapeHtml(desc)}</span>` : ''}
        </div>
      `
    }).join('')

    sections.push(`
      <div style="margin-bottom:1rem;">
        <div style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--indigo-600);margin-bottom:0.5rem;">
          Skills to Spread
          <span style="font-weight:400;color:var(--slate-400);text-transform:none;letter-spacing:normal;margin-left:0.5rem;">${unique.length} skill${unique.length !== 1 ? 's' : ''} unique to one instance</span>
        </div>
        <div class="narrative-card">${items}</div>
      </div>
    `)
  }

  // 2. Recently evolved: skills modified in the last 7 days
  const recent: { skillName: string; instance: string; lastModified: string }[] = []
  for (const inst of fleet.instances) {
    for (const skill of inst.skills) {
      const ts = new Date(skill.lastModified).getTime()
      if (ts > sevenDaysAgo && ts > 0) {
        recent.push({ skillName: skill.name, instance: inst.instance, lastModified: skill.lastModified })
      }
    }
  }
  recent.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())

  if (recent.length > 0) {
    const items = recent.map(r => {
      const dateStr = formatDate(r.lastModified)
      return `
        <div class="narrative-item" style="display:flex;align-items:baseline;gap:0.5rem;">
          <code style="color:var(--indigo-700);white-space:nowrap;">${escapeHtml(r.skillName)}</code>
          <span style="color:var(--slate-400);">on</span>
          <code style="font-size:0.8rem;">${escapeHtml(r.instance)}</code>
          ${dateStr ? `<span style="color:var(--slate-400);font-size:0.75rem;margin-left:auto;">${escapeHtml(dateStr)}</span>` : ''}
        </div>
      `
    }).join('')

    sections.push(`
      <div>
        <div style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--amber-600);margin-bottom:0.5rem;">
          Recently Evolved
          <span style="font-weight:400;color:var(--slate-400);text-transform:none;letter-spacing:normal;margin-left:0.5rem;">modified in the last 7 days</span>
        </div>
        <div class="narrative-card">${items}</div>
      </div>
    `)
  }

  if (sections.length === 0) return ''

  return `
    <div class="section">
      <div class="section-title">Learning Opportunities</div>
      ${sections.join('')}
    </div>
  `
}

function renderSkillMatrix(fleet: FleetKnowledge): string {
  const skills = Object.entries(fleet.skillIndex).sort(([, a], [, b]) => b.length - a.length)
  if (skills.length === 0) return ''

  const instanceIds = fleet.instances.map(i => i.instance)
  const instanceSkillSets = new Map<string, Set<string>>()
  for (const inst of fleet.instances) {
    instanceSkillSets.set(inst.instance, new Set(inst.skills.map(s => s.name)))
  }

  // Build skill descriptions map from fleet data
  const skillDescriptions = new Map<string, string>()
  for (const inst of fleet.instances) {
    for (const skill of inst.skills) {
      if (!skillDescriptions.has(skill.name)) {
        const desc = extractSkillDescription(skill.content)
        if (desc) skillDescriptions.set(skill.name, desc)
      }
    }
  }

  const headerCells = instanceIds.map(id =>
    `<th><span class="instance-name-header mono">${escapeHtml(id)}</span></th>`
  ).join('')

  const rows = skills.map(([skillName, owners], idx) => {
    const desc = skillDescriptions.get(skillName) || ''
    const ownerList = owners.map(o => escapeHtml(o)).join(', ')
    const cells = instanceIds.map(id => {
      const has = instanceSkillSets.get(id)?.has(skillName)
      if (has) return `<td><span class="dot" title="${escapeHtml(id)} has this skill"></span></td>`
      return '<td><span class="dot-empty"></span></td>'
    }).join('')

    const rowClass = idx % 2 === 1 ? ' class="alt-row"' : ''
    return `<tr${rowClass}><td class="skill-name"><code>${escapeHtml(skillName)}</code></td><td class="skill-desc">${escapeHtml(desc)}</td>${cells}</tr>`
  }).join('')

  return `
    <div class="section">
      <div class="section-title">Skill Landscape</div>
      <div style="overflow-x: auto;">
        <table class="matrix-table">
          <thead><tr><th class="skill-name">Skill</th><th class="skill-desc">Description</th>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (d.getTime() === 0) return ''
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

type FileType = 'skill' | 'memory' | 'identity-file' | 'config-file' | 'doc-file'

const FILE_TYPE_BADGES: Record<FileType, { label: string; color: string }> = {
  'skill': { label: 'SKILL', color: 'indigo' },
  'memory': { label: 'MEMORY', color: 'amber' },
  'identity-file': { label: 'IDENTITY', color: 'emerald' },
  'config-file': { label: 'CONFIG', color: 'slate' },
  'doc-file': { label: 'DOC', color: 'slate-light' },
}

function renderFileCards(
  files: { name: string; content: string; lastModified: string }[],
  type: FileType
): string {
  const badgeInfo = FILE_TYPE_BADGES[type]
  return files.map(f => {
    const dateStr = formatDate(f.lastModified)
    return `
      <details class="file-card">
        <summary>
          <span class="badge ${badgeInfo.color}">${badgeInfo.label}</span>
          <span class="file-name ${type} mono">${escapeHtml(f.name)}</span>
          ${dateStr ? `<span class="file-date">${escapeHtml(dateStr)}</span>` : ''}
        </summary>
        <div class="file-content">${renderMarkdownHtml(f.content)}</div>
      </details>
    `
  }).join('')
}

function renderInstanceDetails(fleet: FleetKnowledge): string {
  // Sort by richness: most skills + memories first
  const sorted = [...fleet.instances].sort((a, b) => {
    const richA = a.skills.length + a.memories.length
    const richB = b.skills.length + b.memories.length
    return richB - richA
  })

  const cards = sorted.map(inst => {
    const configFiles = inst.config || []
    const docFiles = inst.docs || []
    const totalFiles = inst.skills.length + inst.memories.length + inst.identity.length + configFiles.length + docFiles.length
    const meta = [
      inst.skills.length > 0 ? `${inst.skills.length} skill${inst.skills.length !== 1 ? 's' : ''}` : null,
      inst.memories.length > 0 ? `${inst.memories.length} memor${inst.memories.length !== 1 ? 'ies' : 'y'}` : null,
      inst.identity.length > 0 ? `${inst.identity.length} identity` : null,
      configFiles.length > 0 ? `${configFiles.length} config` : null,
      docFiles.length > 0 ? `${docFiles.length} doc${docFiles.length !== 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(', ')

    let body = ''
    if (totalFiles === 0) {
      body = '<div class="empty">No knowledge files found</div>'
    } else {
      if (inst.identity.length > 0) {
        body += `
          <div class="knowledge-section">
            <div class="knowledge-label identity">Identity</div>
            ${renderFileCards(inst.identity, 'identity-file')}
          </div>
        `
      }
      if (inst.skills.length > 0) {
        body += `
          <div class="knowledge-section">
            <div class="knowledge-label skills">Skills</div>
            ${renderFileCards(inst.skills, 'skill')}
          </div>
        `
      }
      if (inst.memories.length > 0) {
        body += `
          <div class="knowledge-section">
            <div class="knowledge-label memories">Memories</div>
            ${renderFileCards(inst.memories, 'memory')}
          </div>
        `
      }
      if (configFiles.length > 0) {
        body += `
          <div class="knowledge-section">
            <div class="knowledge-label config">Config</div>
            ${renderFileCards(configFiles, 'config-file')}
          </div>
        `
      }
      if (docFiles.length > 0) {
        body += `
          <div class="knowledge-section">
            <div class="knowledge-label docs">Workspace Docs</div>
            ${renderFileCards(docFiles, 'doc-file')}
          </div>
        `
      }
    }

    return `
      <details class="instance-card">
        <summary>
          <span class="instance-name mono">${escapeHtml(inst.instance)}</span>
          <span class="instance-meta">${escapeHtml(meta || 'empty')}</span>
        </summary>
        <div class="instance-body">${body}</div>
      </details>
    `
  }).join('')

  return `
    <div class="section">
      <div class="section-title">Instance Deep Dives</div>
${cards}
    </div>
  `
}

function renderFooter(): string {
  const now = new Date().toISOString()
  return `
    <div class="footer">
      <p>Generated by <strong>Reef</strong> Fleet Insights</p>
      <p style="margin-top:0.25rem;">${escapeHtml(now)}</p>
    </div>
  `
}

export function generateFleetReport(fleet: FleetKnowledge, workspaceLabel?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fleet Insights${workspaceLabel ? ` — ${escapeHtml(workspaceLabel)}` : ''}</title>
  <style>${getStyles()}</style>
</head>
<body>
  ${renderHeader(workspaceLabel)}
  ${renderSummaryCards(fleet)}
  ${renderFleetNarrative(fleet)}
  ${renderLearningOpportunities(fleet)}
  ${renderSkillMatrix(fleet)}
  ${renderInstanceDetails(fleet)}
  ${renderFooter()}
</body>
</html>`
}
