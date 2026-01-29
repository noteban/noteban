export type NoteFrontmatter = {
  id: string;
  title: string;
  created: string;
  modified: string;
  date?: string;
  column: string;
  tags: string[];
  order: number;
};

export type Note = {
  frontmatter: NoteFrontmatter;
  content: string;
  file_path: string;
};

export type CreateNoteInput = {
  notes_dir: string;
  folder_path?: string;
  title: string;
  content?: string;
  date?: string;
  column?: string;
  tags?: string[];
};

export type UpdateNoteInput = {
  notes_dir: string;
  file_path: string;
  title?: string;
  content?: string;
  date?: string;
  column?: string;
  tags?: string[];
  order?: number;
};
