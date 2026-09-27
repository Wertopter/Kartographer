export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number
): ((...args: Args) => void) & { flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Args | null = null
  let last = 0
  const invoke = (args: Args): void => {
    last = Date.now()
    fn(...args)
  }
  const wrapped = ((...args: Args) => {
    const remaining = wait - (Date.now() - last)
    pending = args
    if (remaining <= 0) {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
      invoke(args)
      return
    }
    if (!timer) {
      timer = setTimeout(() => {
        timer = null
        if (!pending) return
        const argsToSend = pending
        pending = null
        invoke(argsToSend)
      }, remaining)
    }
  }) as ((...args: Args) => void) & { flush: () => void }
  wrapped.flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!pending) return
    const argsToSend = pending
    pending = null
    invoke(argsToSend)
  }
  return wrapped
}
