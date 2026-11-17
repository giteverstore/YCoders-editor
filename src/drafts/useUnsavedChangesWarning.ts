import { useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

export function useUnsavedChangesWarning(enabled: boolean) {
  const blocker = useBlocker(enabled)
  useEffect(() => {
    if (!enabled) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [enabled])
  const stay = useCallback(() => { if (blocker.state === 'blocked') blocker.reset() }, [blocker])
  const discard = useCallback(() => { if (blocker.state === 'blocked') blocker.proceed() }, [blocker])
  return { isOpen: blocker.state === 'blocked', stay, discard }
}

export function shouldShowNavigationConfirmation(enabled: boolean, blockerState: 'unblocked' | 'blocked' | 'proceeding'): boolean { return enabled && blockerState === 'blocked' }
