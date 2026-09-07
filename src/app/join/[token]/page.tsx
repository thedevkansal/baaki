import { JoinFlow } from './join-flow'

export const metadata = {
  title: 'Join a group',
  robots: { index: false, follow: false },
}

/**
 * The other end of a join link.
 *
 * Nothing is claimed by loading this page. A link that is opened by a preview
 * bot, a chat app fetching a thumbnail, or the wrong person by accident must
 * not burn the seat, so taking it is a deliberate press.
 */
export default async function JoinPage({ params }: PageProps<'/join/[token]'>) {
  const { token } = await params
  return <JoinFlow token={token} />
}
