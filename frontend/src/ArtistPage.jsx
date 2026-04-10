import PersonPage from "./PersonPage";

export default function ArtistPage({ artistId, onBack, onBookClick }) {
  return (
    <PersonPage
      personId={artistId}
      apiBase="artists"
      secondaryLabel="Specialty"
      secondaryField="specialty"
      sectionTitle="Cover art by"
      onBack={onBack}
      onBookClick={onBookClick}
    />
  );
}
