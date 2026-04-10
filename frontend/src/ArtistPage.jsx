import PersonPage from "./PersonPage";

export default function ArtistPage({ artistId, onBack, onBookClick }) {
  return (
    <PersonPage
      personId={artistId}
      apiBase="artists"
      secondaryLabel="Specialty"
      secondaryField="specialty"
      sectionTitle="Art by"
      onBack={onBack}
      onBookClick={onBookClick}
    />
  );
}
