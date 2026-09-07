'use client'

import { useEffect, useRef } from 'react'
import {
  applyPulledGroup,
  getState,
  setSyncHandler,
  type SyncEvent,
} from '../store/store'
import { payloadFor } from './payload'
import { pullGroup, removeExpense, removeSettlement, shareGroup } from './actions'

/** How often a visible shared group checks for other people's changes. */
const POLL_MS = 20_000

/**
 * Keep one shared group in step with the server.
 *
 * Pull on open, on regaining focus, and on a slow poll while the tab is
 * actually visible. Deliberately not a websocket: people open this app, look,
 * and put the phone away, so a poll costs almost nothing and needs no new
 * infrastructure. A hidden tab polls not at all.
 *
 * Pull is a replace, because for a shared group the server is the authority.
 * That is only safe because every local write pushes first, so there is never
 * an unsent change for a pull to discard.
 */
export function useGroupSync(groupId: string, shared: boolean) {
  const busy = useRef(false)

  useEffect(() => {
    if (!shared) return

    let live = true

    const pull = async () => {
      if (busy.current || document.visibilityState !== 'visible') return
      busy.current = true
      try {
        const result = await pullGroup(groupId)
        if (live && result.ok && result.payload) {
          applyPulledGroup(result.payload, result.meId)
        }
      } finally {
        busy.current = false
      }
    }

    void pull()
    const timer = setInterval(() => void pull(), POLL_MS)
    const onVisible = () => void pull()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [groupId, shared])
}

/**
 * Send this device's copy of a group up after a local change.
 *
 * Upserts only. It never deletes and never downgrades a confirmed payment, so
 * a device that has not pulled in a while cannot undo somebody else's work by
 * pushing; deletions travel as their own operations instead.
 */
export async function pushGroup(groupId: string) {
  const state = getState()
  const group = state.groups.find((g) => g.id === groupId)
  if (!group?.shared) return

  const payload = payloadFor(state, groupId)
  if (payload) await shareGroup(payload, state.meId)
}

/**
 * Send local writes up as they happen.
 *
 * Registered once for the whole app rather than per group, so a write still
 * reaches the server when it happens on a screen that is not the group page.
 * Deletions go as their own operation because a push only ever upserts: a
 * device that has not pulled recently must not be able to remove rows it
 * simply has not heard about yet.
 */
export function useSyncHandler() {
  useEffect(() => {
    const handle = (event: SyncEvent) => {
      void (async () => {
        try {
          if (event.kind === 'expense-deleted') {
            await removeExpense(event.groupId, event.id)
          } else if (event.kind === 'settlement-deleted') {
            await removeSettlement(event.groupId, event.id)
          } else {
            await pushGroup(event.groupId)
          }
        } catch {
          // Offline, or the server said no. The write is already local, and the
          // next pull reconciles. Losing a sync is not losing the bill.
        }
      })()
    }
    setSyncHandler(handle)
    return () => setSyncHandler(null)
  }, [])
}
