export type TagFilterOperator = 'AND' | 'OR';

export interface TagFilter {
  tags: string[];
  // operators[i] is the operator between tags[i] and tags[i+1]
  // Length is always tags.length - 1 (or 0 if tags.length <= 1)
  operators: TagFilterOperator[];
}
