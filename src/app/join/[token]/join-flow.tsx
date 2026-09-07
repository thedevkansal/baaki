'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { applyPulledGroup } from '@/lib/store/store'
import { claimSeat, previewClaim, type ClaimPreview } from '@/lib/sync/actions'

type Stage =
  | { kind: 'loading' }
  | { kind: 'ready'; preview: ClaimPreview }
  | { kind: 'joining' }
  | { kind: 'error'; message: string }

export function JoinFlow({ token }: { token: string }) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>({ kind: 'loading' })

  useEffect(() => {
    let live = true
    previewClaim(token).then((preview) => {
      if (!live) return
      setStage(
        preview.ok
          ? { kind: 'ready', preview }
          : { kind: 'error', message: preview.message ?? 'That link is not valid.' },
      )
    })
    return () => {
      live = false
    }
  }, [token])

  const join = async () => {
    setStage({ kind: 'joining' })
    const result = await claimSeat(token)
    if (!result.ok || !result.payload) {
      setStage({ kind: 'error', message: result.message ?? 'That did not work.' })
      return
    }
    applyPulledGroup(result.payload, result.meId)
    router.push(`/app/g/${result.payload.group.id}`)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        You have been added to a group
      </p>

      {stage.kind === 'loading' && (
        <p className="mt-6 text-lg text-muted">Checking that link…</p>
      )}

      {stage.kind === 'error' && (
        <>
          <h1 className="mt-4 font-display text-4xl leading-tight">{stage.message}</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Join links belong to one person and can only be used once. Ask whoever
            shared the group to send you a fresh one.
          </p>
          <Button className="mt-8 self-start" onClick={() => router.push('/app')}>
            Go to your groups
          </Button>
        </>
      )}

      {(stage.kind === 'ready' || stage.kind === 'joining') && (
        <ReadyState
          preview={stage.kind === 'ready' ? stage.preview : undefined}
          busy={stage.kind === 'joining'}
          onJoin={join}
        />
      )}
    </main>
  )
}

function ReadyState({
  preview,
  busy,
  onJoin,
}: {
  preview?: ClaimPreview
  busy: boolean
  onJoin: () => void
}) {
  if (!preview) return <p className="mt-6 text-lg text-muted">Joining…</p>

  if (preview.alreadyIn) {
    return (
      <>
        <h1 className="mt-4 font-display text-4xl leading-tight">
          This device is already {preview.alreadyIn} in {preview.groupName}.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          One device is one person per group. Otherwise you would be two people in
          the same ledger, each able to confirm the other&rsquo;s payments. Open this
          link on {preview.personName}&rsquo;s own phone.
        </p>
      </>
    )
  }

  if (preview.taken) {
    return (
      <>
        <h1 className="mt-4 font-display text-4xl leading-tight">
          Somebody already joined with this link.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          A link takes one seat and then stops working, so a forwarded link cannot
          quietly hand your place to someone else.
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="mt-4 font-display text-4xl leading-tight">
        You are <span className="text-pos">{preview.personName}</span> in{' '}
        {preview.groupName}.
      </h1>
      <p className="mt-5 text-sm leading-relaxed text-muted">
        Joining puts the group on this device and makes this browser that person.
        From then on only you can confirm a payment somebody says they made to you.
        No account, no email, nothing to install.
      </p>
      <Button variant="primary" size="lg" className="mt-8" disabled={busy} onClick={onJoin}>
        {busy
          ? 'Joining…'
          : preview.mine
            ? `Open ${preview.groupName}`
            : `Join as ${preview.personName}`}
      </Button>
      <p className="mt-5 font-mono text-[11px] leading-relaxed text-muted">
        Keep the link to yourself. Until it is used, whoever opens it becomes{' '}
        {preview.personName}.
      </p>
    </>
  )
}
