export type Tool = 'pan' | 'pointer' | 'reveal' | 'hide' | 'token' | 'grid' | 'ruler' | 'stroke' | 'circle' | 'line'

/** Tools on a joined computer. They do not change the GM window or the table display. */
export type RemoteTool = 'pan' | 'pointer' | 'stroke' | 'circle' | 'line' | 'ruler'

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}
