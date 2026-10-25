export const UNTITLED_SESSION_LABEL = "Untitled session";

export function displaySessionLabel(label: string | null | undefined): string {
  return label?.trim() || UNTITLED_SESSION_LABEL;
}
