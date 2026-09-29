export type Tool = 'pan' | 'pointer' | 'reveal' | 'hide' | 'token' | 'grid' | 'ruler'

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}
