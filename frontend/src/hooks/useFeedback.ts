import { type Question } from "./useExercises";

const FEEDBACK_API = import.meta.env.VITE_FEEDBACK_API_URL ?? "";

/**
 * Delete a question permanently from DynamoDB.
 */
export async function deleteQuestion(
  level: string,
  lessonId: number,
  exerciseType: "nouns" | "verbs",
  question: string
): Promise<void> {
  const url = `${FEEDBACK_API}/${level}/${lessonId}/${exerciseType}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `HTTP ${res.status}`);
  }
}

/**
 * Regenerate a question using Bedrock with user feedback.
 * Returns the new Question object (does NOT update DynamoDB yet).
 */
export async function regenerateQuestion(
  level: string,
  lessonId: number,
  exerciseType: "nouns" | "verbs",
  question: string,
  feedback: string
): Promise<Question> {
  const url = `${FEEDBACK_API}/${level}/${lessonId}/${exerciseType}/regenerate`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, feedback }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.question as Question;
}

/**
 * Replace an old question with a new one in DynamoDB.
 */
export async function replaceQuestion(
  level: string,
  lessonId: number,
  exerciseType: "nouns" | "verbs",
  oldQuestion: string,
  newQuestion: Question
): Promise<void> {
  const url = `${FEEDBACK_API}/${level}/${lessonId}/${exerciseType}/replace`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldQuestion, newQuestion }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `HTTP ${res.status}`);
  }
}
