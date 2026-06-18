import { ArtistTabs } from './ArtistTabs'

export async function ArtistContributionsSection({ artistSlug }: { artistSlug: string }) {
  return <ArtistTabs artistSlug={artistSlug} />
}
