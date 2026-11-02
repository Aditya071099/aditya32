export interface Audience {
  id: string;
  name: string;
  slug: string;
  postCount: number;
  createdAt: string;
}

/** An audience as embedded in a post. */
export interface AudienceRef {
  id: string;
  name: string;
  slug: string;
}

export interface AudienceInput {
  name: string;
  slug: string;
}
