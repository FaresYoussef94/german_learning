export interface LessonMeta {
  id: number;
  title: string;
}

export interface LessonIndex {
  lessons: LessonMeta[];
}

export interface Noun {
  word: string;
  article: string;
  plural: string;
  english: string;
}

export interface Verb {
  infinitive: string;
  perfectForm: string;
  case: string;
  english: string;
  // Present-tense conjugations (populated from Wiktionary during ingestion)
  ich?: string;
  du?: string;
  erSieEs?: string;
  wir?: string;
  ihr?: string;
  sieSie?: string;
}

export interface Question {
  type: "multiple_choice" | "fill_blank" | "translation" | "article";
  topic: string;
  question: string;
  options?: string[];
  answer: string;
}

export interface LessonDetail extends LessonMeta {
  nouns: Noun[];
  verbs: Verb[];
  exercises: {
    nouns: Question[];
    verbs: Question[];
  };
}
