import * as readline from 'readline'

/** Display a numbered menu to stderr and prompt the user to pick one. Returns the chosen item. */
export async function promptChoice<T>(
  label: string,
  items: T[],
  formatFn: (item: T, index: number) => string,
): Promise<T> {
  if (items.length === 0) throw new Error(`No options available for: ${label}`)

  process.stderr.write(`\n${label}\n`)
  for (let i = 0; i < items.length; i++) {
    process.stderr.write(`  ${i + 1}) ${formatFn(items[i], i)}\n`)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  try {
    while (true) {
      const answer = await new Promise<string>(resolve => rl.question('Choice: ', resolve))
      const num = parseInt(answer.trim(), 10)
      if (num >= 1 && num <= items.length) return items[num - 1]
      process.stderr.write(`Please enter a number between 1 and ${items.length}\n`)
    }
  } finally {
    rl.close()
  }
}

/** Prompt y/N confirmation on stderr. Returns true if user confirms. */
export async function promptConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  try {
    const answer = await new Promise<string>(resolve => rl.question(`${message} [y/N]: `, resolve))
    return answer.trim().toLowerCase() === 'y'
  } finally {
    rl.close()
  }
}
