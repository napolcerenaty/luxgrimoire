// Re-exported from the shared package so the API can use the same formatting logic
// (notification copy) without duplicating it — this file stays so the ~18 existing
// `@/lib/editionTitle` imports across the web app don't all need touching.
export { formatEditionDisplayTitle } from '@luxgrimoire/shared-types';
