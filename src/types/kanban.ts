export type KanbanColumn = {
  id: string;
  title: string;
  color: string;
  order: number;
};

export const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'backlog', title: 'Backlog', color: '#6c7086', order: 0 },
  { id: 'todo', title: 'To Do', color: '#89b4fa', order: 1 },
  { id: 'doing', title: 'In Progress', color: '#fab387', order: 2 },
  { id: 'done', title: 'Done', color: '#a6e3a1', order: 3 },
];
