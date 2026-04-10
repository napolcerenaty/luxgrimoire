import PersonPage from "./PersonPage";

export default function AuthorPage({ authorId, onBack, onBookClick }) {
  return (
    <PersonPage
      personId={authorId}
      apiBase="authors"
      sectionTitle="Books by"
      onBack={onBack}
      onBookClick={onBookClick}
    />
  );
}
