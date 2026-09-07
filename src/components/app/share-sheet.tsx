'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { getState, markShared } from '@/lib/store/store'
import { useAppState } from '@/lib/store/use-store'
import type { Group } from '@/lib/store/types'
import { payloadFor, type JoinLink } from '@/lib/sync/payload'
import { shareGroup } from '@/lib/sync/actions'

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
  const [invite, setInvite] = useState<string | null>(null)
  const [people, setPeople] = useState<JoinLink[] | null>(null)
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
    const result = await shareGroup(payload, group.meId ?? state.meId)
    setBusy(false)
    if (!result.ok || !result.inviteUrl) {
      setError(result.message ?? 'The group could not be shared.')
      return
    }
    markShared(group.id)
    setInvite(result.inviteUrl ?? null)
    setPeople(result.people ?? null)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Share this group"
      description={
        group.shared
          ? 'Everyone here has their own copy. Balances stay in step across all of them.'
          : 'One link for everyone. Whoever opens it says who they are and gives their own UPI ID.'
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

        {group.shared && !invite && (
          <Button className="w-full" disabled={busy} onClick={share}>
            {busy ? 'Loading…' : 'Show the link'}
          </Button>
        )}

        {error && <p className="text-sm text-neg">{error}</p>}

        {invite && (
          <div className="space-y-3 rounded-xl border border-rule bg-paper-raised px-4 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              The group&rsquo;s link
            </p>
            <p className="break-all font-mono text-xs leading-relaxed">{invite}</p>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                void navigator.clipboard.writeText(invite)
                setCopied('invite')
              }}
            >
              {copied === 'invite' ? 'Copied' : 'Copy link'}
            </Button>
            <p className="text-xs leading-relaxed text-muted">
              Send it to everyone. Each person says who they are and gives their own UPI
              ID, so neither is yours to get wrong.
            </p>
          </div>
        )}

        {people && people.length > 0 && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              Who is here
            </p>
            <ul className="mt-3 space-y-2">
              {people.map((person) => (
                <li
                  key={person.personId}
                  className="flex items-center gap-3 rounded-xl border border-rule px-4 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {person.name}
                    {person.personId === myId && (
                      <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                        you
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-mono text-[11px] uppercase tracking-[0.14em] ${
                      person.claimed ? 'text-pos' : 'text-muted'
                    }`}
                  >
                    {person.claimed ? 'joined' : 'not yet'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {invite && (
          <p className="text-xs leading-relaxed text-muted">
            Anyone with this link can join, so send it to the group and not to a public
            place. Somebody already in keeps their seat: the link cannot be used to take
            a name that is taken.
          </p>
        )}
      </div>
    </Sheet>
  )
}
