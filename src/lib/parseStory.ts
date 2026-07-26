/**
 * Client-side extraction of plain text from story files.
 * PDF → pdfjs-dist, DOC/DOCX → mammoth, TXT → FileReader.
 */

export type SupportedKind = 'pdf' | 'doc' | 'txt' | 'unknown'

export function detectKind(file: File): SupportedKind {
  const name = file.name.toLowerCase()
  const type = file.type

  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    type === 'application/msword' ||
    type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.doc') ||
    name.endsWith('.docx')
  )
    return 'doc'
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md'))
    return 'txt'
  return 'unknown'
}

export async function extractTextFromFile(file: File): Promise<{
  text: string
  source: 'pdf' | 'doc' | 'txt'
}> {
  const kind = detectKind(file)
  if (kind === 'unknown') {
    throw new Error(
      'Unsupported file type. Please upload PDF, DOC/DOCX, or plain text.',
    )
  }

  if (kind === 'txt') {
    const text = await file.text()
    return { text, source: 'txt' }
  }

  if (kind === 'doc') {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return { text: result.value.trim(), source: 'doc' }
  }

  // PDF
  const pdfjs = await import('pdfjs-dist')
  // Use CDN worker so Vite doesn't need a separate worker build step
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const strings = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
    pages.push(strings.join(' '))
  }

  return { text: pages.join('\n\n').trim(), source: 'pdf' }
}

export function guessTitle(text: string, fileName?: string): string {
  if (fileName) {
    const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')
    if (base.trim()) return base.trim()
  }
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (firstLine && firstLine.length < 80) return firstLine
  return 'Untitled Story'
}

/** Lightweight local character heuristic when backend is offline */
export function extractCharactersLocally(text: string): {
  id: string
  name: string
  role?: string
  description?: string
  avatar_color: string
}[] {
  const colors = [
    '#e8a45a',
    '#c97b84',
    '#7eb8a2',
    '#8b9dc9',
    '#c9a87e',
    '#a78bc9',
  ]

  // "Name said/asked/thought" patterns + Title Case multi-word names
  const spoken = [
    ...text.matchAll(
      /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:said|asked|whispered|replied|shouted|murmured|thought|smiled|laughed|cried|answered)\b/g,
    ),
  ].map((m) => m[1])

  const dialogueTag = [
    ...text.matchAll(
      /["“][^"”]+["”]\s*(?:said|asked|replied)?\s*([A-Z][a-z]+)/g,
    ),
  ].map((m) => m[1])

  const counts = new Map<string, number>()
  for (const n of [...spoken, ...dialogueTag]) {
    if (STOP_NAMES.has(n)) continue
    counts.set(n, (counts.get(n) || 0) + 1)
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  if (ranked.length === 0) {
    return [
      {
        id: 'char-protagonist',
        name: 'Protagonist',
        role: 'Lead',
        description:
          'Primary voice of the story, identified from the supplied draft.',
        avatar_color: colors[0],
      },
      {
        id: 'char-narrator',
        name: 'Narrator',
        role: 'Guide',
        description: 'Knows the full story context and can discuss plot structure.',
        avatar_color: colors[1],
      },
    ]
  }

  return ranked.map(([name], i) => ({
    id: `char-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    role: i === 0 ? 'Likely lead' : 'Supporting',
    description: `Mentioned ${counts.get(name)} time(s) in dialogue tags (offline extract).`,
    avatar_color: colors[i % colors.length],
  }))
}

const STOP_NAMES = new Set([
  'He',
  'She',
  'They',
  'It',
  'The',
  'Then',
  'When',
  'What',
  'Where',
  'Who',
  'Why',
  'How',
  'Yes',
  'No',
  'Chapter',
  'One',
  'Two',
  'Three',
])
