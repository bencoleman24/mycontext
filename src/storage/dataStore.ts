export interface CollectionStore<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  upsert(item: T): Promise<T>;
  delete(id: string): Promise<boolean>;
  /** Deletes every item matching the predicate; returns how many were removed. */
  deleteMany(predicate: (item: T) => boolean): Promise<number>;
}

export interface SingletonStore<T> {
  read(): Promise<T | null>;
  write(value: T): Promise<T>;
}
