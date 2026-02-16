export interface LessonMeta {
  id: number;
  title: string;
  hasNouns: boolean;
  hasVerbs: boolean;
}

export interface LessonIndex {
  lessons: LessonMeta[];
}
