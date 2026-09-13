export interface CollectionStore<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  upsert(item: T): Promise<T>;
  delete(id: string): Promise<boolean>;
  /** Deletes every item matching the predicate; returns how many were removed. */
  deleteMany(predicate: (item: T) => boolean): Promise<number>;
  /** Read, change, and write as one step that no other writer can interleave with. */
  update<R>(mutate: (items: T[]) => R | Promise<R>): Promise<R>;
}

export interface SingletonStore<T> {
  read(): Promise<T | null>;
  write(value: T): Promise<T>;
  /** Read, change, and write as one step that no other writer can interleave with. */
  update(change: (current: T | null) => T | Promise<T>): Promise<T>;
}
