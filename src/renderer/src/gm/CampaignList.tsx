import type { RecentCampaign } from '@shared/types'

type Props = {
  currentPath: string
  campaigns: RecentCampaign[]
  onCreate: () => void
  onBrowse: () => void
  onOpen: (path: string) => void
  onForget: (path: string) => void
}

export function CampaignList(props: Props): React.JSX.Element {
  return (
    <section className="campaigns">
      <div className="sidebar-head">
        <h2>Campaigns</h2>
      </div>
      <div className="campaign-actions">
        <button type="button" className="primary" onClick={props.onCreate}>
          New folder…
        </button>
        <button type="button" onClick={props.onBrowse}>
          Open folder…
        </button>
      </div>
      {props.campaigns.length === 0 ? (
        <p className="empty-copy">Each campaign is its own folder. Maps and tokens are saved inside it.</p>
      ) : (
        <div className="campaign-list">
          {props.campaigns.map((campaign) => {
            const current = campaign.path === props.currentPath
            return (
              <div key={campaign.path} className={current ? 'campaign-row current' : 'campaign-row'}>
                <button
                  type="button"
                  className="campaign-open"
                  disabled={campaign.missing}
                  aria-pressed={current}
                  onClick={() => props.onOpen(campaign.path)}
                >
                  <span className="campaign-name">{campaign.name}</span>
                  <span className="campaign-path" title={campaign.path}>
                    {campaign.missing ? 'Folder missing' : campaign.path}
                  </span>
                </button>
                {!current && (
                  <button
                    type="button"
                    className="danger campaign-forget"
                    title="Remove from this list. The folder stays on disk."
                    onClick={() => props.onForget(campaign.path)}
                  >
                    Remove
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
