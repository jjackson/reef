import type { FleetKnowledge, InstanceKnowledge } from './insights'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .card {
      background: white; border: 1px solid var(--slate-200); border-radius: 0.75rem;
      padding: 1.25rem; text-align: center;
    }
    .card .value { font-size: 1.75rem; font-weight: 700; }
    .card .label { font-size: 0.75rem; color: var(--slate-500); margin-top: 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .card.indigo .value { color: var(--indigo-600); }
    .card.amber .value { color: var(--amber-600); }
    .card.emerald .value { color: var(--emerald-600); }

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
    .matrix-table td.skill-name { text-align: left; font-weight: 500; }
    .matrix-table td.skill-name code { font-size: 0.8rem; color: var(--indigo-700); }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--indigo-500); }
    .dot-empty { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--slate-200); }
    .instance-name-header {
      writing-mode: vertical-lr; text-orientation: mixed; transform: rotate(180deg);
      font-size: 0.65rem; white-space: nowrap; max-height: 8rem;
    }

    .instance-card {
      background: white; border: 1px solid var(--slate-200); border-radius: 0.75rem;
      margin-bottom: 1rem; overflow: hidden;
    }
    .instance-card summary {
      padding: 0.875rem 1.25rem; cursor: pointer; display: flex;
      align-items: center; justify-content: space-between;
      background: var(--slate-50); border-bottom: 1px solid var(--slate-200);
      list-style: none;
    }
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
    .file-card .file-date { font-size: 0.7rem; color: var(--slate-400); margin-left: auto; }
    .file-content {
      padding: 0.75rem; background: var(--slate-50); border-top: 1px solid var(--slate-100);
      font-size: 0.8rem; white-space: pre-wrap; word-wrap: break-word;
      max-height: 500px; overflow-y: auto;
    }

    .badge {
      display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px;
      font-size: 0.7rem; font-weight: 500;
    }
    .badge.indigo { background: var(--indigo-50); color: var(--indigo-700); }
    .badge.amber { background: var(--amber-50); color: var(--amber-700); }
    .badge.emerald { background: var(--emerald-50); color: var(--emerald-700); }

    .copy-cmd {
      display: block; padding: 0.5rem 0.75rem; background: var(--slate-800);
      color: var(--slate-200); border-radius: 0.375rem; font-size: 0.75rem;
      overflow-x: auto; white-space: nowrap; margin-top: 0.25rem;
    }

    .localhost-notice {
      background: var(--amber-50); border: 1px solid var(--amber-100);
      border-radius: 0.5rem; padding: 0.75rem 1rem; font-size: 0.75rem;
      color: var(--amber-700); margin-bottom: 1.5rem;
    }
    .localhost-badge {
      display: inline-block; padding: 0 0.375rem; background: var(--slate-100);
      border-radius: 0.25rem; font-size: 0.65rem; color: var(--slate-500);
      margin-left: 0.25rem; vertical-align: middle;
    }

    .footer {
      margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--slate-200);
      text-align: center; font-size: 0.75rem; color: var(--slate-400);
    }

    .empty { color: var(--slate-400); font-style: italic; font-size: 0.8rem; padding: 0.5rem 0; }

    @media print {
      body { padding: 0; max-width: none; }
      .instance-card, .file-card { break-inside: avoid; }
      details[open] summary ~ * { display: block !important; }
      .localhost-notice, .localhost-badge { display: none; }
    }

    @media (max-width: 768px) {
      body { padding: 1rem; }
      .cards { grid-template-columns: repeat(2, 1fr); }
      .matrix-table { font-size: 0.7rem; }
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
  const coverage = instanceCount > 0 ? Math.round((withSkills / instanceCount) * 100) : 0

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
        <div class="value">${coverage}%</div>
        <div class="label">Skill Coverage</div>
      </div>
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

  const headerCells = instanceIds.map(id =>
    `<th><span class="instance-name-header mono">${escapeHtml(id)}</span></th>`
  ).join('')

  const rows = skills.map(([skillName, owners]) => {
    const cells = instanceIds.map(id => {
      const has = instanceSkillSets.get(id)?.has(skillName)
      if (has) return '<td><span class="dot" title="Has skill"></span></td>'

      // Show copy command for missing skills — pick the first owner as source
      const source = owners[0]
      const cmd = `reef ssh ${source} "cat ~/.openclaw/workspace/skills/${skillName}/SKILL.md" | reef ssh ${id} "mkdir -p ~/.openclaw/workspace/skills/${skillName} && cat > ~/.openclaw/workspace/skills/${skillName}/SKILL.md"`
      return `<td><span class="dot-empty" title="Missing — copy from ${escapeHtml(source)}&#10;${escapeHtml(cmd)}"></span></td>`
    }).join('')

    return `<tr><td class="skill-name"><code>${escapeHtml(skillName)}</code></td>${cells}</tr>`
  }).join('')

  return `
    <div class="section">
      <div class="section-title">Skill Distribution Matrix</div>
      <div style="overflow-x: auto;">
        <table class="matrix-table">
          <thead><tr><th class="skill-name">Skill</th>${headerCells}</tr></thead>
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

function renderFileCards(
  files: { name: string; content: string; lastModified: string }[],
  type: 'skill' | 'memory' | 'identity-file',
  instanceId: string
): string {
  return files.map(f => {
    const browseUrl = type === 'skill'
      ? `http://localhost:3050/api/instances/${encodeURIComponent(instanceId)}/browse/read?path=~/.openclaw/workspace/skills/${encodeURIComponent(f.name)}/SKILL.md`
      : type === 'memory'
      ? `http://localhost:3050/api/instances/${encodeURIComponent(instanceId)}/browse/read?path=~/.openclaw/workspace/memory/${encodeURIComponent(f.name)}`
      : `http://localhost:3050/api/instances/${encodeURIComponent(instanceId)}/browse/read?path=~/.openclaw/workspace/${encodeURIComponent(f.name)}`

    const dateStr = formatDate(f.lastModified)
    return `
      <details class="file-card">
        <summary>
          <span class="file-name ${type} mono">${escapeHtml(f.name)}</span>
          <a href="${escapeHtml(browseUrl)}" target="_blank" title="View in Reef">view<span class="localhost-badge">localhost:3050</span></a>
          ${dateStr ? `<span class="file-date">${escapeHtml(dateStr)}</span>` : ''}
        </summary>
        <pre class="file-content mono">${escapeHtml(f.content)}</pre>
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
    const totalFiles = inst.skills.length + inst.memories.length + inst.identity.length
    const meta = [
      inst.skills.length > 0 ? `${inst.skills.length} skill${inst.skills.length !== 1 ? 's' : ''}` : null,
      inst.memories.length > 0 ? `${inst.memories.length} memor${inst.memories.length !== 1 ? 'ies' : 'y'}` : null,
      inst.identity.length > 0 ? `${inst.identity.length} identity` : null,
    ].filter(Boolean).join(', ')

    let body = ''
    if (totalFiles === 0) {
      body = '<div class="empty">No knowledge files found</div>'
    } else {
      if (inst.identity.length > 0) {
        body += `
          <div class="knowledge-section">
            <div class="knowledge-label identity">Identity Files</div>
            ${renderFileCards(inst.identity, 'identity-file', inst.instance)}
          </div>
        `
      }
      if (inst.skills.length > 0) {
        body += `
          <div class="knowledge-section">
            <div class="knowledge-label skills">Skills</div>
            ${renderFileCards(inst.skills, 'skill', inst.instance)}
          </div>
        `
      }
      if (inst.memories.length > 0) {
        body += `
          <div class="knowledge-section">
            <div class="knowledge-label memories">Memories</div>
            ${renderFileCards(inst.memories, 'memory', inst.instance)}
          </div>
        `
      }
    }

    return `
      <details class="instance-card" ${totalFiles > 0 ? '' : ''}>
        <summary>
          <span style="display:flex;align-items:center;">
            <span class="instance-name mono">${escapeHtml(inst.instance)}</span>
          </span>
          <span class="instance-meta">${escapeHtml(meta || 'empty')}</span>
        </summary>
        <div class="instance-body">${body}</div>
      </details>
    `
  }).join('')

  return `
    <div class="section">
      <div class="section-title">Instance Deep Dives</div>
      <div class="localhost-notice">
        Links in this report point to <strong>localhost:3050</strong> and require the Reef dev server to be running locally.
      </div>
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
  ${renderSkillMatrix(fleet)}
  ${renderInstanceDetails(fleet)}
  ${renderFooter()}
</body>
</html>`
}
