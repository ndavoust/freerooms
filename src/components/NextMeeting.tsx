import { meetingBar, type RoomMeeting } from '../nextMeeting.ts'
import { formatClock } from '../time.ts'

type NextMeetingProps = {
  meeting: RoomMeeting
  now: Date
  pending: boolean
  error: string | null
  onRelease: () => void
}

function widthOf(part: number, total: number): string {
  return `${(part / total) * 100}%`
}

function barLabel(meeting: RoomMeeting, now: Date): string {
  const when =
    meeting.start.getTime() > now.getTime()
      ? `commence à ${formatClock(meeting.start)}`
      : `commencée à ${formatClock(meeting.start)}`
  return `${meeting.roomName}, ${when}, jusqu’à ${formatClock(meeting.end)}`
}

export function NextMeeting({ meeting, now, pending, error, onRelease }: NextMeetingProps) {
  const bar = meetingBar(now, meeting.start, meeting.end)
  const total = bar.upcoming + bar.elapsed + bar.remaining
  if (total <= 0) return null

  const label = [meeting.summary, meeting.locationLabel].filter(Boolean).join(' · ')

  return (
    <section className="next-meeting" aria-labelledby="next-meeting-title">
      <div className="next-meeting-head">
        <h3 id="next-meeting-title" className="next-meeting-name">
          {meeting.roomName}
        </h3>
        {meeting.canRelease ? (
          <button
            type="button"
            className="release"
            disabled={pending}
            aria-busy={pending}
            onClick={() => {
              const confirmed = window.confirm(
                `Libérer ${meeting.roomName} ? La salle sera retirée de cette réunion.`,
              )
              if (confirmed) onRelease()
            }}
          >
            {pending ? 'Libération…' : 'Libérer'}
          </button>
        ) : null}
        {label ? <p className="next-meeting-label">{label}</p> : null}
      </div>
      <div className="meeting-bar" role="img" aria-label={barLabel(meeting, now)}>
        {bar.upcoming > 0 ? (
          <span className="meeting-bar-upcoming" style={{ width: widthOf(bar.upcoming, total) }} />
        ) : null}
        {bar.elapsed > 0 ? (
          <span className="meeting-bar-elapsed" style={{ width: widthOf(bar.elapsed, total) }} />
        ) : null}
      </div>
      <div className="bar-scale">
        <span>Maintenant</span>
        <span>{formatClock(meeting.end)}</span>
      </div>
      {error ? <p className="card-error">{error}</p> : null}
    </section>
  )
}
