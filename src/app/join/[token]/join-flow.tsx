'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, inputClass } from '@/components/ui/field'
import { isValidVpa } from '@/lib/upi/link'
import { applyPulledGroup } from '@/lib/store/store'
import { joinGroup, previewInvite, type InvitePreview } from '@/lib/sync/actions'

type Stage =
  | { kind: 'loading' }
  | { kind: 'ready'; preview: InvitePreview }
  | { kind: 'error'; message: string }

/**
 * The other end of an invite link.
 *
 * You say who you are here. The person who made the group cannot spell your
 * name for you and certainly cannot know your UPI ID, and a VPA typed by
 * somebody else is a payment to a stranger waiting to happen.
 */
export function JoinFlow({ token }: { token: string }) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>({ kind: 'loading' })
  const [name, setName] = useState('')
  const [vpa, setVpa] = useState('')
  const [seatId, setSeatId] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    previewInvite(token).then((preview) => {
      if (!live) return
      if (!preview.ok) {
        setStage({ kind: 'error', message: preview.message ?? 'That link is not valid.' })
        return
      }
      if (preview.alreadyIn) setName(preview.alreadyIn)
      setStage({ kind: 'ready', preview })
    })
    return () => {
      live = false
    }
  }, [token])

  const vpaLooksWrong = vpa.trim() !== '' && !isValidVpa(vpa.trim())

  const join = async () => {
    setBusy(true)
    setProblem(null)
    const result = await joinGroup(token, { seatId, name, vpa })
    setBusy(false)
    if (!result.ok || !result.payload) {
      setProblem(result.message ?? 'That did not work.')
      return
    }
    applyPulledGroup(result.payload, result.meId)
    router.push(`/app/g/${result.payload.group.id}`)
  }

  if (stage.kind === 'loading') {
    return (
      <Shell>
        <p className="mt-6 text-lg text-muted">Checking that link…</p>
      </Shell>
    )
  }

  if (stage.kind === 'error') {
    return (
      <Shell>
        <h1 className="mt-4 font-display text-4xl leading-tight">{stage.message}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Ask whoever runs the group to send the link again.
        </p>
        <Button className="mt-8 self-start" onClick={() => router.push('/app')}>
          Go to your groups
        </Button>
      </Shell>
    )
  }

  const { preview } = stage
  const seats = preview.freeSeats ?? []

  return (
    <Shell>
      <h1 className="mt-4 font-display text-4xl leading-tight">
        Join <span className="text-pos">{preview.groupName}</span>
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        {preview.alreadyIn
          ? `You are already ${preview.alreadyIn} here. You can fix your name or UPI ID below.`
          : 'Tell them who you are. This phone becomes you in the group, with no account and nothing to install.'}
      </p>

      <div className="mt-8 space-y-6">
        {seats.length > 0 && !preview.alreadyIn && (
          <Field
            label="Are you one of these?"
            hint="Names already in the group that nobody has claimed."
          >
            <div className="flex flex-wrap gap-2">
              {seats.map((seat) => (
                <button
                  key={seat.personId}
                  type="button"
                  onClick={() => {
                    setSeatId(seat.personId)
                    setName(seat.name)
                  }}
                  aria-pressed={seatId === seat.personId}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    seatId === seat.personId
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule hover:border-ink'
                  }`}
                >
                  {seat.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSeatId(undefined)
                  setName('')
                }}
                aria-pressed={seatId === undefined}
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  seatId === undefined
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule hover:border-ink'
                }`}
              >
                I&rsquo;m someone else
              </button>
            </div>
          </Field>
        )}

        <Field label="Your name">
          <input
            className={inputClass}
            value={name}
            autoFocus
            placeholder="Rahul"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Your UPI ID"
          hint="Optional, and only you can get it right. It is what people tap to pay you, prefilled with the exact amount."
          error={vpaLooksWrong ? 'That does not look like a UPI ID. Example: rahul@okhdfcbank' : undefined}
        >
          <input
            className={inputClass}
            value={vpa}
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="rahul@okhdfcbank"
            onChange={(event) => setVpa(event.target.value)}
          />
        </Field>

        {problem && <p className="text-sm text-neg">{problem}</p>}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={busy || name.trim() === '' || vpaLooksWrong}
          onClick={join}
        >
          {busy ? 'Joining…' : preview.alreadyIn ? 'Save and open' : 'Join the group'}
        </Button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        You have been invited to a group
      </p>
      {children}
    </main>
  )
}
