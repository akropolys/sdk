// Two automatic recoveries per user-started call; ready frames do not reset the budget.
export class VoiceRecovery {
  private attempts = 0;

  static canRetry(code: number): boolean {
    return code === 1006 || code === 1011 || code === 1012 || code === 1013;
  }

  nextDelay(): number | null {
    return [500, 1500][this.attempts++] ?? null;
  }
}

interface Turn { role: 'user' | 'assistant'; text: string; done: boolean }

// React may not have rendered the last transcript before a transport closes.
export function recoveredTurns(turns: Turn[], heard: string, said: string): Turn[] {
  const result = turns.map(turn => ({ ...turn }));
  for (const [role, text] of [['user', heard], ['assistant', said]] as const) {
    if (!text.trim()) continue;
    let index = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].role === role && !result[i].done) { index = i; break; }
    }
    // A user turn is marked done when the assistant starts speaking.
    if (index < 0 && role === 'user') {
      const lastUser = result.map(turn => turn.role).lastIndexOf('user');
      if (lastUser >= 0 && result[lastUser].text === text.trim()) continue;
    }
    if (index >= 0) result[index].text = text.trim();
    else result.push({ role, text: text.trim(), done: true });
  }
  return result.map(turn => ({ ...turn, done: true }));
}
