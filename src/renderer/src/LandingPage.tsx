import { useEffect, useState } from 'react'
import type { GmState } from '@shared/types'

type Props = {
  onHost: () => void
  onJoin: (name: string, code: string) => void
}

type Pane = 'home' | 'host' | 'join'

function useLibrary(): GmState | null {
  const [state, setState] = useState<GmState | null>(null)
  useEffect(() => {
    let live = false
    const unsubscribe = window.kartographer.onState((next) => {
      live = true
      setState(next)
    })
    void window.kartographer.getState().then((next) => {
      if (!live && next) setState(next)
    })
    return unsubscribe
  }, [])
  return state
}

export function LandingPage(props: Props): React.JSX.Element {
  const state = useLibrary()
  const [pane, setPane] = useState<Pane>('home')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  if (!state) {
    return (
      <div className="boot">
        <p className="wordmark">Kartographer</p>
        <p>Opening Kartographer…</p>
      </div>
    )
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <p className="wordmark">Kartographer</p>
        {pane === 'home' && (
          <>
            <p>Host a map for the table, or join one that is already being shared.</p>
            <div className="landing-choices">
              <button type="button" className="primary" onClick={() => setPane('host')}>
                Host a Campaign
              </button>
              <button type="button" onClick={() => setPane('join')}>
                Join a Campaign
              </button>
            </div>
          </>
        )}
        {pane === 'host' && (
          <>
            <p>Choose a campaign you have already made.</p>
            {state.recentCampaigns.length === 0 ? (
              <p className="hint">No campaigns yet. Create one in a folder, or open a folder that already has one.</p>
            ) : (
              <div className="campaign-list landing-campaigns">
                {state.recentCampaigns.map((campaign) => (
                  <button
                    key={campaign.path}
                    type="button"
                    className="campaign-open"
                    disabled={campaign.missing}
                    onClick={() => {
                      void window.kartographer.switchCampaign(campaign.path).then((opened) => {
                        if (opened) props.onHost()
                      })
                    }}
                  >
                    <span className="campaign-name">{campaign.name}</span>
                    <span className="campaign-path" title={campaign.path}>
                      {campaign.missing ? 'Folder missing' : campaign.path}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="tool-group">
              <button
                type="button"
                onClick={() => {
                  void window.kartographer.createCampaignFolder().then((opened) => {
                    if (opened) props.onHost()
                  })
                }}
              >
                New folder…
              </button>
              <button
                type="button"
                onClick={() => {
                  void window.kartographer.openCampaignFolder().then((opened) => {
                    if (opened) props.onHost()
                  })
                }}
              >
                Open folder…
              </button>
              <button type="button" onClick={() => setPane('home')}>
                Back
              </button>
            </div>
          </>
        )}
        {pane === 'join' && (
          <form
            className="join-card"
            onSubmit={(event) => {
              event.preventDefault()
              if (!name.trim() || !code.trim()) return
              props.onJoin(name.trim(), code.trim())
            }}
          >
            <p>Enter your name and the code from the host.</p>
            <label>
              Name
              <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Join code
              <input
                value={code}
                autoCapitalize="none"
                spellCheck={false}
                placeholder="xxxx-xxxx-xxxx"
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <div className="tool-group">
              <button type="submit" className="primary" disabled={!name.trim() || !code.trim()}>
                Join
              </button>
              <button type="button" onClick={() => setPane('home')}>
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
