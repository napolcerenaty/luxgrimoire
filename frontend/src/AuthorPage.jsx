import PersonPage from "./PersonPage";

export default function AuthorPage({ authorId, onBack, onBookClick }) {
  return (
    <PersonPage
      personId={authorId}
      apiBase="authors"
      secondaryLabel="Nationality"
      secondaryField="nationality"
      sectionTitle="Editions featuring"
      onBack={onBack}
      onBookClick={onBookClick}
    />
  );
}
