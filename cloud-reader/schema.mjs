import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const cloudMaterials = sqliteTable('cloud_materials', {
  url: text('url').primaryKey(),
  articleId: integer('article_id').notNull().unique(),
  publishedAt: text('published_at'),
  payload: text('payload').notNull(),
});
export const cloudState = sqliteTable('cloud_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
