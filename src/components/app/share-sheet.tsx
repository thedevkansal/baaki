'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { getState, markShared } from '@/lib/store/store'
import { useAppState } from '@/lib/store/use-store'
import type { Group } from '@/lib/store/types'
import { payloadFor, type JoinLink } from '@/lib/sync/payload'
import { reissueLink, shareGroup } from '@/lib/sync/actions'

/**
 * Hand the group to the people in it.
 *
 * Its own screen rather than a section of settings: this is the thing that
 * turns a private tally into a shared one, and it is what somebody goes looking
 * for. Renaming and deleting a group are housekeeping; this is not.
 */
export function ShareSheet({
  open,
  onOpenChange,
  group,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
}) {
  const myId = useAppState().meId
  const [links, setLinks] = useState<JoinLink[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const share = async () => {
    setBusy(true)
    setError(null)
    const state = getState()
    const payload = payloadFor(state, group.id)
    if (!payload) {
      setError('That group could not be read.')
      setBusy(false)
      return
    }
    const result = await shareGroup(payload, state.meId)
    setBusy(false)
    if (!result.ok || !result.links) {
      setError(result.message ?? 'The group could not be shared.')
      return
    }
    markShared(group.id)
    setLinks(result.links)
  }

  const copy = (link: JoinLink) => {
    if (!link.url) return
    void navigator.clipboard.writeText(link.url)
    setCopied(link.personId)
  }

  const reissue = async (personId: string) => {
    setBusy(true)
    const result = await reissueLink(group.id, personId)
    setBusy(false)
    if (!result.ok || !result.url) {
      setError(result.message ?? 'A new link could not be made.')
      return
    }
    void navigator.clipboard.writeText(result.url)
    setCopied(personId)
    setLinks(
      (current) =>
        current?.map((l) =>
          l.personId === personId ? { ...l, url: result.url!, claimed: false } : l,
        ) ?? null,
    )
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Share this group"
      description={
        group.shared
          ? 'Everyone here has their own copy. Balances stay in step across all of them.'
          : 'Give each person their own link. They open it and that phone becomes them, with no account and nothing to install.'
      }
      footer={
        <Button variant="primary" className="w-full" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <div className="space-y-6">
        {!group.shared && (
          <Button variant="primary" className="w-full" disabled={busy} onClick={share}>
            {busy ? 'Sharing…' : 'Share this group'}
          </Button>
        )}

        {group.shared && !links && (
          <Button className="w-full" disabled={busy} onClick={share}>
            {busy ? 'Loading…' : 'Show the links'}
          </Button>
        )}

        {error && <p className="text-sm text-neg">{error}</p>}

        {links && (
          <ul className="space-y-2">
            {links.map((link) => (
              <li
                key={link.personId}
                className="flex items-center gap-3 rounded-xl border border-rule px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {link.name}
                  {link.personId === myId && (
                    <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                      you
                    </span>
                  )}
                </span>

                {link.personId === myId ? (
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                    this device
                  </span>
                ) : link.claimed || !link.url ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-pos">
                      joined
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => reissue(link.personId)}>
                      {copied === link.personId ? 'New link copied' : 'New link'}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => copy(link)}>
                    {copied === link.personId ? 'Copied' : 'Copy link'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {links && (
          <div className="space-y-3 rounded-xl border border-rule px-4 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              What a link is
            </p>
            <p className="text-xs leading-relaxed text-muted">
              A link is that person&rsquo;s identity until accounts exist, so send each one
              to that person and nobody else. Whoever opens it first becomes them.
            </p>
            <p className="text-xs leading-relaxed text-muted">
              It stops working the moment it is used: the seat binds to that phone and the
              link is destroyed, so a forwarded copy is dead. If somebody loses their phone,
              &ldquo;New link&rdquo; releases their seat and issues a fresh one. Only this
              device can do that, because it shared the group.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  )
}
